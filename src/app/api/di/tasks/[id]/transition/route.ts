// Session 46 — DI task di_status transition endpoint.
//
// POST /api/di/tasks/[id]/transition
// Body: { to: 'in_progress' | 'completed_pending_verification' }
//
// Status mapping:
//   200 ok                          — { taskId, di_status }
//   400 invalid_transition          — illegal move (e.g. open → completed)
//   401 unauthorized
//   404 not_found                   — task not owned (collapsed for privacy)
//   500 server_error
//
// Audit: writes `di_started_task` for in_progress, `di_completed_task`
// for completed_pending_verification. Audit failures don't break the
// transition.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  InvalidTaskTransitionError,
  TaskNotFoundError,
  transitionTaskDiStatus,
  type TaskDiStatus,
} from "@/lib/di-tasks";
import { recordAuditEvent } from "@/lib/di-audit";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    to: z.enum(["in_progress", "completed_pending_verification"]),
  })
  .strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "bad_request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const { taskId, di_status, childId } = await transitionTaskDiStatus(
      id,
      session.userId,
      parsed.data.to as TaskDiStatus,
    );
    // Audit AFTER successful transition. Action keyed off the new
    // status so the History feed can read it cleanly. childId in
    // metadata only when the task is child-specific — the per-child
    // History tab on Child Detail filters on metadata.childId.
    const action =
      di_status === "in_progress" ? "di_started_task" : "di_completed_task";
    await recordAuditEvent({
      actorUserId: session.userId,
      action,
      collection: "task",
      recordId: taskId,
      metadata: childId ? { childId } : undefined,
      request: req,
    });
    return NextResponse.json({ taskId, di_status });
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidTaskTransitionError) {
      return NextResponse.json(
        {
          error: "invalid_transition",
          from: err.from,
          to: err.to,
          adminStatus: err.adminStatus,
          message: err.message,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/di/tasks/[id]/transition POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
