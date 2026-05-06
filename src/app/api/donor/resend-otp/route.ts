import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { readUsers, updateUser } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import {
  RATE_LIMITS,
  countRecentRequests,
  generateOtpCode,
  recordOtpRequest,
  resendOtpSchema,
  sendOtpEmail,
} from "@/lib/donor-signup";

export const runtime = "nodejs";

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

  const parsed = resendOtpSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { email } = parsed.data;
  const ip = clientIp(req);

  // Per-email send rate limit (3 per 15 min).
  const sendCount = await countRecentRequests({
    kind: RATE_LIMITS.send_per_email.kind,
    email,
    windowMs: RATE_LIMITS.send_per_email.windowMs,
  });
  if (sendCount >= RATE_LIMITS.send_per_email.max) {
    return NextResponse.json(
      { error: "Too many verification codes requested. Wait 15 minutes." },
      { status: 429 },
    );
  }

  const ds = directusServer();

  type UserRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  let user: UserRow | null = null;
  try {
    const rows = (await ds.request(
      readUsers({
        filter: { email: { _eq: email } },
        fields: ["id", "first_name", "last_name", "status"],
        limit: 1,
      } as never),
    )) as unknown as UserRow[];
    user = rows?.[0] ?? null;
  } catch (err) {
    console.error("[resend-otp] user lookup failed", err);
  }

  // Always record the rate-limit row so a non-existent email and an existing
  // one have indistinguishable rate-limit consumption.
  await recordOtpRequest({ email, ip, kind: "send" });

  if (!user) {
    // Mirror success — don't leak existence.
    return NextResponse.json({ success: true });
  }

  // Generate fresh OTP, hash, store. Old OTP is now invalid.
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, 10);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    await ds.request(
      updateUser(user.id as never, {
        og_otp_hash: otpHash,
        og_otp_expires_at: otpExpiresAt,
        og_otp_attempts: 0,
      } as never),
    );
  } catch (err) {
    console.error("[resend-otp] update failed", err);
    return NextResponse.json({ success: true }); // generic
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "there";
  await sendOtpEmail({ to: email, code, fullName });

  return NextResponse.json({ success: true });
}
