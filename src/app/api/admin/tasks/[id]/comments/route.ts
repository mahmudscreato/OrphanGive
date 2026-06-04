// Admin posts a comment to a task's internal thread.
//
// POST /api/admin/tasks/[id]/comments
// Body: { body?: string, fileUuids?: string[] }  (≥1 of body/fileUuids)
//
// author + author_role are derived from the authed ADMIN session —
// never from the client. The thread is INTERNAL (admin↔DI); reading is
// done server-side on the detail page (same admin gate).
//
// fileUuids must already be uploaded via POST /api/admin/uploads/document
// (image/PDF only, validated there + private-classified by the asset
// proxy). We only link them here.
//
// Status mapping:
//   200 ok                 — { id }
//   400 bad_request / invalid_comment
//   401 unauthorized
//   404 not_found          — task id unknown
//   503 comments_unavailable — task_comment collection not migrated yet
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminTaskById } from "@/lib/admin-tasks";
import {
  CommentsUnavailableError,
  InvalidCommentError,
  createTaskComment,
} from "@/lib/task-comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    body: z.string().max(5000).optional(),
    fileUuids: z.array(z.string().uuid()).max(10).optional(),
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

  // Confirm the task exists (admin can comment on any task).
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

  try {
    const result = await createTaskComment({
      taskId: id,
      authorUserId: admin.userId,
      authorRole: "admin",
      body: parsed.data.body ?? "",
      fileUuids: parsed.data.fileUuids,
    });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof InvalidCommentError) {
      return NextResponse.json(
        { error: "invalid_comment", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof CommentsUnavailableError) {
      return NextResponse.json(
        { error: "comments_unavailable", message: err.message },
        { status: 503 },
      );
    }
    console.error(
      "[/api/admin/tasks/[id]/comments POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
