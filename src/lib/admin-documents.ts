// Session 52b — Admin-side document review data layer.
//
// Reads + mutations for the /admin/reviews/documents queue. Reads
// span both the new (`document_type`) and legacy (`type`) column
// shapes via the Session 50 normalizers. Writes update the new
// columns only: `status` (the new vocab — pending/approved/rejected/
// archived), `reviewed_by`, `reviewed_at`, `rejection_reason`.

import "server-only";

import {
  createItem,
  readItem,
  readItems,
  readUsers,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from "./form-constants";
import {
  normalizeDocumentStatus,
  normalizeDocumentType,
} from "./document-normalize";

// ─── Types ──────────────────────────────────────────────────────────

export type DocumentReviewFilter =
  | "pending"
  | "approved"
  | "rejected"
  | "all";

export interface AdminDocumentSummary {
  id: string;
  childId: string;
  childDisplayName: string;
  documentType: DocumentType | null;
  documentTypeLabel: string;
  fileUuid: string;
  // /api/assets/{uuid} — admin's browser fetches with admin
  // cookies; underlying Directus permission is admin-only via the
  // existing asset proxy.
  fileUrl: string;
  // Mime guessed from the file extension or stored mime — we use it
  // to render an image preview vs PDF embed in the detail page.
  mimeHint: "image" | "pdf" | "other";
  notes: string | null;
  status: DocumentStatus;
  uploadedAt: string | null;
  uploadedByName: string;
  rejectionReason: string | null;
}

// Session 52b — detail shape currently has the same fields as
// summary; kept as a distinct type alias so future per-route
// additions (e.g., review history) don't ripple through the
// summary type used in list rendering.
export type AdminDocumentDetail = AdminDocumentSummary;

export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Document not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidStatusError extends Error {
  readonly code = "invalid_status" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusError";
  }
}

// ─── Internal types ─────────────────────────────────────────────────

type DocumentRow = {
  id: string;
  child: string | null;
  // both columns; normalizers prefer the new one
  type: string | null;
  document_type: string | null;
  file: string | null;
  notes: string | null;
  review_notes: string | null;
  uploaded_by: string | null;
  status: string | null;
  date_created: string | null;
  rejection_reason: string | null;
};

const DOC_FIELDS = [
  "id",
  "child",
  "type",
  "document_type",
  "file",
  "notes",
  "review_notes",
  "uploaded_by",
  "status",
  "date_created",
  "rejection_reason",
] as const;

// File-mime hint helpers. Directus stores the mime per-file in
// directus_files.type. We look up in a batch + map by file uuid;
// fall back to extension parsing if metadata's unavailable.
type FileMeta = { id: string; type: string | null; filename_download: string | null };

