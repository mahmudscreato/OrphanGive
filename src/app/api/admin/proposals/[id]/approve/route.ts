// Session 46-fix-2 — admin proposal approval endpoint.
//
// POST /api/admin/proposals/[id]/approve
// Requires admin session cookie (admin_access_token).
//
// Status mapping:
//   200 ok                            — { proposalId, targetChildId, appliedFields, operation }
//   401 unauthorized                  — no admin session
//   404 not_found                     — proposal doesn't exist
//   400 invalid_status                — proposal not pending
//   400 target_child_missing          — UPDATE proposal has no target_child
//   500 server_error                  — child write or status update failed

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildWriteFailedError,
  InvalidStatusError,
  NotFoundError,
  TargetChildMissingError,
  approveProposal,
} from "@/lib/admin-proposals";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await approveProposal(id, adminSession.userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidStatusError) {
      return NextResponse.json(
        { error: "invalid_status", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof TargetChildMissingError) {
      return NextResponse.json(
        { error: "target_child_missing", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildWriteFailedError) {
      console.error(
        "[/api/admin/proposals/approve] child_write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "server_error", message: "child write failed" },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/proposals/approve] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
