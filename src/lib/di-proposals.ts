// Session 44 — DI proposal data layer.
//
// Every DI mutation routes through child_proposal. Direct writes to
// `child` are forbidden by the Data Inputter policy (Session 41-v3).
// Admin reviews proposals and approves them; approval is the only
// path to `child` actually changing.
//
// Schema reality (from Session 44 discovery — differs from spec):
//
//   child_proposal columns are FLAT — not a payload jsonb. Each
//   editable child field has its own column on the proposal row
//   (display_name, date_of_birth, bd_division, Photo, story, etc.).
//   For UPDATE proposals we set ONLY the columns being changed; the
//   OLD child snapshot is stored in `previous_snapshot` (json) so
//   admin can render the diff. For CREATE proposals we set all
//   required columns and leave `target_child` null.
//
//   status enum (production, NOT NULL, default 'draft'):
//     draft | pending | approved | rejected
//   No `withdrawn` and no `expired`. We implement withdrawal as a
//   DELETE so the row goes away cleanly; the spec's withdrawn/expired
//   filter pills are dropped (see ship report).
//
//   Other column drift from the spec:
//     - target_child (uuid, nullable)   — not "child" / "child_id"
//     - rejection_reason                — not "review_reason"
//     - published_at                    — not "reviewed_at"
//     - approved_by                     — used for both approve/reject reviewer
//     - no expires_at column            — pruning is admin's job
//     - date_created                    — Directus auto-fills
//
// Privacy:
//   - All reads filter by created_by = userId (the DI's own proposals).
//   - UPDATE writes scope-guard the target child via getDiChildById.
//   - CREATE writes validate bd_division ∈ user's assigned_divisions.
//   - The server NEVER trusts a client-supplied diff — it computes
//     changedFields by re-reading the child and comparing.

import "server-only";

import { createItem, deleteItem, readItems, readUser } from "@directus/sdk";
import { directusServer } from "./directus";
import { getDiChildById } from "./di-children";

// ─── Status / type taxonomies ───────────────────────────────────────

export type ProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export type ProposalType = "create" | "update";

// Set of statuses we actually surface in the UI. (Draft is server-only
// scaffolding — DIs always submit straight to pending.)
export const VISIBLE_PROPOSAL_STATUSES: ReadonlyArray<ProposalStatus> = [
  "pending",
  "approved",
  "rejected",
];

// ─── Editable / creatable shapes ────────────────────────────────────

export interface ChildEditableFields {
  display_name?: string;
  date_of_birth?: string; // ISO date (YYYY-MM-DD)
  bd_division?: string; // slug code, FK to bd_division.code
  district_internal?: string;
  support_type?: string;
  monthly_cost?: number | null;
  education_level?: string | null;
  story?: string;
  guardian_summary_internal?: string;
  last_visit_date?: string | null; // ISO date or null
}

// Required-for-CREATE fields. Note: education_level + last_visit_date
// are optional even on CREATE — they're often unknown at intake.
export interface ChildCreatableFields {
  display_name: string;
  date_of_birth: string;
  bd_division: string;
  district_internal: string;
  support_type: string;
  monthly_cost: number;
  story: string;
  guardian_summary_internal: string;
  education_level?: string | null;
  last_visit_date?: string | null;
}

export type CreateProposalInput =
  | {
      operation: "update";
      childId: string;
      fields: ChildEditableFields;
      photoUuid: string | null; // null = keep existing photo
    }
  | {
      operation: "create";
      fields: ChildCreatableFields;
      photoUuid: string; // required
    };

// ─── Output shapes ──────────────────────────────────────────────────

export interface ProposalSummary {
  id: string;
  proposal_type: ProposalType;
  target_child: string | null;
  // Resolved at query time. For UPDATE proposals we look up the
  // current child's display_name; for CREATE we use the proposal's
  // own display_name column (the proposed name).
  child_display_name: string | null;
  proposed_display_name: string | null;
  status: ProposalStatus;
  date_created: string | null;
  published_at: string | null;
  rejection_reason: string | null;
}

export interface ProposalDiffEntry {
  field: keyof ChildEditableFields | "Photo";
  old: unknown;
  new: unknown;
}

export interface ProposalDetail extends ProposalSummary {
  // The full proposed row as stored — null fields mean "no change"
  // for UPDATE; populated for CREATE.
  proposed: Record<string, unknown>;
  photo_uuid: string | null;
  // Computed diff for UPDATE proposals. null for CREATE.
  diff: ProposalDiffEntry[] | null;
}

