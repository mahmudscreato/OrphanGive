// Session 65 — POST /api/admin/donors/[id]/approve
//
// Sets og_admin_approval_status='approved' + stamps og_admin_approved_at.
// Audited as admin_approved_donor. Idempotent (re-approve is allowed).
//
// Status mapping:
//   200 ok            — { donorId, approvedAt }
//   401 unauthorized
//   404 not_found
//   400 invalid_state (donor suspended)
//   500 server_error  (write_failed)

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  approveDonor,
  DonorNotFoundError,
  DonorWriteFailedError,
  InvalidDonorStateError,
} from "@/lib/admin-donor-actions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await approveDonor(id, session.userId, req);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DonorNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidDonorStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof DonorWriteFailedError) {
      console.error(
        "[/api/admin/donors/approve] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't save the change." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/donors/approve] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
