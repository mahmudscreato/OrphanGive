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
  deleteItem,
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

// Session 52e — kept as documentation of the canonical post-Session-49
// shape but no longer used at the Directus fetch layer; we use
// `fields=["*"]` so a legacy Directus that's missing any of the
// post-49 fields still returns its rows instead of FORBIDDEN-out.
// Referenced via `void` so TS doesn't strip it under noUnusedLocals.
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
void DOC_FIELDS;

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

// Session 52c — Single source of truth for status filter values.
// admin-home-stats imports these so the home tile counter and the
// queue list page agree on which legacy values map to which tab.
// Without the alignment, "tile says 1 pending, queue shows empty"
// mismatches surfaced.
export const DOCUMENT_PENDING_STATUS_VALUES: ReadonlyArray<string> = [
  "pending",
  "pending_review",
  "replacement_requested",
];
export const DOCUMENT_APPROVED_STATUS_VALUES: ReadonlyArray<string> = [
  "approved",
  "verified",
];
export const DOCUMENT_REJECTED_STATUS_VALUES: ReadonlyArray<string> = [
  "rejected",
];

/**
 * Session 52d — single function called by BOTH the home tile and
 * the queue list page header. Pre-52d the two surfaces issued
 * logically-identical but separately-written queries; any drift
 * (or perceived drift from a stale cache — Mahmud's smoke test
 * showed home=9, queue=0) is now impossible because there's just
 * one read path. Returns null on error; caller renders "—".
 */
