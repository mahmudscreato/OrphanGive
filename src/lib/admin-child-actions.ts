// Session 66 — admin child mutation helpers.
//
// One helper per admin action on the child detail page:
//   editChildAsAdmin         direct field edits, bypasses the proposal
//                            queue. Computes a diff against the
//                            current row so the audit payload only
//                            carries what actually changed.
//   archiveChildAsAdmin      status → 'withdrawn' (the existing
//                            terminal value — see lifecycle note
//                            below). Soft delete: data persists,
//                            donor surfaces stop showing the row.
//   reactivateChildAsAdmin   status → 'active'. Reverses the above.
//   requestDocumentReupload  no schema mutation. Writes an audit row
//                            + DI notification. The DI sees the nudge
//                            in their bell and re-uploads via the
//                            existing document flow; admin then
//                            archives the stale row from the docs
//                            queue.
//   requestIntakePhotoReupload  same shape as the document variant.
//
// Lifecycle mapping (status enum vs brief vocabulary):
//   The brief asks for "archive" + "mark inactive" + "reactivate"
//   as distinct semantics, but the production child.status enum
//   today is only {active, awaiting_intake, withdrawn}. Until a
//   future schema change ships dedicated 'archived' / 'inactive'
//   values:
//     - Archive  →  status='withdrawn' (terminal; donor-facing
//                   reads already filter this out)
//     - Reactivate → status='active'
//     - "Mark inactive" is NOT implemented in V1 — we collapse it
//       into Archive so admin has a single soft-delete affordance.
//       Documented for the ship report.
//
// Audit logging: every mutation records a row via recordAuditEvent
// (best-effort, swallowed on failure — never blocks a successful
// state change). Diff payloads run through redactAuditPayload so
// Tier 3 phone fields don't appear verbatim.
//
// Permissions: uses directusServer() (admin token). Admin role
// already has read/write on child + child_document + child_intake_photo
// + audit_log + notification (verified against admin-proposals.ts +
// admin-documents.ts which use the same token).

import "server-only";

import { readItem, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";
import { notify } from "./di-notifications";
import { toPgTextArrayLiteral } from "./di-proposals";

// ─── Typed errors ───────────────────────────────────────────────────

export class ChildNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Child not found") {
    super(message);
    this.name = "ChildNotFoundError";
  }
}

export class InvalidChildStateError extends Error {
  readonly code = "invalid_state" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidChildStateError";
  }
}

export class ChildWriteFailedError extends Error {
  readonly code = "write_failed" as const;
  constructor(public readonly cause?: unknown) {
    super(
      cause instanceof Error
        ? `Child write failed: ${cause.message}`
        : "Child write failed",
    );
    this.name = "ChildWriteFailedError";
  }
}

export class ReuploadTargetNotFoundError extends Error {
  readonly code = "target_not_found" as const;
  constructor(message: string) {
    super(message);
    this.name = "ReuploadTargetNotFoundError";
  }
}

// ─── Editable surface for admin direct edit ─────────────────────────
//
// Admin edits write directly to the child row. Field set is the same
// as the DI's editable surface (CHILD_EDIT_FIELDS in di-children.ts)
// minus the relations expressed as ids:
//   - bd_division, bd_district: M2O FK; admin passes the slug code,
//     we resolve the FK in the writer.
//   - educational_organization: M2O FK; admin passes uuid or null.
//   - areas_of_interest: text[]; serialised via toPgTextArrayLiteral.

