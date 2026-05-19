// Session 65 — POST /api/admin/donors/[id]/reactivate
//
// Sets directus_users.status='active'. Symmetric to suspend; no body.
// Audited as admin_reactivated_donor.
//
// Status mapping:
//   200 ok            — { donorId, reactivatedAt }
//   400 invalid_state (donor not currently suspended)
//   401 unauthorized
//   404 not_found
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  DonorNotFoundError,
  DonorWriteFailedError,
  InvalidDonorStateError,
  reactivateDonor,
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
    const result = await reactivateDonor(id, session.userId, req);
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
        "[/api/admin/donors/reactivate] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't save the change." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/donors/reactivate] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
