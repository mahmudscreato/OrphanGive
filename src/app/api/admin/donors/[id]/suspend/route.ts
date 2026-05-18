// Session 65 — POST /api/admin/donors/[id]/suspend
//
// Body: { reason: string }   (min 10, max 1000 chars)
//
// Sets directus_users.status='suspended'. The downstream effects
// (cart/add rejection + signin redirect) are already wired against
// the donor state machine.
//
// Status mapping:
//   200 ok            — { donorId, suspendedAt }
//   400 bad_request   (malformed body)
//   400 invalid_state (reason invalid OR donor already suspended)
//   401 unauthorized
//   404 not_found
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  DonorNotFoundError,
  DonorWriteFailedError,
  InvalidDonorStateError,
  suspendDonor,
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

  let body: { reason?: unknown };
  try {
    body = (await req.json()) as { reason?: unknown };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" ? body.reason : "";

  try {
    const result = await suspendDonor(id, session.userId, reason, req);
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
        "[/api/admin/donors/suspend] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't save the change." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/donors/suspend] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