export interface AdminChildEditableFields {
  // Identity
  display_name?: string;
  gender?: string | null;
  date_of_birth?: string | null;
  photo_consent?: boolean | null;
  // Location
  bd_division?: string | null;
  bd_district?: string | null;
  district_internal?: string | null;
  permanent_address?: string | null;
  // Education
  education_level?: string | null;
  class_grade?: string | null;
  educational_organization?: string | null;
  school_name_raw?: string | null;
  areas_of_interest?: string[] | null;
  // Donor-facing
  story?: string;
  // Care plan
  support_type?: string | null;
  monthly_cost?: number | null;
  priority_support?: string | null;
  priority_notes?: string | null;
  // Health
  blood_group?: string | null;
  vaccination_status?: string | null;
  last_medical_checkup?: string | null;
  disability_status?: string | null;
  disability_notes?: string | null;
  // Family
  parent_loss?: string | null;
  siblings_count?: number | null;
  sibling_position?: number | null;
  siblings_notes?: string | null;
  household_size?: number | null;
  household_income_source?: string | null;
  monthly_household_income_bdt?: number | null;
  // Guardian
  guardian_relationship?: string | null;
  guardian_employment_type?: string | null;
  guardian_employment?: string | null;
  guardian_phone?: string | null;
  guardian_phone_alt?: string | null;
  guardian_summary_internal?: string | null;
  additional_family_notes?: string | null;
  // Visit
  last_visit_date?: string | null;
  submission_date?: string | null;
}

// Fields that we know are required-on-CREATE per the DI form. Admin
// edits aren't allowed to BLANK these — admins are bypassing the
// proposal queue, not licensed to break a row's invariants. (Hard
// validation lives in the route handler that calls editChildAsAdmin.)
export const ADMIN_EDIT_REQUIRED_FIELDS: ReadonlyArray<
  keyof AdminChildEditableFields
> = [
  "display_name",
  "date_of_birth",
  "bd_division",
  "bd_district",
  "district_internal",
  "support_type",
  "monthly_cost",
  "story",
  "guardian_summary_internal",
  "guardian_relationship",
  "parent_loss",
  "guardian_phone",
];

// ─── Internal: minimal current-row fetch ───────────────────────────
//
// Direct-edit path needs the CURRENT row values to compute a
// before/after diff for the audit log. Same shape as the editable
// surface plus id so we can detect "not found" early.

interface MinimalCurrentRow {
  id: string;
  status: string | null;
  // editable mirror — used for diff computation
  current: Record<string, unknown>;
}

async function fetchCurrentChild(childId: string): Promise<MinimalCurrentRow> {
  if (!childId) throw new ChildNotFoundError();
  try {
    const result = (await directusServer().request(
      readItem("child" as never, childId as never, {
        fields: ["*"],
      } as never),
    )) as unknown as Record<string, unknown> | null | undefined;
    if (!result) throw new ChildNotFoundError();
    return {
      id: String(result.id),
      status: (result.status as string | null) ?? null,
      current: result,
    };
  } catch (err) {
    if (err instanceof ChildNotFoundError) throw err;
    if (looksLikeNotFound(err)) throw new ChildNotFoundError();
    throw new ChildWriteFailedError(err);
  }
}

// ─── Edit (direct write, bypasses proposal queue) ──────────────────

export interface EditChildResult {
  childId: string;
  appliedFields: string[];
  editedAt: string;
}

/**
 * Apply admin edits to a child row. Only fields explicitly provided
 * in `edits` are written; everything else is preserved. Computes a
 * diff against the current row so the audit row's `diff` payload
 * only carries the values that actually changed.
 *
 * No notification fires (admin internal — DI doesn't need a per-edit
 * notification on every admin tweak). Audit row uses
 * action='admin_edited_child'.
 */