export async function countPendingDocuments(): Promise<number | null> {
  try {
    const rows = (await directusServer().request(
      readItems("child_document" as never, {
        filter: { status: { _in: [...DOCUMENT_PENDING_STATUS_VALUES] } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[admin-documents] countPendingDocuments failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
/**
 * Session 60 — per-child documents reader used by the admin proposal
 * detail page. Returns every status (admin sees pending alongside
 * approved/rejected on the proposal review surface so they can
 * audit the full uploaded set). No DI scope filter — admin sees
 * everything.
 */
export async function listAdminDocumentsForChild(
  childId: string,
): Promise<AdminDocumentSummary[]> {
  if (!childId) return [];
  let rows: DocumentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_document" as never, {
        filter: { child: { _eq: childId } },
        fields: ["*"],
        limit: -1,
      } as never),
    )) as unknown as DocumentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-documents] listAdminDocumentsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (rows.length === 0) return [];

  // Same date_created client-side sort logic as listAdminDocuments.
  rows.sort((a, b) => {
    const aT = a.date_created ? Date.parse(a.date_created) : 0;
    const bT = b.date_created ? Date.parse(b.date_created) : 0;
    return bT - aT; // newest first
  });

  const childIds = [childId];
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

export async function listAdminDocuments(opts?: {
  filter?: DocumentReviewFilter;
  limit?: number;
}): Promise<AdminDocumentSummary[]> {
  const filter = opts?.filter ?? "pending";

  // Translate normalized filter to a Directus _in clause matching
  // both vocabularies (Session 50 dual-enum). The status-value
  // arrays are EXPORTED below so admin-home-stats can use the same
  // lists for its counter — Session 52c brief Bug 3 specifically
  // called out that a divergence here surfaces as "tile says N
  // pending, queue shows empty" (or vice versa).
  const STATUS_IN: Record<DocumentReviewFilter, string[] | null> = {
    all: null,
    pending: [...DOCUMENT_PENDING_STATUS_VALUES],
    approved: [...DOCUMENT_APPROVED_STATUS_VALUES],
    rejected: [...DOCUMENT_REJECTED_STATUS_VALUES],
  };
  const statusValues = STATUS_IN[filter];

  // Session 52e — Bug 3: previously this fetched DOC_FIELDS
  // explicitly and sorted by date_created. On any Directus
  // deployment where the post-Session-49 fields (`document_type`,
  // `notes`, `date_created`, `rejection_reason`) are missing —
  // including Mahmud's localhost where the schema migration was
  // never run — Directus answered with a FORBIDDEN error and an
  // EMPTY data array (rather than ignoring the missing field).
  // That meant: home tile says 19 pending (countPendingDocuments
  // only asks for `id` which always exists, so it works), but the
  // queue list rendered 0 rows. To fix without forcing a schema
  // migration: use fields=* (Directus returns whatever columns the
  // collection actually has) and sort client-side so a missing
  // date_created doesn't tank the whole request. The row mapper
  // already tolerates undefined for the post-49 fields.
  let rows: DocumentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_document" as never, {
        ...(statusValues
          ? { filter: { status: { _in: statusValues } } }
          : {}),
        fields: ["*"],
        // No server-side sort — sorted in-memory below so a missing
        // date_created field can't trigger FORBIDDEN.
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

  // Session 52e — client-side sort. FIFO (oldest first) for
  // pending so admin tackles the longest-waiting row first;
  // newest-first for decided / all so recently-actioned rows lead.
  // When date_created is missing on every row (legacy schema),
  // this is a no-op and rows stay in Directus's natural order.
  const sortAsc = filter === "pending";
  rows.sort((a, b) => {
    const aT = a.date_created ? Date.parse(a.date_created) : 0;
    const bT = b.date_created ? Date.parse(b.date_created) : 0;
    return sortAsc ? aT - bT : bT - aT;
  });

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
      // Session 52e — see listAdminDocuments for the fields=* story.
      // Same FORBIDDEN-on-missing-field gotcha applies here, and
      // would silently break the detail page on the legacy schema.
      readItem("child_document" as never, documentId as never, {
        fields: ["*"],
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

/**
 * Session 52d — admin direct upload of a document. Lands as
 * `status='approved'` immediately (no review queue self-loop) with
 * `uploaded_by` set to the admin user. Used on the per-child
 * documents tab when admin needs to add documents that the DI never
 * uploaded (e.g., admin received a scan via email).
 *
 * Pre-conditions: `fileUuid` must be an existing `directus_files`
 * row uploaded via the existing `uploadDocumentToDirectus` helper.
 */
export async function uploadDirectDocument(input: {
  adminUserId: string;
  childId: string;
  documentType: DocumentType;
  fileUuid: string;
  notes?: string | null;
}): Promise<{ documentId: string; childId: string }> {
  const { adminUserId, childId, documentType, fileUuid } = input;
  if (!adminUserId || !childId || !documentType || !fileUuid) {
    throw new InvalidStatusError("missing required fields");
  }

  const created = (await directusServer().request(
    createItem("child_document" as never, {
      child: childId,
      document_type: documentType,
      file: fileUuid,
      notes: input.notes?.trim() || null,
      // Admin uploads land approved immediately.
      status: "approved",
      uploaded_by: adminUserId,
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[admin-documents] uploadDirectDocument: no id returned");
  }

  // Best-effort audit.
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_uploaded_document",
        collection: "child_document",
        record_id: id,
        metadata: { childId, documentType, fileUuid },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-documents] upload audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return { documentId: String(id), childId };
}

/**
 * Session 52c — admin cleanup remove for documents.
 *
 * Distinct from rejectDocument:
 *   - reject: records a decision with a DI-facing reason; row stays
 *     with status='rejected' so DI can see why + resubmit.
 *   - remove: hard delete; admin uses this when a DI uploaded
 *     something by mistake and no decision needs to be communicated
 *     (the DI also typically agrees the upload was wrong).
 *
 * Gated to `pending` status to prevent admins from accidentally
 * deleting an approved row that's already part of the verification
 * record — those are immutable via this UI (admin can still hard-
 * delete via Directus admin if truly needed).
 *
 * The underlying directus_files row is NOT deleted; the FK is ON
 * DELETE RESTRICT to prevent stranding files. Admin's general
 * orphan-file cleanup handles that separately.
 */
export async function removeDocument(
  documentId: string,
  adminUserId: string,
  // Session 52d — optional reason. REQUIRED when the row was
  // previously approved (the route enforces; the lib just trusts).
  // Surfaces in the DI notification body and in the audit metadata.
  reason?: string | null,
): Promise<{
  documentId: string;
  childId: string | null;
  uploaderId: string | null;
  // The status the row had BEFORE removal — caller uses this to
  // decide whether to fire a DI notification (only for approved
  // post-removes; pending mistake-cleanups stay silent).
  wasStatus: "pending" | "approved" | "rejected" | "archived";
}> {
  const doc = await readDocOrThrow(documentId);
  const normalizedStatus = normalizeDocumentStatus(doc);
  // Session 52d — admin can remove at any status. The pending vs
  // post-approval distinction is reflected in the audit action
  // name + (caller's) notification choice; the actual delete is
  // unconditional.

  await directusServer().request(
    deleteItem("child_document" as never, documentId as never),
  );

  // Best-effort audit. Failure swallowed.
  const auditAction =
    normalizedStatus === "approved"
      ? "admin_removed_approved_document"
      : "admin_removed_document";
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: auditAction,
        collection: "child_document",
        record_id: documentId,
        metadata: {
          ...(doc.child ? { childId: doc.child } : {}),
          documentType: normalizeDocumentType(doc),
          previousStatus: normalizedStatus,
          ...(reason && reason.trim().length > 0
            ? { reason: reason.trim() }
            : {}),
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-documents] remove audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    documentId,
    childId: doc.child ?? null,
    uploaderId: doc.uploaded_by ?? null,
    wasStatus: normalizedStatus,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────

async function readDocOrThrow(documentId: string): Promise<DocumentRow> {
  try {
    const row = (await directusServer().request(
      // Session 52e — fields=* (see listAdminDocuments for rationale).
      readItem("child_document" as never, documentId as never, {
        fields: ["*"],
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