// ─── Typed errors ───────────────────────────────────────────────────
//
// Discriminated by class. The API routes catch instanceof and map to
// HTTP statuses; the data layer never decides HTTP shape.

export class OutOfScopeError extends Error {
  readonly code = "out_of_scope" as const;
  constructor(message = "Child is not in DI's scope") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

export class NoChangesError extends Error {
  readonly code = "no_changes" as const;
  constructor(message = "Proposal contains no actual changes") {
    super(message);
    this.name = "NoChangesError";
  }
}

export class DivisionNotAllowedError extends Error {
  readonly code = "division_not_allowed" as const;
  constructor(public readonly divisionCode: string) {
    super(`Division "${divisionCode}" is not in your assigned_divisions`);
    this.name = "DivisionNotAllowedError";
  }
}

export class MissingRequiredFieldError extends Error {
  readonly code = "missing_required_field" as const;
  constructor(public readonly fieldName: string) {
    super(`Required field "${fieldName}" is missing`);
    this.name = "MissingRequiredFieldError";
  }
}

export class InvalidValueError extends Error {
  readonly code = "invalid_value" as const;
  constructor(
    public readonly fieldName: string,
    reason: string,
  ) {
    super(`Invalid value for "${fieldName}": ${reason}`);
    this.name = "InvalidValueError";
  }
}

// ─── Editable field set + diff helpers ──────────────────────────────

const EDITABLE_FIELDS: ReadonlyArray<keyof ChildEditableFields> = [
  "display_name",
  "date_of_birth",
  "bd_division",
  "district_internal",
  "support_type",
  "monthly_cost",
  "education_level",
  "story",
  "guardian_summary_internal",
  "last_visit_date",
];

// Compares submitted value to current child value. Returns true if
// the field is "actually different". Treats null/undefined/"" as
// equivalent so an empty-string submission against a null DB value
// doesn't register as a change.
function isActuallyChanged(
  submitted: unknown,
  current: unknown,
): boolean {
  const norm = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    }
    return v;
  };
  const a = norm(submitted);
  const b = norm(current);
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  // Numbers and dates compare by string serialisation, which is fine
  // for our input shape (ISO dates, integer money).
  return String(a) !== String(b);
}

// ─── Validators ─────────────────────────────────────────────────────

function ensureRequired(
  fieldName: string,
  value: unknown,
): asserts value is string | number {
  if (value === null || value === undefined) {
    throw new MissingRequiredFieldError(fieldName);
  }
  if (typeof value === "string" && value.trim().length === 0) {
    throw new MissingRequiredFieldError(fieldName);
  }
}

function validateDate(fieldName: string, value: string): void {
  // ISO YYYY-MM-DD only. Directus stores `date` columns as strings;
  // we normalise to that shape before insert.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidValueError(fieldName, "expected YYYY-MM-DD");
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidValueError(fieldName, "not a real date");
  }
}