export async function editChildAsAdmin(
  childId: string,
  adminUserId: string,
  edits: AdminChildEditableFields,
  request?: Request,
): Promise<EditChildResult> {
  const row = await fetchCurrentChild(childId);

  // Build the write payload + diff in one pass. Skip unchanged
  // fields so we don't pointlessly bump date_updated when admin
  // hits Save on a no-op form.
  const writePayload: Record<string, unknown> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  for (const [key, newValue] of Object.entries(edits) as Array<
    [keyof AdminChildEditableFields, unknown]
  >) {
    if (newValue === undefined) continue;
    const oldValue = currentValueOf(row.current, key);
    if (!isActuallyChanged(oldValue, newValue)) continue;

    // areas_of_interest is text[] — Directus REST + the SDK don't
    // serialise JS arrays into Postgres text[] correctly; reuse the
    // same toPgTextArrayLiteral helper admin-proposals.ts uses on
    // approve-CREATE to format the array as `{a,b,c}`.
    if (key === "areas_of_interest") {
      const arr = newValue as string[] | null;
      writePayload[key] =
        Array.isArray(arr) && arr.length > 0
          ? toPgTextArrayLiteral(arr)
          : null;
      diff[key] = { old: oldValue, new: arr };
      continue;
    }

    // Trim free-text strings; collapse all-whitespace to null so we
    // don't store the empty-string-vs-null distinction that
    // di-proposals' normaliseForInsert already enforces on the DI
    // side.
    if (typeof newValue === "string") {
      const trimmed = newValue.trim();
      writePayload[key] = trimmed.length === 0 ? null : trimmed;
      diff[key] = { old: oldValue, new: writePayload[key] };
      continue;
    }

    writePayload[key] = newValue;
    diff[key] = { old: oldValue, new: newValue };
  }

  if (Object.keys(writePayload).length === 0) {
    // No actual change — return early without bumping date_updated
    // or writing a no-op audit row. The route handler maps this to
    // a 200 with appliedFields=[] so the UI can show a "nothing to
    // save" toast.
    return {
      childId: row.id,
      appliedFields: [],
      editedAt: new Date().toISOString(),
    };
  }

  // Required-field enforcement: don't let admin BLANK a required
  // field. (Direct edits skip the strict DI validation pipeline; we
  // restate the minimum here.)
  for (const required of ADMIN_EDIT_REQUIRED_FIELDS) {
    if (required in writePayload && writePayload[required] === null) {
      throw new InvalidChildStateError(
        `Field "${required}" is required and cannot be blanked.`,
      );
    }
  }

  // Write.
  const nowIso = new Date().toISOString();
  try {
    await directusServer().request(
      updateItem("child" as never, childId as never, writePayload as never),
    );
  } catch (err) {
    throw new ChildWriteFailedError(err);
  }

  // Audit (best-effort, redaction-aware).
  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_edited_child",
    collection: "child",
    recordId: childId,
    diff,
    metadata: {
      applied_field_count: Object.keys(writePayload).length,
    },
    request,
  });

  return {
    childId: row.id,
    appliedFields: Object.keys(writePayload),
    editedAt: nowIso,
  };
}

// Helper: read the "current" value for a given editable key from
// the wildcard row. Most are direct keys; bd_division / bd_district
// arrive as either a string FK id or an object with {code} depending
// on the SDK's expansion — we coerce to whatever the writer expects
// (the slug `code`, which is what admin passes back in too).
function currentValueOf(
  row: Record<string, unknown>,
  key: keyof AdminChildEditableFields,
): unknown {
  if (key === "bd_division" || key === "bd_district") {
    const v = row[key];
    if (v && typeof v === "object") {
      return (v as { code?: string | null }).code ?? null;
    }
    return v ?? null;
  }
  return row[key as string] ?? null;
}

// Treats null / undefined / "" as equivalent for string fields.
// Arrays compare by sorted-join. Numbers / booleans by direct
// equality. Same semantics as di-proposals.ts:isActuallyChanged so
// admin edits use the same change-detection logic as the proposal
// flow.
function isActuallyChanged(oldValue: unknown, newValue: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t.length === 0 ? null : t;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      return [...v].sort().join("|");
    }
    return v;
  };
  const a = norm(oldValue);
  const b = norm(newValue);
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return String(a) !== String(b);
}

// ─── Archive (soft delete via status='withdrawn') ──────────────────

export interface ArchiveChildResult {
  childId: string;
  archivedAt: string;
}

/**
 * Soft-archive: flip status='withdrawn'. Donor-facing reads already
 * filter that value out (see children-data.ts), so the row vanishes
 * from public surfaces without losing any data.
 *
 * Reason captured in audit metadata; no dedicated column on `child`
 * yet.
 *
 * Idempotent in a guarded way: re-archiving an already-archived row
 * throws InvalidChildStateError so the admin gets a "already
 * archived" toast instead of a silent re-write.
 */