async function resolveFileMime(
  fileUuids: string[],
): Promise<Map<string, FileMeta>> {
  const out = new Map<string, FileMeta>();
  if (fileUuids.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("directus_files" as never, {
        filter: { id: { _in: fileUuids } },
        fields: ["id", "type", "filename_download"],
        limit: -1,
      } as never),
    )) as unknown as FileMeta[] | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) out.set(r.id, r);
    }
  } catch (err) {
    console.warn(
      "[admin-documents] resolveFileMime failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

function classifyMime(meta: FileMeta | undefined): "image" | "pdf" | "other" {
  const t = meta?.type?.toLowerCase() ?? "";
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  // Filename-suffix fallback for missing metadata.
  const name = meta?.filename_download?.toLowerCase() ?? "";
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(name)) return "image";
  return "other";
}

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _in: userIds } },
        fields: ["id", "first_name", "last_name", "email"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    }> | undefined;
    if (Array.isArray(users)) {
      for (const u of users) {
        const name =
          [u.first_name, u.last_name]
            .filter((s) => s && s.trim().length > 0)
            .join(" ")
            .trim() || u.email;
        out.set(u.id, name);
      }
    }
  } catch (err) {
    console.warn(
      "[admin-documents] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

async function resolveChildNames(
  childIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (childIds.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _in: childIds } },
        fields: ["id", "display_name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string; display_name: string | null }> | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r.display_name?.trim()) out.set(r.id, r.display_name.trim());
      }
    }
  } catch (err) {
    console.warn(
      "[admin-documents] resolveChildNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

function rowToSummary(
  row: DocumentRow,
  childNames: ReadonlyMap<string, string>,
  userNames: ReadonlyMap<string, string>,
  fileMeta: ReadonlyMap<string, FileMeta>,
): AdminDocumentSummary {
  const docType = normalizeDocumentType(row);
  const status = normalizeDocumentStatus(row);
  const fileUuid = row.file ?? "";
  return {
    id: row.id,
    childId: row.child ?? "",
    childDisplayName:
      (row.child && childNames.get(row.child)) || "Unknown child",
    documentType: docType,
    documentTypeLabel: docType ? DOCUMENT_TYPE_LABELS[docType] : "Other / unknown",
    fileUuid,
    fileUrl: fileUuid ? `/api/assets/${fileUuid}` : "",
    mimeHint: classifyMime(fileUuid ? fileMeta.get(fileUuid) : undefined),
    // Prefer the new `notes` column; fall back to legacy `review_notes`
    // (in case admin needs to read context from a pre-Session-49 row).
    notes: row.notes?.trim() || row.review_notes?.trim() || null,
    status,
    uploadedAt: row.date_created,
    uploadedByName:
      (row.uploaded_by && userNames.get(row.uploaded_by)) || "Unknown DI",
    rejectionReason: row.rejection_reason?.trim() || null,
  };
}

// ─── Public API: list ───────────────────────────────────────────────

/**
 * List documents for the admin queue. Filter defaults to `pending`
 * (the most common admin task); other tabs sort newest-first.
 *
 * Reads both column shapes via the normalizers so legacy + new rows
 * both appear correctly. Status filter uses the normalized vocab:
 * `pending` matches both new `pending` and legacy `pending_review`,
 * etc.
 */
export async function listAdminDocuments(opts?: {
  filter?: DocumentReviewFilter;
  limit?: number;
}): Promise<AdminDocumentSummary[]> {
  const filter = opts?.filter ?? "pending";

  // Translate normalized filter to a Directus _in clause matching
  // both vocabularies. `pending` includes legacy 'pending_review' +
  // 'replacement_requested'; `approved` matches legacy 'verified';
  // `rejected` matches both; we don't surface 'archived'/'waived' in
  // the admin queue (those are terminal states admin already moved
  // past).
  const STATUS_IN: Record<DocumentReviewFilter, string[] | null> = {
    all: null,
    pending: ["pending", "pending_review", "replacement_requested"],
    approved: ["approved", "verified"],
    rejected: ["rejected"],
  };
  const statusValues = STATUS_IN[filter];

  let rows: DocumentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_document" as never, {
        ...(statusValues
          ? { filter: { status: { _in: statusValues } } }
          : {}),
        fields: [...DOC_FIELDS],
        // FIFO for pending so oldest gets reviewed first; newest-
        // first for decided history.
        sort: filter === "pending" ? ["date_created"] : ["-date_created"],
        limit: opts?.limit ?? 100,
      } as never),
    )) as unknown as DocumentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-documents] listAdminDocuments failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  const childIds = Array.from(
    new Set(rows.map((r) => r.child).filter((x): x is string => !!x)),
  );
  const userIds = Array.from(
    new Set(rows.map((r) => r.uploaded_by).filter((x): x is string => !!x)),
  );
  const fileIds = Array.from(
    new Set(rows.map((r) => r.file).filter((x): x is string => !!x)),
  );

  const [childNames, userNames, fileMeta] = await Promise.all([
    resolveChildNames(childIds),
    resolveUserNames(userIds),
    resolveFileMime(fileIds),
  ]);

  return rows.map((r) => rowToSummary(r, childNames, userNames, fileMeta));
}

// ─── Public API: detail ─────────────────────────────────────────────

