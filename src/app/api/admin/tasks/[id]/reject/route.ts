// Admin half of the task state machine — REJECT / SEND BACK.
//
// POST /api/admin/tasks/[id]/reject
//
// No request body. Marks a task the DI submitted (di_status ===
// 'completed_pending_verification') as admin_status='rejected_redo',
// stamping verified_at + verified_by = the acting admin. Writes an
// `admin_rejected_task` audit row (IDs + decision only).
//
// This route does NOT touch di_status — the DI owns that axis. After
// this write, the DI's own transition logic (di-tasks.ts
// isLegalTransition) permits completed_pending_verification →
// in_progress, so the DI can pick the task back up and redo it.
//
// No reject reason is captured: the task schema has no
// verification-reason column and this slice adds none.
//
// Status mapping:
//   200 ok              — { ok: true, taskId, adminStatus }
//   401 unauthorized
//   404 not_found       — task id unknown
//   409 not_verifiable  — task isn't awaiting verification
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  AdminTaskNotFoundError,
  TaskNotVerifiableError,
  rejectTask,
} from "@/lib/admin-tasks";
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
    result = await rejectTask(id, admin.userId);
  } catch (err) {
    if (err instanceof AdminTaskNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof TaskNotVerifiableError) {
      return NextResponse.json(
        {
          error: "not_verifiable",
          currentDiStatus: err.currentDiStatus,
          message: err.message,
        },
        { status: 409 },
      );
    }
    console.error(
      "[/api/admin/tasks/[id]/reject POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Audit (best-effort; recordAuditEvent never throws). IDs + decision
  // only — no Tier-3 child fields, no reason text.
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_rejected_task",
    collection: "task",
    recordId: result.taskId,
    metadata: {
      taskId: result.taskId,
      sponsorshipId: result.sponsorshipId,
      childId: result.childId,
      decision: "rejected_redo",
    },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    taskId: result.taskId,
    adminStatus: result.adminStatus,
  });
}