export async function archiveChildAsAdmin(
  childId: string,
  adminUserId: string,
  reason: string,
  request?: Request,
): Promise<ArchiveChildResult> {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) {
    throw new InvalidChildStateError(
      "Archive reason must be at least 10 characters.",
    );
  }
  if (trimmed.length > 1000) {
    throw new InvalidChildStateError(
      "Archive reason must be 1000 characters or fewer.",
    );
  }

  const row = await fetchCurrentChild(childId);
  if (row.status === "withdrawn") {
    throw new InvalidChildStateError("Child is already archived.");
  }
  const previousStatus = row.status ?? "active";
  const nowIso = new Date().toISOString();

  try {
    await directusServer().request(
      updateItem("child" as never, childId as never, {
        status: "withdrawn",
      } as never),
    );
  } catch (err) {
    throw new ChildWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_archived_child",
    collection: "child",
    recordId: childId,
    diff: { status: { old: previousStatus, new: "withdrawn" } },
    metadata: { reason: trimmed },
    request,
  });

  return { childId, archivedAt: nowIso };
}

// ─── Reactivate (status → active) ──────────────────────────────────

export interface ReactivateChildResult {
  childId: string;
  reactivatedAt: string;
}

export async function reactivateChildAsAdmin(
  childId: string,
  adminUserId: string,
  request?: Request,
): Promise<ReactivateChildResult> {
  const row = await fetchCurrentChild(childId);
  if (row.status === "active") {
    throw new InvalidChildStateError("Child is already active.");
  }
  const previousStatus = row.status ?? "withdrawn";
  const nowIso = new Date().toISOString();

  try {
    await directusServer().request(
      updateItem("child" as never, childId as never, {
        status: "active",
      } as never),
    );
  } catch (err) {
    throw new ChildWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_reactivated_child",
    collection: "child",
    recordId: childId,
    diff: { status: { old: previousStatus, new: "active" } },
    request,
  });

  return { childId, reactivatedAt: nowIso };
}

// ─── Re-upload request (audit + notify, no schema mutation) ────────
//
// Re-upload columns (reupload_requested_at / reupload_reason) DO NOT
// exist on child_document or child_intake_photo today. This is the
// workaround the brief explicitly green-lit: write an audit row + DI
// notification, leave the document/photo row's status untouched.
//
// The DI sees the notification in their bell + /di/notifications and
// re-uploads via the existing document/intake flow. Once the new
// upload is approved, admin can archive the stale row from the docs
// queue (Session 52d's removal endpoint already exists).

export interface RequestReuploadResult {
  targetId: string;
  notifiedDiId: string | null;
  requestedAt: string;
}

interface DocumentTargetRow {
  id: string;
  child: string | null;
  uploaded_by: string | null;
  document_type: string | null;
}

interface IntakePhotoTargetRow {
  id: string;
  child: string | null;
  uploaded_by: string | null;
}

/**
 * Admin asks the DI to re-upload a specific document. Body is the
 * document_id and a reason; the audit metadata carries both, the
 * notification body carries the reason verbatim so the DI sees the
 * exact context admin wrote.
 *
 * The DI recipient is derived from child_document.uploaded_by. If
 * that's null (legacy row), we fall back to NO notification and
 * just write the audit. Admin still gets a 200 so the action
 * doesn't appear to have failed — the audit metadata flags
 * `notified=false` for traceability.
 */