function validateMoney(fieldName: string, value: number | null): void {
  if (value === null) return;
  if (!Number.isFinite(value)) {
    throw new InvalidValueError(fieldName, "must be a finite number");
  }
  if (!Number.isInteger(value)) {
    throw new InvalidValueError(fieldName, "must be a whole number");
  }
  if (value < 0) {
    throw new InvalidValueError(fieldName, "must be ≥ 0");
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Reads the DI's assigned_divisions from directus_users. Returns
 * an empty array if null/missing.
 */
export async function getAssignedDivisionsForUser(
  userId: string,
): Promise<string[]> {
  try {
    const user = (await directusServer().request(
      readUser(userId, {
        fields: ["assigned_divisions"],
      } as never),
    )) as unknown as { assigned_divisions?: string[] | null } | undefined;
    if (user && Array.isArray(user.assigned_divisions)) {
      return user.assigned_divisions.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
    }
    return [];
  } catch (err) {
    console.warn(
      "[di-proposals] getAssignedDivisionsForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Returns true if the given bd_division code is in the DI's
 * assigned_divisions. Empty / null assigned_divisions → always false.
 */
export async function isDivisionAllowedForUser(
  userId: string,
  bdDivisionCode: string,
): Promise<boolean> {
  if (!bdDivisionCode) return false;
  const assigned = await getAssignedDivisionsForUser(userId);
  if (assigned.length === 0) return false;
  return assigned.includes(bdDivisionCode);
}

/**
 * Insert a new child_proposal row.
 *
 *   For UPDATE: scope-checks the child via getDiChildById, then
 *   computes changedFields server-side. Empty diff → throws
 *   NoChangesError. Stores the OLD child snapshot in previous_snapshot
 *   so admin can render a diff during review.
 *
 *   For CREATE: validates every required field, then validates that
 *   bd_division is in the DI's assigned_divisions. Sets target_child
 *   to null (admin's approval will create the child row).
 */
export async function createProposal(
  userId: string,
  input: CreateProposalInput,
): Promise<{ proposalId: string }> {
  if (input.operation === "update") {
    return createUpdateProposal(userId, input);
  }
  return createCreateProposal(userId, input);
}

async function createUpdateProposal(
  userId: string,
  input: Extract<CreateProposalInput, { operation: "update" }>,
): Promise<{ proposalId: string }> {
  // Scope guard — getDiChildById returns null if out of scope OR
  // doesn't exist. Same null shape either way (no existence leak).
  const current = await getDiChildById(input.childId, userId);
  if (!current) throw new OutOfScopeError();

  const submittedFields: ChildEditableFields = input.fields;

  // Compute the changed slice. For each field the DI submitted,
  // compare to the current child's value. If different, record the
  // submitted value as the proposed value.
  const proposedRow: Record<string, unknown> = {};
  const snapshot: Record<string, unknown> = {};
  let didChange = false;

  for (const field of EDITABLE_FIELDS) {
    if (!(field in submittedFields)) continue;
    const submittedValue = submittedFields[field];
    const currentValue = (current as unknown as Record<string, unknown>)[field];
    if (isActuallyChanged(submittedValue, currentValue)) {
      // Light per-field validation for the mutating subset.
      if (field === "date_of_birth" && typeof submittedValue === "string") {
        validateDate(field, submittedValue);
      }
      if (field === "last_visit_date" && typeof submittedValue === "string") {
        validateDate(field, submittedValue);
      }
      if (field === "monthly_cost") {
        validateMoney(
          field,
          submittedValue === null || submittedValue === undefined
            ? null
            : Number(submittedValue),
        );
      }
      proposedRow[field] = normaliseForInsert(field, submittedValue);
      snapshot[field] = currentValue ?? null;
      didChange = true;
    }
  }

  // Photo: a non-null photoUuid that differs from the current Photo
  // means a swap. null means "keep current".
  if (input.photoUuid !== null) {
    const currentPhoto = (current as unknown as { photo_url?: string | null })
      .photo_url
      ? extractUuidFromAssetUrl(
          (current as unknown as { photo_url: string }).photo_url,
        )
      : null;
    if (input.photoUuid !== currentPhoto) {
      proposedRow.Photo = input.photoUuid;
      snapshot.Photo = currentPhoto;
      didChange = true;
    }
  }

  if (!didChange) throw new NoChangesError();

  const created = (await directusServer().request(
    createItem("child_proposal" as never, {
      proposal_type: "update",
      target_child: input.childId,
      status: "pending",
      created_by: userId,
      // child_proposal.date_created is a plain timestamp column with
      // no auto-fill default (verified via Directus field meta — no
      // `date-created` special). Set it explicitly so the My
      // Submissions page's relative-time formatting has something to
      // work with.
      date_created: new Date().toISOString(),
      previous_snapshot: snapshot,
      ...proposedRow,
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-proposals] createUpdateProposal: no id returned");
  }
  return { proposalId: String(id) };
}

async function createCreateProposal(
  userId: string,
  input: Extract<CreateProposalInput, { operation: "create" }>,
): Promise<{ proposalId: string }> {
  const f = input.fields;

  // Required-field check (string-typed).
  ensureRequired("display_name", f.display_name);
  ensureRequired("date_of_birth", f.date_of_birth);
  ensureRequired("bd_division", f.bd_division);
  ensureRequired("district_internal", f.district_internal);
  ensureRequired("support_type", f.support_type);
  ensureRequired("monthly_cost", f.monthly_cost);
  ensureRequired("story", f.story);
  ensureRequired("guardian_summary_internal", f.guardian_summary_internal);
  if (!input.photoUuid) {
    throw new MissingRequiredFieldError("photoUuid");
  }

  // Per-field validation.
  validateDate("date_of_birth", f.date_of_birth);
  validateMoney("monthly_cost", f.monthly_cost);
  if (f.last_visit_date) validateDate("last_visit_date", f.last_visit_date);

  // Division guard — DI may only propose new children in their
  // assigned divisions.
  const allowed = await isDivisionAllowedForUser(userId, f.bd_division);
  if (!allowed) {
    throw new DivisionNotAllowedError(f.bd_division);
  }

  const created = (await directusServer().request(
    createItem("child_proposal" as never, {
      proposal_type: "create",
      target_child: null,
      status: "pending",
      created_by: userId,
      // See note in createUpdateProposal — date_created has no
      // auto-fill default; set it explicitly.
      date_created: new Date().toISOString(),
      previous_snapshot: null,
      display_name: f.display_name.trim(),
      date_of_birth: f.date_of_birth,
      bd_division: f.bd_division,
      district_internal: f.district_internal.trim(),
      support_type: f.support_type,
      monthly_cost: f.monthly_cost,
      story: f.story.trim(),
      guardian_summary_internal: f.guardian_summary_internal.trim(),
      education_level: f.education_level?.trim() || null,
      last_visit_date: f.last_visit_date || null,
      Photo: input.photoUuid,
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-proposals] createCreateProposal: no id returned");
  }
  return { proposalId: String(id) };
}

// Helper: given /api/assets/{uuid}, extract the uuid.
function extractUuidFromAssetUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/assets\/([A-Za-z0-9_-]+)/);
  return m ? m[1]! : null;
}

function normaliseForInsert(
  field: keyof ChildEditableFields,
  value: unknown,
): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length === 0 ? null : t;
  }
  return value;
}

// ─── Reads ──────────────────────────────────────────────────────────

type ProposalRow = {
  id: string;
  proposal_type: string;
  target_child: string | null;
  display_name: string | null;
  status: string;
  date_created: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  Photo: string | null;
  date_of_birth: string | null;
  bd_division: string | null;
  district_internal: string | null;
  support_type: string | null;
  monthly_cost: number | null;
  education_level: string | null;
  story: string | null;
  guardian_summary_internal: string | null;
  last_visit_date: string | null;
  previous_snapshot: Record<string, unknown> | null;
};

const PROPOSAL_FIELDS = [
  "id",
  "proposal_type",
  "target_child",
  "display_name",
  "status",
  "date_created",
  "published_at",
  "rejection_reason",
  "Photo",
  "date_of_birth",
  "bd_division",
  "district_internal",
  "support_type",
  "monthly_cost",
  "education_level",
  "story",
  "guardian_summary_internal",
  "last_visit_date",
  "previous_snapshot",
] as const;

function isProposalStatus(s: string): s is ProposalStatus {
  return s === "draft" || s === "pending" || s === "approved" || s === "rejected";
}

function isProposalType(s: string): s is ProposalType {
  return s === "create" || s === "update";
}

function rowToSummary(
  row: ProposalRow,
  childDisplayNameByChildId: ReadonlyMap<string, string>,
): ProposalSummary {
  const status: ProposalStatus = isProposalStatus(row.status)
    ? row.status
    : "pending";
  const proposal_type: ProposalType = isProposalType(row.proposal_type)
    ? row.proposal_type
    : "update";
  return {
    id: row.id,
    proposal_type,
    target_child: row.target_child,
    child_display_name:
      proposal_type === "update" && row.target_child
        ? childDisplayNameByChildId.get(row.target_child) ?? null
        : null,
    proposed_display_name:
      proposal_type === "create" ? row.display_name?.trim() ?? null : null,
    status,
    date_created: row.date_created,
    published_at: row.published_at,
    rejection_reason: row.rejection_reason,
  };
}

/**
 * List the DI's own proposals.
 */
export async function listProposalsForUser(
  userId: string,
  opts?: { status?: ProposalStatus; limit?: number },
): Promise<ProposalSummary[]> {
  const filters: Record<string, unknown>[] = [
    { created_by: { _eq: userId } },
  ];
  if (opts?.status) {
    filters.push({ status: { _eq: opts.status } });
  }

  let rows: ProposalRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: { _and: filters },
        fields: [...PROPOSAL_FIELDS],
        sort: ["-date_created"],
        limit: opts?.limit ?? -1,
      } as never),
    )) as unknown as ProposalRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-proposals] listProposalsForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  // Resolve child display names for the UPDATE rows in one batch.
  const childIds = Array.from(
    new Set(
      rows
        .filter((r) => r.proposal_type === "update" && r.target_child)
        .map((r) => r.target_child as string),
    ),
  );
  const nameByChild = new Map<string, string>();
  if (childIds.length > 0) {
    try {
      const result = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _in: childIds } },
          fields: ["id", "display_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; display_name: string | null }> | undefined;
      if (Array.isArray(result)) {
        for (const r of result) {
          if (r.display_name) nameByChild.set(r.id, r.display_name.trim());
        }
      }
    } catch (err) {
      console.warn(
        "[di-proposals] child name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return rows.map((r) => rowToSummary(r, nameByChild));
}

/**
 * Single proposal with scope guard. Returns null when the proposal
 * doesn't exist OR isn't owned by the DI (collapsed for privacy).
 */
export async function getProposalForUser(
  proposalId: string,
  userId: string,
): Promise<ProposalDetail | null> {
  if (!proposalId) return null;
  let row: ProposalRow | undefined;
  try {
    const result = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { id: { _eq: proposalId } },
            { created_by: { _eq: userId } },
          ],
        },
        fields: [...PROPOSAL_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as ProposalRow[] | undefined;
    row = Array.isArray(result) ? result[0] : undefined;
  } catch (err) {
    console.warn(
      "[di-proposals] getProposalForUser failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  // Resolve child name (UPDATE only).
  let childDisplayName: string | null = null;
  if (row.proposal_type === "update" && row.target_child) {
    try {
      const result = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _eq: row.target_child } },
          fields: ["display_name"],
          limit: 1,
        } as never),
      )) as unknown as Array<{ display_name: string | null }> | undefined;
      const c = Array.isArray(result) ? result[0] : null;
      childDisplayName = c?.display_name?.trim() ?? null;
    } catch {
      childDisplayName = null;
    }
  }

  const summary = rowToSummary(
    row,
    childDisplayName && row.target_child
      ? new Map([[row.target_child, childDisplayName]])
      : new Map(),
  );

  // Build diff for UPDATE proposals.
  let diff: ProposalDiffEntry[] | null = null;
  if (row.proposal_type === "update" && row.previous_snapshot) {
    diff = [];
    for (const field of EDITABLE_FIELDS) {
      const newValue = (row as unknown as Record<string, unknown>)[field];
      if (newValue === null || newValue === undefined) continue;
      const oldValue = (row.previous_snapshot as Record<string, unknown>)[
        field
      ];
      diff.push({ field, old: oldValue ?? null, new: newValue });
    }
    if (row.Photo) {
      const oldPhoto = (row.previous_snapshot as Record<string, unknown>).Photo;
      diff.push({
        field: "Photo",
        old: oldPhoto ?? null,
        new: row.Photo,
      });
    }
  }

  // The full proposed shape (raw columns; UI can render whatever
  // makes sense).
  const proposed: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    proposed[field] = (row as unknown as Record<string, unknown>)[field];
  }
  proposed.Photo = row.Photo;

  return {
    ...summary,
    proposed,
    photo_uuid: row.Photo,
    diff,
  };
}

