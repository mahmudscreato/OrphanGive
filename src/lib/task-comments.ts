// Task system — internal task comment thread (admin↔DI) data layer.
//
// Backs the comment thread on both task detail pages. Reads + writes
// the `task_comment` + `task_comment_attachment` collections
// (migrations/task-detail-comments-1). INTERNAL ONLY — these
// collections have no Directus policy grants, so only this module
// (server token) touches them; callers gate by admin/DI auth first.
//
// Graceful degradation: until the migration runs, the collections
// don't exist. listTaskComments swallows the read error and returns an
// empty thread so the detail pages still render. createTaskComment
// surfaces a typed error the route maps to 503 so the client shows a
// clear "comments not available yet" message.
//
// author + author_role are ALWAYS passed in by the route from the
// authed session — this module never derives them from client input.

import "server-only";

import { createItem, readFiles, readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";

export type CommentAuthorRole = "admin" | "di";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY = 5000;
const MAX_ATTACHMENTS = 10;

// ─── Types ───────────────────────────────────────────────────────────

export interface TaskCommentAttachmentView {
  id: string; // attachment junction row id
  fileUuid: string;
  mime: string | null;
  filename: string | null;
  isImage: boolean;
  isPdf: boolean;
}

export interface TaskCommentView {
  id: string;
  body: string;
  authorRole: CommentAuthorRole;
  authorId: string | null;
  authorName: string;
  createdAt: string | null;
  attachments: TaskCommentAttachmentView[];
}

export class InvalidCommentError extends Error {
  readonly code = "invalid_comment" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommentError";
  }
}

export class CommentsUnavailableError extends Error {
  readonly code = "comments_unavailable" as const;
  constructor() {
    super("Task comments are not available yet (migration pending).");
    this.name = "CommentsUnavailableError";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function m2oId(v: string | { id?: string } | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.id ?? null;
}

function authorDisplay(u: {
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  const name = [u.first_name?.trim(), u.last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  return name.length > 0 ? name : u.email;
}

// ─── Read ────────────────────────────────────────────────────────────

type CommentRow = {
  id: string;
  body: string | null;
  author: string | { id?: string } | null;
  author_role: string | null;
  created_at: string | null;
};

type AttachmentRow = {
  id: string;
  comment: string | { id?: string } | null;
  file: string | { id?: string } | null;
};

/**
 * Chronological comment thread for a task, with attachments resolved to
 * file metadata. The CALLER must have already authorised access (admin,
 * or DI who owns the task). Returns [] on any read failure — including
 * the collection not existing yet — so detail pages never crash.
 */
export async function listTaskComments(
  taskId: string,
): Promise<TaskCommentView[]> {
  if (!UUID_RE.test(taskId)) return [];

  let rows: CommentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("task_comment" as never, {
        filter: { task: { _eq: taskId } },
        fields: ["id", "body", "author", "author_role", "created_at"],
        sort: ["created_at"],
        limit: 500,
      } as never),
    )) as unknown as CommentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    // Collection likely doesn't exist yet (migration pending). Empty
    // thread keeps the page alive.
    console.warn(
      "[task-comments] listTaskComments read failed (collection pending?)",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (rows.length === 0) return [];

  const commentIds = rows.map((r) => r.id);

  // Attachments for these comments.
  let attachRows: AttachmentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("task_comment_attachment" as never, {
        filter: { comment: { _in: commentIds } },
        fields: ["id", "comment", "file"],
        limit: -1,
      } as never),
    )) as unknown as AttachmentRow[] | undefined;
    if (Array.isArray(result)) attachRows = result;
  } catch {
    attachRows = [];
  }

  // File metadata (mime + filename) for thumbnails / PDF labels.
  const fileUuids = Array.from(
    new Set(
      attachRows
        .map((a) => m2oId(a.file))
        .filter((x): x is string => !!x),
    ),
  );
  const fileMetaById = new Map<
    string,
    { type: string | null; filename_download: string | null }
  >();
  if (fileUuids.length > 0) {
    try {
      const files = (await directusServer().request(
        readFiles({
          filter: { id: { _in: fileUuids } },
          fields: ["id", "type", "filename_download"],
          limit: -1,
        } as never),
      )) as unknown as Array<{
        id: string;
        type: string | null;
        filename_download: string | null;
      }>;
      if (Array.isArray(files)) {
        for (const f of files)
          fileMetaById.set(f.id, {
            type: f.type ?? null,
            filename_download: f.filename_download ?? null,
          });
      }
    } catch {
      /* non-fatal — render without mime/filename */
    }
  }

