// Session 49 — DI documents data layer.
//
// child_document holds the four legal/identity documents collected
// during a DI's initial visit (parent death certificate, child birth
// certificate, guardian NID, school recommendation). Tier 3 admin-
// only — these never appear on any donor surface, regardless of
// review status. The donor-side `DocumentsBanner` shows only that
// each REQUIRED type has been verified, not the file itself.
//
// Schema reality (per migrations/session-49/001-documents.sql):
//
//   id                uuid PK
//   child             uuid NOT NULL FK -> child(id) ON DELETE CASCADE
//   proposal          uuid     FK -> child_proposal(id) ON DELETE SET NULL
//   document_type     varchar(32)   — Session 49 brief enum (see below)
//   file              uuid NOT NULL FK -> directus_files(id) ON DELETE RESTRICT
//   notes             text
//   uploaded_by       uuid     FK -> directus_users(id)
//   status            varchar(32) DEFAULT 'pending'
//                                — Session 49 brief enum: pending |
//                                  approved | rejected | archived
//   reviewed_by       uuid     FK -> directus_users(id)
//   reviewed_at       timestamptz
//   rejection_reason  text
//   date_created      timestamptz DEFAULT now()
//
// Legacy columns (`type`, legacy `status` values, `review_notes`,
// `waiver_justification`) coexist on the same table — see the
// migration header for the reconciliation story. This data layer
// exclusively reads/writes the brief-spec columns; the legacy
// donor-side renderer (DocumentsBanner) reads the legacy columns
// independently.
//
// Privacy / scope:
//   - Every read AND write scope-checks the childId via
//     canDiAttachToChild (Session 52c — ownership-only, includes
//     own stub children with status='awaiting_intake' so the draft-
//     mode unlock from Session 52a works end-to-end). Pre-52c this
//     used getDiChildById which rejected stubs and silently broke
//     the entire upload flow for new-child drafts.
//   - Writes use the DI's session token so uploaded_by auto-fills
//     correctly via Directus's user-created special. (Same pattern
//     as moments + intake photos.)
//   - Out-of-scope reads return [] (caller renders empty state);
//     writes throw OutOfScopeError → 404 at the route layer.

import "server-only";

import {
  createItem,
  deleteItem,
  readItem,
  readItems,
  updateItem,
  withToken,
} from "@directus/sdk";
import { directusServer } from "./directus";
import { canDiAttachToChild } from "./di-children";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from "./form-constants";

// ─── Public types ───────────────────────────────────────────────────

export interface DocumentSummary {
  id: string;
  childId: string;
  documentType: DocumentType;
  documentTypeLabel: string;
  fileUuid: string;
  fileUrl: string; // /api/assets/{uuid}
  notes: string | null;
  status: DocumentStatus;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
  isOwn: boolean;
  rejectionReason: string | null;
}

export interface CreateDocumentInput {
  childId: string;
  documentType: DocumentType;
  fileUuid: string;
  notes?: string | null;
  // Optional — set when this document is being attached as part of a
  // CREATE proposal. For edit-mode uploads against a live child this
  // stays null.
  proposalId?: string | null;
}

