import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, readUsers } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { getDonorRoleId } from "@/lib/directus-roles";
import {
  RATE_LIMITS,
  countRecentRequests,
  generateOtpCode,
  recordOtpRequest,
  sendOtpEmail,
  signupSchema,
} from "@/lib/donor-signup";
// Cloudflare Turnstile bot protection. Graceful no-op when
// TURNSTILE_SECRET_KEY is unset (verifyTurnstile returns ok+skipped).
import { verifyTurnstile } from "@/lib/turnstile";

// Use the Node runtime explicitly: bcryptjs works in Edge but is far slower
// without native crypto. Resend's SDK also assumes Node fetch quirks.
export const runtime = "nodejs";

const GENERIC_ERROR = "Could not create account. Please try again.";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const ip = clientIp(req);

  // Cloudflare Turnstile captcha — verified BEFORE createUser. The token is
  // read from the raw body (signupSchema strips unknown keys, so it isn't
  // in `input`). Graceful no-op when TURNSTILE_SECRET_KEY is unset:
  // verifyTurnstile returns ok=true (skipped) so signup works unchanged.
  // When configured, a missing/invalid token is rejected here. The rate
  // limits below remain as defence-in-depth.
  const turnstileToken =
    json &&
    typeof json === "object" &&
    "turnstileToken" in json &&
    typeof (json as Record<string, unknown>).turnstileToken === "string"
      ? ((json as Record<string, unknown>).turnstileToken as string)
      : null;
  const captcha = await verifyTurnstile(turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please refresh and try again." },
      { status: 400 },
    );
  }

  // Per-IP rate limit on signup creation. Generic error on lockout to avoid
  // signaling that we're tracking IPs.
  if (ip) {
    const count = await countRecentRequests({
      kind: RATE_LIMITS.signup_per_ip.kind,
      ip,
      windowMs: RATE_LIMITS.signup_per_ip.windowMs,
    });
    if (count >= RATE_LIMITS.signup_per_ip.max) {
      return NextResponse.json(
        { error: "Too many signups from this connection. Try again later." },
        { status: 429 },
      );
    }
  }

  // Per-email rate limit on OTP sends.
  const sendCount = await countRecentRequests({
    kind: RATE_LIMITS.send_per_email.kind,
    email: input.email,
    windowMs: RATE_LIMITS.send_per_email.windowMs,
  });
  if (sendCount >= RATE_LIMITS.send_per_email.max) {
    return NextResponse.json(
      { error: "Too many verification codes requested. Wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  const ds = directusServer();

  // Account-enumeration protection: don't tell the caller if an email
  // already exists. We still avoid creating a duplicate, but the response
  // looks identical from the outside.
  let existingId: string | null = null;
  try {
    const rows = (await ds.request(
      readUsers({
        filter: { email: { _eq: input.email } },
        fields: ["id", "status"],
        limit: 1,
      }),
    )) as Array<{ id: string; status?: string }>;
    existingId = rows?.[0]?.id ?? null;
  } catch (err) {
    console.error("[signup] email lookup failed", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  if (existingId) {
    // Mirror the success response: record the rate-limit row and pretend
    // the email was sent. We DO NOT regenerate or send an OTP — that would
    // act as an enumeration oracle in a different way (timing of email
    // arrival). Surfacing the same shape is the safest compromise.
    await recordOtpRequest({ email: input.email, ip, kind: "send" });
    return NextResponse.json({ success: true, email: input.email });
  }

  // Password: Directus hashes this internally on createUser/login (via
  // argon2). We send plaintext over TLS and Directus handles storage.
  // Pre-hashing here would double-hash and break /auth/login.

  // Generate OTP and hash it (10 rounds — verification is interactive,
  // performance matters more than send-time hardening here).
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, 10);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Split name into first/last for Directus's built-in fields.
  const trimmedName = input.full_name.trim().replace(/\s+/g, " ");
  const spaceIdx = trimmedName.indexOf(" ");
  const firstName = spaceIdx === -1 ? trimmedName : trimmedName.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? "" : trimmedName.slice(spaceIdx + 1);

  const now = new Date().toISOString();
  const donorRoleId = await getDonorRoleId();

  // Create user. status='draft' = "pending email verification" in our model;
  // signin will reject draft users until OTP verifies and we flip to 'active'.
  let createdId: string;
  try {
    const created = (await ds.request(
      createUser({
        email: input.email,
        password: input.password,
        first_name: firstName,
        last_name: lastName,
        role: donorRoleId,
        status: "draft",
        provider: "default",
        // Custom og_* fields:
        og_country: input.country_code,
        og_phone: input.phone,
        og_how_heard: input.how_heard ?? null,
        og_agreed_to_safeguarding_at: now,
        og_agreed_to_terms_at: now,
        og_admin_approval_status: "pending",
        og_otp_hash: otpHash,
        og_otp_expires_at: otpExpiresAt,
        og_otp_attempts: 0,
      } as never),
    )) as { id: string };
    createdId = created.id;
  } catch (err) {
    // Directus errors carry useful detail in `errors` and `extensions`,
    // neither of which serialize via the default console.error fallback.
    const detail =
      err && typeof err === "object" && "errors" in err
        ? JSON.stringify((err as { errors?: unknown }).errors)
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[signup] createUser failed:", detail);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  // Send the email. Failures here are logged but don't roll back the user;
  // the donor can use Resend's resend-otp endpoint.
  await sendOtpEmail({ to: input.email, code, fullName: trimmedName });
  await recordOtpRequest({ email: input.email, ip, kind: "send" });

  // Suppress unused warnings — createdId is for future hooks.
  void createdId;

  return NextResponse.json({ success: true, email: input.email });
}
