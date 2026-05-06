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

type Kind = "send" | "verify";

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
// Resend integration. If RESEND_API_KEY is missing the helper logs the OTP
// to the server console and returns true so dev/CI flows still work — this
// is intentional fallback so a missing key doesn't break the signup flow.
// In production the key MUST be set; the absence is logged loudly.

export async function sendOtpEmail({
  to,
  code,
  fullName,
}: {
  to: string;
  code: string;
  fullName: string;
}): Promise<{ ok: boolean; provider: "resend" | "console" }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "OrphanGive <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(
      `[donor-signup] RESEND_API_KEY not set — OTP for ${to}: ${code} (logged to server console only).`,
    );
    return { ok: true, provider: "console" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { html, text } = renderOtpEmail({ code, fullName });
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "Your OrphanGive verification code",
      html,
      text,
    });
    if (error) {
      console.error("[donor-signup] resend send error", error);
      return { ok: false, provider: "resend" };
    }
    return { ok: true, provider: "resend" };
  } catch (err) {
    console.error("[donor-signup] resend send threw", err);
    return { ok: false, provider: "resend" };
  }
}

function renderOtpEmail({ code, fullName }: { code: string; fullName: string }) {
  const safeName = (fullName || "there").replace(/[<>"]/g, "").slice(0, 80);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Your OrphanGive verification code</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background:#FFFAF2; color:#2A2A2C; margin:0; padding:32px 16px; }
  .card { max-width: 520px; margin: 0 auto; background:#FFFFFF; border-radius:24px; padding:40px 32px; border:1px solid rgba(42,42,44,0.06); }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 400; line-height: 1.1; color:#2A2A2C; margin: 0 0 12px; letter-spacing: -0.02em; }
  p  { font-size: 15px; line-height: 1.6; color:#5C5C5E; margin: 0 0 16px; }
  .code { font-family: 'JetBrains Mono', SFMono-Regular, ui-monospace, monospace; font-size: 38px; letter-spacing: 0.32em; color:#2A2A2C; background:#FFF4E6; border:1.5px dashed rgba(243,147,34,0.4); border-radius:14px; padding: 18px 12px; text-align:center; margin: 22px 0; }
  .meta { font-size: 12px; color:#8B8B8E; margin-top: 22px; }
  .brand { font-family:'Fraunces', serif; font-size:18px; color:#F39322; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">OrphanGive</div>
    <h1>Verify your email</h1>
    <p>Hi ${safeName},</p>
    <p>Use this 6-digit code to finish creating your donor account:</p>
    <div class="code">${code}</div>
    <p>This code expires in 10 minutes.</p>
    <p class="meta">If you didn't request this, ignore this email. The code won't work for anyone else.</p>
  </div>
</body>
</html>`;

  const text = `OrphanGive — Verify your email

Hi ${safeName},

Use this 6-digit code to finish creating your donor account:

  ${code}

This code expires in 10 minutes.

If you didn't request this, ignore this email. The code won't work for anyone else.
`;

  return { html, text };
}
