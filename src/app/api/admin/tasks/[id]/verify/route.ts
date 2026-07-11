// Admin half of the task state machine — VERIFY.
//
// POST /api/admin/tasks/[id]/verify
//
// No request body. Marks a task the DI submitted (di_status ===
// 'completed_pending_verification') as admin_status='verified_complete',
// stamping verified_at + verified_by = the acting admin. Writes an
// `admin_verified_task` audit row (IDs + decision only).
//
// This route does NOT touch di_status — the DI owns that axis. The
// reject counterpart lives at ../reject; after a reject the DI's own
// transition logic lets them move the task back to in_progress to redo.
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
  verifyTask,
} from "@/lib/admin-tasks";
import { recordAuditEvent } from "@/lib/di-audit";
import { notify } from "@/lib/di-notifications";

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
    result = await verifyTask(id, admin.userId);
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
      "[/api/admin/tasks/[id]/verify POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Audit (best-effort; recordAuditEvent never throws). IDs + decision
  // only — no Tier-3 child fields, no reason text.
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_verified_task",
    collection: "task",
    recordId: result.taskId,
    metadata: {
      taskId: result.taskId,
      sponsorshipId: result.sponsorshipId,
      childId: result.childId,
      decision: "verified_complete",
    },
    request: req,
  });

  // fix/task-fulfillment-loop — tell the DI their work was accepted.
  // Best-effort (notify swallows its own errors) + gated on a non-null
  // assignee; never affects the verify result.
  if (result.assigneeId) {
    await notify({
      recipientUserId: result.assigneeId,
      type: "admin_verified_task",
      title: "Task verified",
      body: "Admin verified your completed delivery task. Nothing more to do — thank you!",
      relatedCollection: "task",
      relatedId: result.taskId,
    });
  }

  return NextResponse.json({
    ok: true,
    taskId: result.taskId,
    adminStatus: result.adminStatus,
  });
}