  // Author names.
  const authorIds = Array.from(
    new Set(rows.map((r) => m2oId(r.author)).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: authorIds } },
          fields: ["id", "first_name", "last_name", "email"],
          limit: -1,
        } as never),
      )) as unknown as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }>;
      if (Array.isArray(users)) {
        for (const u of users) nameById.set(u.id, authorDisplay(u));
      }
    } catch {
      /* non-fatal — fall back to role label */
    }
  }

  // Group attachments by comment.
  const attachByComment = new Map<string, TaskCommentAttachmentView[]>();
  for (const a of attachRows) {
    const commentId = m2oId(a.comment);
    const fileUuid = m2oId(a.file);
    if (!commentId || !fileUuid) continue;
    const meta = fileMetaById.get(fileUuid);
    const mime = meta?.type ?? null;
    const view: TaskCommentAttachmentView = {
      id: a.id,
      fileUuid,
      mime,
      filename: meta?.filename_download ?? null,
      isImage: !!mime && mime.startsWith("image/"),
      isPdf: mime === "application/pdf",
    };
    const list = attachByComment.get(commentId) ?? [];
    list.push(view);
    attachByComment.set(commentId, list);
  }

  return rows.map((r) => {
    const authorId = m2oId(r.author);
    const role: CommentAuthorRole =
      r.author_role === "admin" ? "admin" : "di";
    return {
      id: r.id,
      body: r.body?.trim() ?? "",
      authorRole: role,
      authorId,
      authorName:
        (authorId ? nameById.get(authorId) : null) ??
        (role === "admin" ? "Admin" : "Data Inputter"),
      createdAt: r.created_at,
      attachments: attachByComment.get(r.id) ?? [],
    };
  });
}

// ─── Write ───────────────────────────────────────────────────────────

export interface CreateTaskCommentInput {
  taskId: string;
  /** From the authed session — NEVER the client. */
  authorUserId: string;
  /** From the authed session — NEVER the client. */
  authorRole: CommentAuthorRole;
  body: string;
  /** directus_files UUIDs already uploaded via the document upload route. */
  fileUuids?: string[];
}

/**
 * Insert one comment + its attachment junction rows. Validates the
 * body / attachment shape (NOT auth — the route does that). Throws
 * InvalidCommentError on bad input, CommentsUnavailableError when the
 * collection is missing (migration pending).
 */
export async function createTaskComment(
  input: CreateTaskCommentInput,
): Promise<{ id: string }> {
  if (!UUID_RE.test(input.taskId)) {
    throw new InvalidCommentError("invalid task id");
  }
  if (!UUID_RE.test(input.authorUserId)) {
    throw new InvalidCommentError("invalid author");
  }
  const body = (input.body ?? "").trim();
  const fileUuids = (input.fileUuids ?? []).filter((u) => UUID_RE.test(u));
  if (body.length === 0 && fileUuids.length === 0) {
    throw new InvalidCommentError("a comment needs text or an attachment");
  }
  if (body.length > MAX_BODY) {
    throw new InvalidCommentError(`comment too long (max ${MAX_BODY} chars)`);
  }
  if (fileUuids.length > MAX_ATTACHMENTS) {
    throw new InvalidCommentError(
      `too many attachments (max ${MAX_ATTACHMENTS})`,
    );
  }

  let created: { id?: string } | null = null;
  try {
    created = (await directusServer().request(
      createItem("task_comment" as never, {
        task: input.taskId,
        author: input.authorUserId,
        author_role: input.authorRole,
        body,
        created_at: new Date().toISOString(),
      } as never),
    )) as unknown as { id?: string } | null;
  } catch (err) {
    // Collection missing (migration pending) is the most likely cause.
    console.error(
      "[task-comments] createTaskComment insert failed",
      err instanceof Error ? err.message : err,
    );
    throw new CommentsUnavailableError();
  }
  const commentId = created?.id;
  if (!commentId) throw new CommentsUnavailableError();

  // Attachment junction rows (best-effort per file — a bad file id
  // shouldn't lose the whole comment).
  for (const fileUuid of fileUuids) {
    try {
      await directusServer().request(
        createItem("task_comment_attachment" as never, {
          comment: commentId,
          file: fileUuid,
        } as never),
      );
    } catch (err) {
      console.warn(
        "[task-comments] attachment link failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { id: commentId };
}