export async function getAdminDocumentDetail(
  documentId: string,
): Promise<AdminDocumentDetail | null> {
  if (!documentId) return null;
  let row: DocumentRow | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child_document" as never, documentId as never, {
        fields: [...DOC_FIELDS],
      } as never),
    )) as unknown as DocumentRow | undefined;
    row = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) return null;
    console.warn(
      "[admin-documents] getAdminDocumentDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  const [childNames, userNames, fileMeta] = await Promise.all([
    row.child ? resolveChildNames([row.child]) : Promise.resolve(new Map()),
    row.uploaded_by
      ? resolveUserNames([row.uploaded_by])
      : Promise.resolve(new Map()),
    row.file ? resolveFileMime([row.file]) : Promise.resolve(new Map()),
  ]);
  return rowToSummary(row, childNames, userNames, fileMeta);
}

// ─── Public API: mutations ──────────────────────────────────────────

export async function approveDocument(
  documentId: string,
  adminUserId: string,
): Promise<{ documentId: string; childId: string | null; uploaderId: string | null }> {
  const doc = await readDocOrThrow(documentId);
  const normalizedStatus = normalizeDocumentStatus(doc);
  if (normalizedStatus === "approved") {
    throw new InvalidStatusError("Document is already approved.");
  }
  if (normalizedStatus === "rejected" || normalizedStatus === "archived") {
    throw new InvalidStatusError(
      `Cannot approve a ${normalizedStatus} document.`,
    );
  }

  await directusServer().request(
    updateItem("child_document" as never, documentId as never, {
      status: "approved",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    } as never),
  );

  // Best-effort audit. Failure swallowed (admin's action already
  // succeeded; the missing log row will surface in server-side
  // monitoring instead of bouncing the user).
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_approved_document",
        collection: "child_document",
        record_id: documentId,
        metadata: {
          ...(doc.child ? { childId: doc.child } : {}),
          documentType: normalizeDocumentType(doc),
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-documents] approve audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    documentId,
    childId: doc.child ?? null,
    uploaderId: doc.uploaded_by ?? null,
  };
}

export async function rejectDocument(
  documentId: string,
  adminUserId: string,
  reason: string,
): Promise<{ documentId: string; childId: string | null; uploaderId: string | null; reason: string }> {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 10) {
    throw new Error("rejection reason must be at least 10 characters");
  }

  const doc = await readDocOrThrow(documentId);
  const normalizedStatus = normalizeDocumentStatus(doc);
  if (normalizedStatus === "approved" || normalizedStatus === "archived") {
    throw new InvalidStatusError(
      `Cannot reject a ${normalizedStatus} document.`,
    );
  }

  await directusServer().request(
    updateItem("child_document" as never, documentId as never, {
      status: "rejected",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: trimmed,
    } as never),
  );

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_rejected_document",
        collection: "child_document",
        record_id: documentId,
        metadata: {
          ...(doc.child ? { childId: doc.child } : {}),
          documentType: normalizeDocumentType(doc),
          // Rejection reason itself is captured in the row; metadata
          // only needs the fact-of-rejection for analytics.
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-documents] reject audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    documentId,
    childId: doc.child ?? null,
    uploaderId: doc.uploaded_by ?? null,
    reason: trimmed,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────

async function readDocOrThrow(documentId: string): Promise<DocumentRow> {
  try {
    const row = (await directusServer().request(
      readItem("child_document" as never, documentId as never, {
        fields: [...DOC_FIELDS],
      } as never),
    )) as unknown as DocumentRow | undefined;
    if (!row) throw new NotFoundError();
    return row;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    if (looksLikeNotFound(err)) throw new NotFoundError();
    throw err;
  }
}

function looksLikeNotFound(err: unknown): boolean {
  if (!err) return false;
  const errors = (err as { errors?: Array<{ extensions?: { code?: string } }> })
    .errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const code = e?.extensions?.code;
      if (code === "FORBIDDEN" || code === "ROUTE_NOT_FOUND") return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("FORBIDDEN") || msg.includes("not found");
}
