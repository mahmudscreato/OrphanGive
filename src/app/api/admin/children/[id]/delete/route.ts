// Session 71 — POST /api/admin/children/[id]/delete
//
// Step 2 of the OTP-gated hard-delete. Verifies the 6-digit code the
// admin was emailed by /delete/request-otp (bcrypt.compare + expiry +
// attempt cap — the SAME pattern as donor verify-otp, read from the
// admin's own og_otp_* fields), then runs the safe delete. The delete
// helper RE-CHECKS isChildSafeToDelete inside itself, so a sponsorship
// created between request and confirm structurally blocks the delete.
//
// On success the admin's OTP fields are cleared (mirrors verify-otp),
// EXCEPT we do NOT touch status (that flip is donor-signup-specific).
//
// Body: { code: string }   (6 digits)
//
// Status mapping:
//   200 ok            — { ok: true, childId }
//   400 bad_request   — body isn't JSON / code malformed
//   400 invalid_code  — wrong/expired code or attempts exceeded
//   400 invalid_state — child gained blocking history since request-otp
//   401 unauthorized
//   404 not_found     — child doesn't exist
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { readUsers, updateUser } from "@directus/sdk";
import { requireAdminUser } from "@/lib/admin-auth";
import { directusServer } from "@/lib/directus";
import {
  ChildNotFoundError,
  ChildWriteFailedError,
  InvalidChildStateError,
  deleteChildAsAdmin,
} from "@/lib/admin-child-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_CODE = "Invalid or expired code.";
const MAX_OTP_ATTEMPTS = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // fix/super-admin-route-gating — hard delete is irreversible: Super
  // Admin only. A valid but non-super session (plain Admin) → 403.
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "bad_request", message: "Enter the 6-digit code." },
      { status: 400 },
    );
  }

  const ds = directusServer();

  // ─── Verify the admin's OTP (mirrors donor verify-otp) ──
  type UserRow = {
    id: string;
    og_otp_hash?: string | null;
    og_otp_expires_at?: string | null;
    og_otp_attempts?: number | null;
  };
  let user: UserRow | null = null;
  try {
    const rows = (await ds.request(
      readUsers({
        filter: { id: { _eq: session.userId } },
        fields: ["id", "og_otp_hash", "og_otp_expires_at", "og_otp_attempts"],
        limit: 1,
      } as never),
    )) as unknown as UserRow[];
    user = rows?.[0] ?? null;
  } catch (err) {
    console.error(
      "[/api/admin/children/delete] admin lookup failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!user || !user.og_otp_hash || !user.og_otp_expires_at) {
    return NextResponse.json(
      { error: "invalid_code", message: INVALID_CODE },
      { status: 400 },
    );
  }
  if (new Date(user.og_otp_expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "invalid_code", message: INVALID_CODE },
      { status: 400 },
    );
  }
  const attempts = user.og_otp_attempts ?? 0;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    return NextResponse.json(
      { error: "invalid_code", message: "Too many attempts. Request a new code." },
      { status: 400 },
    );
  }

  const codeOk = await bcrypt.compare(code, user.og_otp_hash);
  if (!codeOk) {
    try {
      await ds.request(
        updateUser(user.id as never, {
          og_otp_attempts: attempts + 1,
        } as never),
      );
    } catch (err) {
      console.warn(
        "[/api/admin/children/delete] failed to bump otp attempts",
        err instanceof Error ? err.message : err,
      );
    }
    return NextResponse.json(
      { error: "invalid_code", message: INVALID_CODE },
      { status: 400 },
    );
  }

  // ─── Code good — run the safe delete (re-checks the predicate) ──
  try {
    const result = await deleteChildAsAdmin(id, session.userId, req);

    // Clear the OTP now that it's consumed (mirrors verify-otp success,
    // minus the donor status flip).
    try {
      await ds.request(
        updateUser(user.id as never, {
          og_otp_hash: null,
          og_otp_expires_at: null,
          og_otp_attempts: 0,
        } as never),
      );
    } catch (err) {
      console.warn(
        "[/api/admin/children/delete] failed to clear otp after delete",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({ ok: true, childId: result.childId });
  } catch (err) {
    if (err instanceof ChildNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidChildStateError) {
      // Predicate refused inside the transaction — child gained history.
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildWriteFailedError) {
      console.error(
        "[/api/admin/children/delete] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't delete the child." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children/delete] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
