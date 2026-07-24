import { z } from "zod";
import { createItem, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── zod schemas (shared client + server) ───────────────────────────────────
export const HOW_HEARD_VALUES = [
  "search",
  "social",
  "referral",
  "news",
  "organization",
  "other",
] as const;

const passwordRule = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .refine((v) => /[A-Z]/.test(v), "Include at least one uppercase letter.")
  .refine((v) => /[a-z]/.test(v), "Include at least one lowercase letter.")
  .refine((v) => /[0-9]/.test(v), "Include at least one number.");

export const signupSchema = z.object({
  full_name: z.string().trim().min(2, "Tell us your full name.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(254),
  password: passwordRule,
  country_code: z
    .string()
    .length(2, "Pick your country.")
    .regex(/^[A-Z]{2}$/, "Pick your country."),
  phone: z
    .string()
    .trim()
    .min(5, "Enter your phone number.")
    .max(40)
    .regex(/^\+?[0-9 ()-]+$/, "Phone can only contain digits and + ( ) - spaces."),
  how_heard: z.enum(HOW_HEARD_VALUES).optional(),
  agreed_to_safeguarding: z.literal(true, {
    message: "You must agree to the safeguarding statement.",
  }),
  agreed_to_terms: z.literal(true, {
    message: "You must agree to the Terms of Service.",
  }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
});

// ─── OTP code generation ────────────────────────────────────────────────────
import { randomInt } from "node:crypto";

export function generateOtpCode(): string {
  // 100000–999999 inclusive — always 6 digits, never leading zero.
  return String(randomInt(100000, 1000000));
}

// ─── Rate limiting ──────────────────────────────────────────────────────────
//
// Uses the og_otp_request collection. Three windows enforced:
//   send-by-email:   3 per 15 min
//   verify-by-email: 5 per 15 min, then 60 min lockout
//   signup-by-ip:    5 per 60 min
//
// Rows are not auto-pruned — we just count rows in the relevant window.
// A periodic admin task can prune rows older than 24h.

// "password_change" added for the donor password-change throttle (#1).
// og_otp_request.kind is a free varchar (no CHECK/enum), so this is a new
// data value, not a schema change.
// "guest_donation" — the public guest-checkout init throttle
// (feat/quick-donation), keyed by IP. og_otp_request.kind is a free
// varchar (no CHECK/enum), so a new kind value is data, not schema.
type Kind = "send" | "verify" | "password_change" | "guest_donation";

export type RateLimitWindow = {
  kind: Kind;
  email?: string;
  ip?: string;
  windowMs: number;
  max: number;
};

export const RATE_LIMITS = {
  send_per_email: { kind: "send" as const, windowMs: 15 * 60 * 1000, max: 3 },
  verify_per_email: { kind: "verify" as const, windowMs: 15 * 60 * 1000, max: 5 },
  signup_per_ip: { kind: "send" as const, windowMs: 60 * 60 * 1000, max: 5 },
  // #1 — donor password-change throttle (per email): 5 changes / 15 min.
  password_change_per_email: {
    kind: "password_change" as const,
    windowMs: 15 * 60 * 1000,
    max: 5,
  },
  // feat/quick-donation — public guest-checkout init throttle (per IP):
  // 20 / 15 min. Deliberately GENEROUS: Bangladesh has heavy carrier-grade
  // NAT + shared wifi, so a mosque/office can legitimately produce many
  // donations from one IP. Server-computed amounts + Stripe Radar are the
  // real card-testing defence; this counter is a coarse backstop.
  guest_donation_per_ip: {
    kind: "guest_donation" as const,
    windowMs: 15 * 60 * 1000,
    max: 20,
  },
};

export async function recordOtpRequest({
  email,
  ip,
  kind,
}: {
  email: string;
  ip: string | null;
  kind: Kind;
}): Promise<void> {
  try {
    await directusServer().request(
      createItem("og_otp_request" as never, {
        email: email.toLowerCase(),
        ip_address: ip ?? null,
        kind,
      } as never),
    );
  } catch (err) {
    console.warn(
      "[donor-signup] recordOtpRequest failed (non-fatal)",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function countRecentRequests(opts: {
  email?: string;
  ip?: string;
  kind: Kind;
  windowMs: number;
}): Promise<number> {
  const since = new Date(Date.now() - opts.windowMs).toISOString();
  const filter: Record<string, unknown> = {
    _and: [
      { kind: { _eq: opts.kind } },
      { requested_at: { _gte: since } },
    ],
  };
  const andClause = filter._and as Array<Record<string, unknown>>;
  if (opts.email) andClause.push({ email: { _eq: opts.email.toLowerCase() } });
  if (opts.ip) andClause.push({ ip_address: { _eq: opts.ip } });

  try {
    const rows = (await directusServer().request(
      readItems("og_otp_request" as never, {
        filter,
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<unknown>;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[donor-signup] countRecentRequests failed (treating as 0)",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// ─── Email send ─────────────────────────────────────────────────────────────
//
// Email-refinement lot — migrated from a direct Resend SDK call + inline
// raw HTML string to the shared sendEmail() helper + OtpVerificationEmail
// React component. Two reasons for the migration:
//   1) The raw HTML didn't carry the standard EmailLayout chrome (logo,
//      cream background, standardized footer with Goodverse/CHT
//      attribution + printAgraphy credit). Every other transactional email
//      uses that frame; the OTP was the odd one out.
//   2) Two send paths (sendEmail() helper vs. direct Resend SDK) is a
//      maintenance trap — config bugs that affect one but not the other
//      are exactly what session 10 diagnostic surfaced. One path is easier
//      to reason about and easier to test.
//
// If RESEND_API_KEY is missing the helper logs the OTP to the server
// console and returns ok=true so dev/CI flows still work — same fallback
// behaviour as before, just routed through sendEmail() instead of
// instantiating Resend directly.

import { sendEmail } from "./email";
import { OtpVerificationEmail } from "@/emails/OtpVerificationEmail";

export async function sendOtpEmail({
  to,
  code,
  fullName,
}: {
  to: string;
  code: string;
  fullName: string;
}): Promise<{ ok: boolean; provider: "resend" | "console" }> {
  // sendEmail() returns { success: false, error: "RESEND_API_KEY not configured" }
  // when the key is unset, so the dev-fallback log lives here at the
  // signup-flow layer where we know what was supposed to ship.
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[donor-signup] RESEND_API_KEY not set — OTP for ${to}: ${code} (logged to server console only).`,
    );
    return { ok: true, provider: "console" };
  }

  try {
    const result = await sendEmail({
      to,
      subject: "Your OrphanGive verification code",
      template: OtpVerificationEmail({ code, fullName }),
    });
    if (!result.success) {
      console.error("[donor-signup] sendEmail returned !success", {
        to,
        error: result.error,
      });
      return { ok: false, provider: "resend" };
    }
    return { ok: true, provider: "resend" };
  } catch (err) {
    console.error("[donor-signup] sendEmail threw", err);
    return { ok: false, provider: "resend" };
  }
}