export interface UpdateDocumentInput {
  notes?: string | null;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class OutOfScopeError extends Error {
  readonly code = "out_of_scope" as const;
  constructor(message = "Document not in DI scope") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

export class InvalidInputError extends Error {
  readonly code = "invalid_input" as const;
  constructor(public readonly field: string, reason: string) {
    super(`${field}: ${reason}`);
    this.name = "InvalidInputError";
  }
}

// ─── Internal types ─────────────────────────────────────────────────

type DocumentRow = {
  id: string;
  child: string | null;
  proposal: string | null;
  document_type: string | null;
  file: string | null;
  notes: string | null;
  uploaded_by: string | null;
  status: string | null;
  date_created: string | null;
  rejection_reason: string | null;
};

const DOCUMENT_FIELDS = [
  "id",
  "child",
  "proposal",
  "document_type",
  "file",
  "notes",
  "uploaded_by",
  "status",
  "date_created",
  "rejection_reason",
] as const;

function isDocumentType(s: string | null | undefined): s is DocumentType {
  return s !== null && s !== undefined && (DOCUMENT_TYPES as readonly string[]).includes(s);
}

function isDocumentStatus(s: string | null | undefined): s is DocumentStatus {
  return s === "pending" || s === "approved" || s === "rejected" || s === "archived";
}

function rowToSummary(row: DocumentRow, userId: string): DocumentSummary | null {
  // Defensive: the legacy `type` rows have null `document_type` until
  // backfilled. We hide them from the new DI-side surface entirely so
  // the form only sees brief-spec rows.
  if (!isDocumentType(row.document_type)) return null;
  return {
    id: row.id,
    childId: row.child ?? "",
    documentType: row.document_type,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[row.document_type],
    fileUuid: row.file ?? "",
    fileUrl: row.file ? `/api/assets/${row.file}` : "",
    notes: row.notes?.trim() || null,
    status: isDocumentStatus(row.status) ? row.status : "pending",
    uploadedAt: row.date_created,
    uploadedByUserId: row.uploaded_by,
    isOwn: row.uploaded_by === userId,
    rejectionReason: row.rejection_reason?.trim() || null,
  };
}

// ─── Public API: read ───────────────────────────────────────────────

/**
 * List documents for a child. Scope-guarded: returns [] if the DI
 * doesn't have access to the child.
 *
 * Filters to the brief-spec rows only (those with a non-null
 * document_type). Legacy rows on the same table — created via the
 * pre-Session-49 schema with `type` populated and `document_type`
 * NULL — are intentionally hidden from this surface so the new form
 * UX stays consistent. Legacy rows still surface on the donor-side
 * DocumentsBanner via its own data path.
 */
export async function listDocumentsForChild(
  userId: string,
  childId: string,
): Promise<DocumentSummary[]> {
  // Session 52c — ownership-only check; permits own stubs.
  const ok = await canDiAttachToChild(childId, userId);
  if (!ok) return [];

  let rows: DocumentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_document" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            // Brief-spec rows only — see header. Filtering server-side
            // keeps the response payload small.
            { document_type: { _nnull: true } },
          ],
        },
        fields: [...DOCUMENT_FIELDS],
        sort: ["document_type", "-date_created"],
        limit: -1,
      } as never),
    )) as unknown as DocumentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-documents] listDocumentsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows
    .map((r) => rowToSummary(r, userId))
    .filter((r): r is DocumentSummary => r !== null);
}

/**
 * Fetch a single document and confirm the DI owns it. Returns null
 * on miss / not-owned. Used by PATCH/DELETE to collapse "not exists"
 * with "not allowed" before mutation.
 */
async function getOwnDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  if (!documentId || typeof documentId !== "string") return null;
  try {
    const row = (await directusServer().request(
      readItem("child_document" as never, documentId, {
        fields: [...DOCUMENT_FIELDS],
      } as never),
    )) as unknown as DocumentRow | undefined;
    if (!row) return null;
    if (row.uploaded_by !== userId) return null;
    return row;
  } catch {
    return null;
  }
}

// ─── Public API: write ──────────────────────────────────────────────

/**
 * Create a document row. Pre-conditions:
 *   - The DI must have scope on the target child.
 *   - documentType must be one of DOCUMENT_TYPES.
 *   - fileUuid must be a non-empty string (the file is assumed
 *     uploaded already via /api/di/uploads/photo or another upload
 *     pipeline that returns a directus_files UUID).
 *
 * Issued AS THE DI USER via withToken (scope/RLS). `uploaded_by` is set
 * EXPLICITLY to the DI's UUID in the payload — the field has no
 * user-created special, so it would otherwise be written NULL.
 *
 * Replacement workflow: there's a partial unique index on
 * (child, document_type) WHERE status='approved'. If admin has
 * already approved a document of this type for this child, a second
 * approval would violate the constraint — but this CREATE writes
 * status='pending' so it always succeeds. Admin reconciles by
 * archiving/rejecting the previous approved row before approving
 * the new one.
 */
