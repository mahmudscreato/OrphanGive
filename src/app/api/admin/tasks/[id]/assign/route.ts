// Admin quick-assign — set a task's assignee to a Data Inputter.
//
// POST /api/admin/tasks/[id]/assign
// Body: { assigneeId: string (uuid of an active DI) }
//
// Used by the quick-assign dropdown on /admin/tasks (rows) and
// /admin/tasks/[id] (detail) — primarily to assign donation auto-tasks
// that landed unassigned (piece #3). The assigneeId is validated
// server-side against the active-DI list (assignTask), never trusted.
//
// Audit: admin_assigned_task via recordAuditEvent (actor = admin,
// record_id = task id, metadata = { taskId, assigneeId } — IDs only).
//
// Status mapping:
//   200 ok               — { ok: true, taskId, assigneeId }
//   400 bad_request / invalid_input (not an active DI)
//   401 unauthorized
//   404 not_found        — task id unknown
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidTaskInputError,
  assignTask,
  getAdminTaskById,
} from "@/lib/admin-tasks";
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    assigneeId: z.string().uuid(),
  })
  .strict();

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

  // Confirm the task exists before assigning.
  const task = await getAdminTaskById(id);
  if (!task) {
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

  let result;
  try {
    result = await assignTask(id, parsed.data.assigneeId);
  } catch (err) {
    if (err instanceof InvalidTaskInputError) {
      return NextResponse.json(
        { error: "invalid_input", field: err.field, message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/tasks/[id]/assign POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Audit (best-effort; recordAuditEvent never throws). IDs only.
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_assigned_task",
    collection: "task",
    recordId: result.taskId,
    metadata: {
      taskId: result.taskId,
      assigneeId: result.assigneeId,
    },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    taskId: result.taskId,
    assigneeId: result.assigneeId,
  });
}
