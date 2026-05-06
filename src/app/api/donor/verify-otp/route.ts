import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { readUsers, updateUser } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import {
  RATE_LIMITS,
  countRecentRequests,
  recordOtpRequest,
  verifyOtpSchema,
} from "@/lib/donor-signup";

export const runtime = "nodejs";

const GENERIC_ERROR = "Invalid or expired code.";
const MAX_OTP_ATTEMPTS = 5;

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export async function POST(req: NextRequest) {
  let json: unknown;
  try { json = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = verifyOtpSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { email, code } = parsed.data;
  const ip = clientIp(req);

  // Per-email verify rate limit. Once exceeded, lock for 60 minutes by
  // refusing all verifies regardless of code correctness.
  const verifyCount = await countRecentRequests({
    kind: RATE_LIMITS.verify_per_email.kind,
    email,
    windowMs: RATE_LIMITS.verify_per_email.windowMs,
  });
  if (verifyCount >= RATE_LIMITS.verify_per_email.max) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in an hour." },
      { status: 429 },
    );
  }
  await recordOtpRequest({ email, ip, kind: "verify" });

  const ds = directusServer();

  // Look up user. We always return the same generic error on failure to
  // avoid leaking whether the email exists.
  type UserRow = {
    id: string;
    status?: string;
    og_otp_hash?: string | null;
    og_otp_expires_at?: string | null;
    og_otp_attempts?: number | null;
  };
  let user: UserRow | null = null;
  try {
    const rows = (await ds.request(
      readUsers({
        filter: { email: { _eq: email } },
        fields: ["id", "status", "og_otp_hash", "og_otp_expires_at", "og_otp_attempts"],
        limit: 1,
      } as never),
    )) as unknown as UserRow[];
    user = rows?.[0] ?? null;
  } catch (err) {
    console.error("[verify-otp] user lookup failed", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  if (!user || !user.og_otp_hash || !user.og_otp_expires_at) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Expiry check
  if (new Date(user.og_otp_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Per-user attempt cap
  const attempts = user.og_otp_attempts ?? 0;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Request a new code." },
      { status: 400 },
    );
  }

  // bcrypt.compare is constant-time on a per-byte basis.
  const ok = await bcrypt.compare(code, user.og_otp_hash);
  if (!ok) {
    try {
      await ds.request(
        updateUser(user.id as never, {
          og_otp_attempts: attempts + 1,
        } as never),
      );
    } catch (err) {
      console.warn("[verify-otp] failed to bump attempts", err);
    }
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Success — clear OTP fields, flip status from draft → active.
  // og_admin_approval_status remains 'pending' until an admin approves.
  try {
    await ds.request(
      updateUser(user.id as never, {
        og_otp_hash: null,
        og_otp_expires_at: null,
        og_otp_attempts: 0,
        status: "active",
      } as never),
    );
  } catch (err) {
    console.error("[verify-otp] failed to flip status to active", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