/**
 * Withdraw a proposal — implemented as DELETE since the production
 * status enum has no `withdrawn` value (see header comment).
 *
 * Returns false if:
 *   - proposal doesn't exist
 *   - proposal isn't owned by this DI
 *   - proposal isn't in `pending` status
 *
 * Returns true on successful delete.
 */
export async function withdrawProposal(
  proposalId: string,
  userId: string,
): Promise<boolean> {
  if (!proposalId) return false;

  // Look up first to verify ownership + pending status. Doing this
  // as two round-trips (read then delete) is fine — there's no
  // create-or-update race that matters here, the worst case is a
  // benign double-withdraw which the second attempt no-ops.
  let row: { id: string; status: string } | undefined;
  try {
    const result = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { id: { _eq: proposalId } },
            { created_by: { _eq: userId } },
          ],
        },
        fields: ["id", "status"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string; status: string }> | undefined;
    row = Array.isArray(result) ? result[0] : undefined;
  } catch (err) {
    console.warn(
      "[di-proposals] withdrawProposal lookup failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
  if (!row || row.status !== "pending") return false;

  try {
    await directusServer().request(
      deleteItem("child_proposal" as never, proposalId as never),
    );
    return true;
  } catch (err) {
    console.warn(
      "[di-proposals] withdrawProposal delete failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ─── Aggregate read for stats tile ──────────────────────────────────

/**
 * Count the DI's pending proposals — used by the home page tile and
 * any future inbox badge.
 */
export async function getPendingProposalCountForUser(
  userId: string,
): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { created_by: { _eq: userId } },
            { status: { _eq: "pending" } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[di-proposals] getPendingProposalCountForUser failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
