// DI posts a comment to a task's internal thread.
//
// POST /api/di/tasks/[id]/comments
// Body: { body?: string, fileUuids?: string[] }  (≥1 of body/fileUuids)
//
// author + author_role come from the authed DI session — never the
// client. SCOPE: a DI may only comment on a task assigned to them —
// getTaskForUser returns null otherwise (collapsed to 404, same as the
// rest of the DI task surface).
//
// fileUuids must already be uploaded via POST /api/di/uploads/document
// (image/PDF only). We only link them here.
//
// Status mapping:
//   200 ok / 400 bad_request|invalid_comment / 401 / 404 not_owned
//   503 comments_unavailable / 500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import { getTaskForUser } from "@/lib/di-tasks";
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
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Scope guard — the DI must own this task. Null collapses
  // "not assigned" with "doesn't exist".
  const task = await getTaskForUser(id, session.userId);
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
      authorUserId: session.userId,
      authorRole: "di",
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
      "[/api/di/tasks/[id]/comments POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
