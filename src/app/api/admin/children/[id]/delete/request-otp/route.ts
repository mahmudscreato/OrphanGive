// Session 71 — POST /api/admin/children/[id]/delete/request-otp
//
// Step 1 of the OTP-gated hard-delete. Asserts the child is
// safe-to-delete (no sponsorship/payment/report/etc. history), then
// emails the ADMIN a 6-digit code using the EXISTING donor OTP infra
// (generateOtpCode + bcrypt hash + og_otp_* fields on directus_users +
// sendOtpEmail). Returns success WITHOUT the code.
//
// The code is stored on the admin's own directus_users row
// (og_otp_hash / og_otp_expires_at / og_otp_attempts) — the same
// fields the donor signup flow uses. NOTE (v1 accepted limitation):
// this could collide with an unrelated pending OTP on that admin
// account (e.g. a password-reset OTP). Admin accounts don't use the
// donor OTP flow in practice, so the collision window is negligible;
// if it ever matters, give admin-delete its own hash column later.
//
// Status mapping:
//   200 ok            — { ok: true }
//   400 invalid_state — child has blocking history (archive-only)
//   401 unauthorized
//   404 not_found     — child doesn't exist
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { readItem, updateUser } from "@directus/sdk";
import { requireAdminUser } from "@/lib/admin-auth";
import { directusServer } from "@/lib/directus";
import { generateOtpCode, sendOtpEmail } from "@/lib/donor-signup";
import { isChildSafeToDelete } from "@/lib/admin-child-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 10-minute TTL — mirrors the donor signup/resend OTP lifetime.
const OTP_TTL_MS = 10 * 60 * 1000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // fix/super-admin-route-gating — the delete-OTP request must be gated
  // too, or a plain Admin could trigger the hard-delete flow. Super
  // Admin only; a valid non-super session → 403.
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Child must exist.
  try {
    const row = (await directusServer().request(
      readItem("child" as never, id as never, { fields: ["id"] } as never),
    )) as unknown as { id?: string } | undefined;
    if (!row?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Safety gate — must be archive-only-free before we even email a code.
  const safety = await isChildSafeToDelete(id);
  if (!safety.safe) {
    return NextResponse.json(
      { error: "invalid_state", message: safety.reason },
      { status: 400 },
    );
  }

  // Reuse the donor OTP infra: 6-digit code, bcrypt(10), 10-min expiry.
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, 10);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  try {
    await directusServer().request(
      updateUser(session.userId as never, {
        og_otp_hash: otpHash,
        og_otp_expires_at: otpExpiresAt,
        og_otp_attempts: 0,
      } as never),
    );
  } catch (err) {
    console.error(
      "[/api/admin/children/delete/request-otp] failed to store otp",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const fullName =
    [session.firstName, session.lastName]
      .filter((s) => s && s.trim().length > 0)
      .join(" ")
      .trim() || session.email;

  const sent = await sendOtpEmail({ to: session.email, code, fullName });
  if (!sent.ok) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Never return the code.
  return NextResponse.json({ ok: true });
}
