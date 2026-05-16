// Session 52c — Admin intake-photo remove (cleanup) endpoint.
//
// DELETE /api/admin/intake-photos/[id]
// Requires admin session. Only allowed when status='pending'.
//
// Mirror of admin/documents/[id] DELETE. No notification — admin
// uses this for accidental uploads, not as a rejection signal.
// Audit row written.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidStatusError,
  NotFoundError,
  removeIntakePhoto,
} from "@/lib/admin-intake-photos";

export const dynamic = "force-dynamic";

export async function DELETE(
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
    const result = await removeIntakePhoto(id, adminSession.userId);
    return NextResponse.json({ ok: true, ...result });
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
    console.error(
      "[/api/admin/intake-photos/[id] DELETE] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
