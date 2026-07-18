// Admin hard-delete for a task — fix/admin-quick-batch.
//
// POST /api/admin/tasks/[id]/delete
//
// No request body. Permanently removes the task row. The task's
// internal admin↔DI comment thread (task_comment) + its attachment
// junction rows (task_comment_attachment) cascade-delete at the DB
// level — see admin-tasks.ts:deleteTaskAsAdmin. Writes an
// `admin_deleted_task` audit row (IDs only).
//
// Tasks are OPERATIONAL, not super-admin — so this uses the plain
// admin guard (requireAdminUser), matching the sibling verify/reject/
// assign routes in this folder.
//
// FULFILLMENT NOTE: donor fulfillment is derived read-time from the
// latest task per sponsorship, so deleting a task never strands
// fulfillment — it just recomputes from the remaining rows. The UI
// gates this behind a confirmation step (see TaskDeleteButton).
//
// Status mapping:
//   200 ok            — { ok: true, taskId }
//   401 unauthorized
//   404 not_found     — task id unknown / malformed
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { AdminTaskNotFoundError, deleteTaskAsAdmin } from "@/lib/admin-tasks";
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let result;
  try {
    result = await deleteTaskAsAdmin(id);
  } catch (err) {
    if (err instanceof AdminTaskNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/admin/tasks/[id]/delete POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Audit (best-effort; recordAuditEvent never throws). IDs only — no
  // Tier-3 child fields, no reason text.
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_deleted_task",
    collection: "task",
    recordId: result.taskId,
    metadata: {
      taskId: result.taskId,
      sponsorshipId: result.sponsorshipId,
      childId: result.childId,
    },
    request: req,
  });

  return NextResponse.json({ ok: true, taskId: result.taskId });
}