export async function requestDocumentReupload(
  childId: string,
  documentId: string,
  adminUserId: string,
  reason: string,
  request?: Request,
): Promise<RequestReuploadResult> {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) {
    throw new InvalidChildStateError(
      "Re-upload reason must be at least 10 characters.",
    );
  }
  if (trimmed.length > 500) {
    throw new InvalidChildStateError(
      "Re-upload reason must be 500 characters or fewer.",
    );
  }

  // Verify target exists + belongs to this child (defence-in-depth
  // against URL-tampering).
  let doc: DocumentTargetRow | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child_document" as never, documentId as never, {
        fields: ["id", "child", "uploaded_by", "document_type"],
      } as never),
    )) as unknown as DocumentTargetRow | null | undefined;
    doc = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) {
      throw new ReuploadTargetNotFoundError("Document not found.");
    }
    throw new ChildWriteFailedError(err);
  }
  if (!doc) throw new ReuploadTargetNotFoundError("Document not found.");
  if (doc.child !== childId) {
    throw new ReuploadTargetNotFoundError(
      "Document does not belong to this child.",
    );
  }

  const nowIso = new Date().toISOString();
  // Notify the uploader; fall back to the child's assigned DI when
  // uploaded_by is null (legacy rows / any future null) so the request
  // reaches a DI instead of silently no-op'ing. Only null if BOTH null.
  let recipient: string | null = doc.uploaded_by ?? null;
  if (!recipient) {
    try {
      const childRow = (await directusServer().request(
        readItem("child" as never, childId as never, {
          fields: ["assigned_di"],
        } as never),
      )) as unknown as { assigned_di?: string | null } | null | undefined;
      recipient = childRow?.assigned_di ?? null;
    } catch {
      recipient = null;
    }
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_requested_document_reupload",
    collection: "child_document",
    recordId: documentId,
    metadata: {
      reason: trimmed,
      child_id: childId,
      document_type: doc.document_type,
      notified: !!recipient,
    },
    request,
  });

  if (recipient) {
    await notify({
      recipientUserId: recipient,
      type: "admin_requested_document_reupload",
      title: "Please re-upload a document",
      body: trimmed,
      relatedCollection: "child_document",
      relatedId: documentId,
    });
  }

  return { targetId: documentId, notifiedDiId: recipient, requestedAt: nowIso };
}

export async function requestIntakePhotoReupload(
  childId: string,
  intakePhotoId: string,
  adminUserId: string,
  reason: string,
  request?: Request,
): Promise<RequestReuploadResult> {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) {
    throw new InvalidChildStateError(
      "Re-upload reason must be at least 10 characters.",
    );
  }
  if (trimmed.length > 500) {
    throw new InvalidChildStateError(
      "Re-upload reason must be 500 characters or fewer.",
    );
  }

  let photo: IntakePhotoTargetRow | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child_intake_photo" as never, intakePhotoId as never, {
        fields: ["id", "child", "uploaded_by"],
      } as never),
    )) as unknown as IntakePhotoTargetRow | null | undefined;
    photo = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) {
      throw new ReuploadTargetNotFoundError("Intake photo not found.");
    }
    throw new ChildWriteFailedError(err);
  }
  if (!photo) throw new ReuploadTargetNotFoundError("Intake photo not found.");
  if (photo.child !== childId) {
    throw new ReuploadTargetNotFoundError(
      "Intake photo does not belong to this child.",
    );
  }

  const nowIso = new Date().toISOString();
  const recipient = photo.uploaded_by;

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_requested_intake_reupload",
    collection: "child_intake_photo",
    recordId: intakePhotoId,
    metadata: {
      reason: trimmed,
      child_id: childId,
      notified: !!recipient,
    },
    request,
  });

  if (recipient) {
    await notify({
      recipientUserId: recipient,
      type: "admin_requested_intake_reupload",
      title: "Please re-upload an intake photo",
      body: trimmed,
      relatedCollection: "child_intake_photo",
      relatedId: intakePhotoId,
    });
  }

  return {
    targetId: intakePhotoId,
    notifiedDiId: recipient,
    requestedAt: nowIso,
  };
}

// ─── Failure-mode helper (shared shape with admin-children.ts) ────

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
  return (
    msg.includes("FORBIDDEN") ||
    msg.includes("permission to access") ||
    msg.includes("not found")
  );
}