export async function createDocument(
  session: { userId: string; accessToken: string },
  input: CreateDocumentInput,
): Promise<{ documentId: string }> {
  if (!input.childId || typeof input.childId !== "string") {
    throw new InvalidInputError("childId", "required");
  }
  if (!isDocumentType(input.documentType)) {
    throw new InvalidInputError("documentType", "must be one of the four allowed types");
  }
  if (!input.fileUuid || input.fileUuid.length < 8) {
    throw new InvalidInputError("fileUuid", "required");
  }
  if (input.notes && input.notes.trim().length > 1000) {
    throw new InvalidInputError("notes", "max 1000 characters");
  }

  // Session 52c — ownership-only check (includes own stubs).
  const ok = await canDiAttachToChild(input.childId, session.userId);
  if (!ok) throw new OutOfScopeError();

  const created = (await directusServer().request(
    withToken(
      session.accessToken,
      createItem("child_document" as never, {
        child: input.childId,
        proposal: input.proposalId ?? null,
        document_type: input.documentType,
        file: input.fileUuid,
        notes: input.notes?.trim() || null,
        status: "pending",
        // uploaded_by is a plain m2o — there is NO `user-created` special on
        // this field, so it does NOT auto-fill. Set it explicitly to the DI so
        // attribution ("Uploaded by …") resolves and reject/re-upload notifies
        // reach the uploader. date_created still auto-fills via its special.
        uploaded_by: session.userId,
      } as never),
    ),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-documents] createDocument: no id returned");
  }
  return { documentId: String(id) };
}

/**
 * Patch notes on a pending document. Throws OutOfScopeError if the
 * row isn't owned by the DI OR isn't in pending status (collapsed
 * for privacy).
 *
 * Notes is the only DI-editable field per the brief. status,
 * reviewed_by, rejection_reason, document_type, and file are all
 * admin-only.
 */
export async function updateDocument(
  userId: string,
  documentId: string,
  fields: UpdateDocumentInput,
): Promise<{ ok: true }> {
  const row = await getOwnDocument(userId, documentId);
  if (!row) throw new OutOfScopeError();
  if (row.status !== "pending") throw new OutOfScopeError();

  const patch: Record<string, unknown> = {};
  if (fields.notes !== undefined) {
    if (fields.notes && fields.notes.trim().length > 1000) {
      throw new InvalidInputError("notes", "max 1000 characters");
    }
    patch.notes = fields.notes?.trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  await directusServer().request(
    updateItem("child_document" as never, documentId, patch as never),
  );
  return { ok: true };
}

/**
 * Delete a PENDING or REJECTED document owned by this DI. Throws
 * OutOfScopeError on miss / not-owned / approved-or-archived. Hard
 * delete — a pending or rejected row has no audit history beyond the
 * audit_log row that records the deletion. Allowing rejected removal
 * lets the DI clear a rejected document to re-upload a fresh version
 * (fix/parked-p1-batch — mirror of the intake-photo fix).
 *
 * The underlying directus_files row is NOT deleted (FK is ON DELETE
 * RESTRICT to prevent stranding the file). Admin sweeps orphaned
 * files separately.
 */
export async function deleteDocument(
  userId: string,
  documentId: string,
): Promise<{ ok: true; childId: string; documentType: DocumentType | null }> {
  const row = await getOwnDocument(userId, documentId);
  if (!row) throw new OutOfScopeError();
  // fix/parked-p1-batch — allow the DI to remove their own PENDING or
  // REJECTED document (approved/archived stay non-removable, admin-owned
  // once accepted). Rejected removal clears the dead-end where a DI
  // couldn't re-upload after a rejection. Exact mirror of
  // deleteIntakePhoto's gate.
  if (row.status !== "pending" && row.status !== "rejected") {
    throw new OutOfScopeError();
  }

  await directusServer().request(
    deleteItem("child_document" as never, documentId),
  );
  return {
    ok: true,
    childId: row.child ?? "",
    documentType: isDocumentType(row.document_type) ? row.document_type : null,
  };
}

// ─── Helper: missing-doc summary for the form's soft warning ────────

/**
 * Given a list of documents for a child, return the set of
 * DOCUMENT_TYPES that don't yet have a non-rejected (i.e. pending OR
 * approved) row. Used by the form's submit-time soft warning to
 * surface "Submitting without [X] documents — admin will follow up."
 */
export function missingRequiredDocumentTypes(
  documents: DocumentSummary[],
): DocumentType[] {
  const present = new Set<DocumentType>();
  for (const d of documents) {
    if (d.status !== "rejected" && d.status !== "archived") {
      present.add(d.documentType);
    }
  }
  return DOCUMENT_TYPES.filter((t) => !present.has(t));
}
