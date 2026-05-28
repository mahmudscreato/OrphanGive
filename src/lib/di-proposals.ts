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

import {
  createItem,
  deleteItem,
  readItems,
  readUser,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import { getChildEditSnapshot, getDiChildById } from "./di-children";

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
//
// Session 46-fix-2 — extended to mirror the full DI-collectable surface
// of `child` (28 fields total). Medical-sensitive admin-only fields
// (medical_conditions, allergies, mental_health_notes) and encrypted
// columns stay excluded — they're not in either shape.

export interface ChildEditableFields {
  // Identity
  // P1.3 — first_name is the public-facing name (shown on Tier-1
  // cards, profile, OG metadata). display_name is internal — shown
  // to authed donors / admin / DI only. Both proposed via this
  // shape; the proposal-approval flow copies both to the child row.
  first_name?: string;
  display_name?: string;
  gender?: string;
  date_of_birth?: string; // ISO date (YYYY-MM-DD)
  photo_consent?: boolean;
  // Location (Session 48a — added permanent_address Tier 3)
  bd_division?: string; // slug code, FK to bd_division.code
  bd_district?: string; // slug code, FK to bd_district.code
  district_internal?: string;
  permanent_address?: string;
  // Education + interests (Session 48a — areas_of_interest is now
  // text[]; educational_organization is M2O to school; school_name_raw
  // is the free-text fallback when no school row exists yet).
  education_level?: string | null;
  class_grade?: string;
  educational_organization?: string | null;
  school_name_raw?: string;
  areas_of_interest?: string[];
  // Donor-facing story
  story?: string;
  // Support plan (Session 48a — priority_support drives whether
  // priority_notes is required; admin uses these for triage).
  support_type?: string;
  monthly_cost?: number | null;
  priority_support?: string;
  priority_notes?: string;
  // Health (subset — mental health stays admin-only)
  blood_group?: string;
  vaccination_status?: string;
  last_medical_checkup?: string | null;
  disability_status?: string;
  disability_notes?: string;
  // Family (Session 48a — parent_loss is now mandatory at submit)
  parent_loss?: string;
  siblings_count?: number | null;
  sibling_position?: number | null;
  siblings_notes?: string;
  household_size?: number | null;
  // Socioeconomic
  household_income_source?: string;
  monthly_household_income_bdt?: number | null;
  // Guardian context (Session 48a — added phone fields Tier 3 +
  // structured employment_type alongside the existing free-text
  // qualifier)
  guardian_relationship?: string;
  guardian_employment_type?: string;
  guardian_employment?: string;
  guardian_phone?: string;
  guardian_phone_alt?: string;
  guardian_summary_internal?: string;
  additional_family_notes?: string;
  // Field visit / submission
  // Session 48a — submission_date is the new canonical name. We
  // KEEP last_visit_date and write to BOTH to maintain backward
  // compat; deprecate after a future read-side audit.
  last_visit_date?: string | null;
  submission_date?: string | null;
}

// Required-for-CREATE fields per Mahmud's V1 decision: identity
// minimum + location + support plan + a story + guardian context.
// Health/family/socioeconomic blocks are optional on create — DI may
// not have everything at first intake.
export interface ChildCreatableFields {
  // P1.3 — public-facing first name. REQUIRED on create so a new
  // child profile is never published without a safe public name.
  // If a DI somehow leaves it blank, the data layer falls back to
  // "A child" and the surface still renders dignifiedly — but the
  // form-level validator below also requires it.
  first_name: string;
  display_name: string;
  date_of_birth: string;
  bd_division: string;
  bd_district: string;
  district_internal: string;
  support_type: string;
  monthly_cost: number;
  story: string;
  guardian_summary_internal: string;
  guardian_relationship: string;
  // Session 48a — required-on-submit additions:
  parent_loss: string;
  guardian_phone: string;
  // All other fields optional on create.
  gender?: string;
  photo_consent?: boolean;
  permanent_address?: string;
  education_level?: string | null;
  class_grade?: string;
  educational_organization?: string | null;
  school_name_raw?: string;
  areas_of_interest?: string[];
  priority_support?: string;
  priority_notes?: string;
  blood_group?: string;
  vaccination_status?: string;
  last_medical_checkup?: string | null;
  disability_status?: string;
  disability_notes?: string;
  siblings_count?: number | null;
  sibling_position?: number | null;
  siblings_notes?: string;
  household_size?: number | null;
  household_income_source?: string;
  monthly_household_income_bdt?: number | null;
  guardian_employment?: string;
  guardian_employment_type?: string;
  guardian_phone_alt?: string;
  additional_family_notes?: string;
  last_visit_date?: string | null;
  submission_date?: string | null;
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
      // Session 52a — when a draft is being promoted to pending via
      // /api/di/proposals/[id]/submit, the draft already has a stub
      // `child` row from createDraftProposal. Pass it through so
      // createCreateProposal reuses it instead of creating a second
      // stub (which would orphan the first). Direct submits with no
      // prior draft omit this; createCreateProposal will create the
      // stub itself.
      existingStubChildId?: string | null;
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
  // Session 51.5 — added `allowedCodes` so the API can echo the DI's
  // assigned_divisions back to the client. The form uses this to
  // render a concrete error like "You can only create children in
  // your assigned divisions: dhaka, chittagong" instead of the
  // generic "ask your admin" copy the prior session shipped.
  constructor(
    public readonly divisionCode: string,
    public readonly allowedCodes: string[] = [],
  ) {
    super(
      `Division "${divisionCode}" is not in your assigned_divisions` +
        (allowedCodes.length > 0
          ? ` (allowed: ${allowedCodes.join(", ")})`
          : ""),
    );
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

// Session 63 — aggregate validation error.
//
// Previously createCreateProposal / createUpdateProposal threw on the
// first missing or invalid field, so the form could only show one
// problem at a time — user fixes it, submits, sees the next one,
// repeat. Painful when you've left several fields blank.
//
// The new pattern: validators push into a ValidationCollector, the
// collector throws this single error at the end carrying ALL the
// problems, and the route handler maps it to:
//   { error: "validation_failed", fields: [{ field, message }, ...] }
//
// MissingRequiredFieldError + InvalidValueError remain exported and
// the route handlers still catch them as a defensive fallback — if
// any deeper path ever throws one individually, the route still
// degrades gracefully into the legacy single-error shape.

export interface ValidationFieldError {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  readonly code = "validation_failed" as const;
  constructor(public readonly fields: ReadonlyArray<ValidationFieldError>) {
    super(
      `Validation failed: ${fields
        .map((f) => `${f.field} (${f.message})`)
        .join("; ")}`,
    );
    this.name = "ValidationError";
  }
}

/**
 * Push-don't-throw validator. Mirrors the standalone ensureRequired /
 * validateDate / validateMoney helpers, but collects errors into a
 * list so we can report ALL of them at once via throwIfErrors().
 *
 * The methods deliberately return void rather than guarding subsequent
 * type narrowing — that's the price of "keep going to collect more
 * errors". Callers should assume nothing about the validity of the
 * value after a push.
 */
class ValidationCollector {
  private errors: ValidationFieldError[] = [];

  /** Required-presence check. Treats null/undefined/blank-string as missing. */
  required(field: string, value: unknown, customMessage?: string): void {
    if (value === null || value === undefined) {
      this.errors.push({ field, message: customMessage ?? "Required." });
      return;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      this.errors.push({ field, message: customMessage ?? "Required." });
    }
  }

  /** Free-form invalid-value push. */
  invalid(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  /** ISO YYYY-MM-DD shape check. No-op on null/undefined/empty. */
  validateDate(field: string, value: string | null | undefined): void {
    if (value === null || value === undefined || value === "") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.errors.push({ field, message: "Use YYYY-MM-DD format." });
      return;
    }
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      this.errors.push({ field, message: "Not a real date." });
    }
  }

  /** Non-negative whole number check. No-op on null/undefined. */
  validateMoney(field: string, value: number | null | undefined): void {
    if (value === null || value === undefined) return;
    if (!Number.isFinite(value)) {
      this.errors.push({ field, message: "Must be a finite number." });
      return;
    }
    if (!Number.isInteger(value)) {
      this.errors.push({ field, message: "Must be a whole number." });
      return;
    }
    if (value < 0) {
      this.errors.push({ field, message: "Must be ≥ 0." });
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  throwIfErrors(): void {
    if (this.errors.length > 0) {
      throw new ValidationError([...this.errors]);
    }
  }
}

// ─── Editable field set + diff helpers ──────────────────────────────

// Session 46-fix-2 — full DI-collectable surface (28 fields).
// Session 48a — extended to 41 fields (13 new). Order here drives
// the order rows are stored in `previous_snapshot` + the diff loop
// in createUpdateProposal.
const EDITABLE_FIELDS: ReadonlyArray<keyof ChildEditableFields> = [
  // Identity
  // P1.3 — first_name comes FIRST so the proposal diff renders it
  // above display_name (which is now the internal record name).
  "first_name",
  "display_name",
  "gender",
  "date_of_birth",
  "photo_consent",
  // Location (added permanent_address)
  "bd_division",
  "bd_district",
  "district_internal",
  "permanent_address",
  // Education + interests (added educational_organization,
  // school_name_raw; areas_of_interest is now text[])
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  // Donor-facing story
  "story",
  // Support plan (added priority_support, priority_notes)
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  // Health
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  // Family (added parent_loss)
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  // Socioeconomic
  "household_income_source",
  "monthly_household_income_bdt",
  // Guardian context (added employment_type, phone, phone_alt)
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  // Field visit / submission
  "last_visit_date",
  "submission_date",
];

// Compares submitted value to current child value. Returns true if
// the field is "actually different". Treats null/undefined/"" as
// equivalent so an empty-string submission against a null DB value
// doesn't register as a change.
/**
 * Session 48a — keep submission_date and last_visit_date in sync.
 *
 * The form binds to submission_date (the new canonical name); the
 * old last_visit_date column stays alive for backward compat. Mirror
 * is symmetric: if either column is set in the submitted fields and
 * the other isn't, fill the missing one. Done at the proposal
 * write boundary so any downstream consumer (admin approval,
 * future reads) sees both columns coherent without each having to
 * remember to do this.
 *
 * Returns a NEW object — never mutates `fields` in place.
 */
function mirrorSubmissionDate<
  T extends {
    submission_date?: string | null;
    last_visit_date?: string | null;
  },
>(fields: T): T {
  const sd = fields.submission_date;
  const lv = fields.last_visit_date;
  if (sd != null && (lv == null || lv === "")) {
    return { ...fields, last_visit_date: sd };
  }
  if (lv != null && (sd == null || sd === "")) {
    return { ...fields, submission_date: lv };
  }
  return fields;
}

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
    if (Array.isArray(v)) {
      // Session 48a — areas_of_interest is text[]. Treat empty array
      // as null so [] vs null doesn't register as a change. Sort
      // before compare so order doesn't trigger a false-positive.
      if (v.length === 0) return null;
      return [...v].sort().join("|");
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

// ─── Public API ─────────────────────────────────────────────────────
//
// Session 63 — the standalone throw-on-first ensureRequired /
// validateDate / validateMoney helpers were removed. Validation now
// runs through ValidationCollector (defined above) which pushes
// errors into a list and throws ValidationError once at the end.

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
  // Scope guard — getChildEditSnapshot returns null if out of scope
  // OR doesn't exist (same null shape, no existence leak). Switched
  // here in Session 46-fix-2 from getDiChildById because the diff
  // loop needs the full editable surface — DiChildDetail only exposes
  // the user-facing subset, so reading new fields off it returned
  // undefined and registered every submitted value as a change vs
  // an undefined "current".
  const current = await getChildEditSnapshot(input.childId, userId);
  if (!current) throw new OutOfScopeError();

  // Session 48a — submission_date / last_visit_date mirror.
  // Form binds to submission_date (the new canonical field). We
  // copy that value onto last_visit_date too so anything still
  // reading the old column stays consistent. Mirror is symmetric:
  // if a caller submits last_visit_date but not submission_date,
  // backfill the new column. Done before the diff loop so both
  // columns get diffed normally.
  const submittedFields: ChildEditableFields = mirrorSubmissionDate(
    input.fields,
  );

  // Map ChildEditableFields keys to ChildEditSnapshot keys. Most
  // are 1:1 by name; bd_division/bd_district read from the snapshot's
  // `*_code` keys (Directus relation expansion gave us the FK slug).
  const snapshotKeyOf = (
    field: keyof ChildEditableFields,
  ): keyof typeof current => {
    if (field === "bd_division") return "bd_division_code";
    if (field === "bd_district") return "bd_district_code";
    return field as keyof typeof current;
  };

  // Session 63 — validation pass (collect-all, then throw).
  // We can't interleave validation with the proposedRow build the way
  // the old code did, because the old throw-on-first model would
  // abort partway through. Two passes: collect ALL validation errors
  // for any actually-changed field, then either throw the aggregate
  // OR run the build pass.
  const v = new ValidationCollector();
  for (const field of EDITABLE_FIELDS) {
    if (!(field in submittedFields)) continue;
    const submittedValue = submittedFields[field];
    const currentValue = (current as unknown as Record<string, unknown>)[
      snapshotKeyOf(field)
    ];
    if (!isActuallyChanged(submittedValue, currentValue)) continue;
    if (
      (field === "date_of_birth" ||
        field === "last_visit_date" ||
        field === "last_medical_checkup" ||
        field === "submission_date") &&
      typeof submittedValue === "string"
    ) {
      v.validateDate(field, submittedValue);
    }
    if (
      field === "monthly_cost" ||
      field === "monthly_household_income_bdt" ||
      field === "siblings_count" ||
      field === "sibling_position" ||
      field === "household_size"
    ) {
      v.validateMoney(
        field,
        submittedValue === null || submittedValue === undefined
          ? null
          : Number(submittedValue),
      );
    }
  }
  v.throwIfErrors();

  // Compute the changed slice. For each field the DI submitted,
  // compare to the current child's value. If different, record the
  // submitted value as the proposed value.
  const proposedRow: Record<string, unknown> = {};
  const snapshot: Record<string, unknown> = {};
  let didChange = false;

  for (const field of EDITABLE_FIELDS) {
    if (!(field in submittedFields)) continue;
    const submittedValue = submittedFields[field];
    const currentValue = (current as unknown as Record<string, unknown>)[
      snapshotKeyOf(field)
    ];
    if (isActuallyChanged(submittedValue, currentValue)) {
      proposedRow[field] = normaliseForInsert(field, submittedValue);
      snapshot[field] = currentValue ?? null;
      didChange = true;
    }
  }

  // Photo: a non-null photoUuid that differs from the current Photo
  // means a swap. null means "keep current".
  if (input.photoUuid !== null) {
    const currentPhoto = current.current_photo_uuid;
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
  // Session 48a — same submission_date / last_visit_date mirror as
  // the UPDATE path. See mirrorSubmissionDate() docstring.
  const f = mirrorSubmissionDate(
    input.fields,
  ) as ChildCreatableFields;

  // Session 63 — collect ALL validation errors instead of throwing on
  // the first one. The client renders the full list as a summary panel
  // above the submit button plus per-field red highlights, so the DI
  // can fix everything in one pass rather than the old whack-a-mole
  // flow.
  const v = new ValidationCollector();

  // Required-field check.
  // P1.3 — first_name is REQUIRED on create. The data layer falls
  // back to "A child" if it's empty, but the form must collect a
  // real first name so the published profile carries the donor-
  // facing name with intent.
  v.required("first_name", f.first_name);
  v.required("display_name", f.display_name);
  v.required("date_of_birth", f.date_of_birth);
  v.required("bd_division", f.bd_division);
  v.required("bd_district", f.bd_district);
  v.required("district_internal", f.district_internal);
  v.required("support_type", f.support_type);
  v.required("monthly_cost", f.monthly_cost);
  v.required("story", f.story);
  v.required("guardian_summary_internal", f.guardian_summary_internal);
  v.required("guardian_relationship", f.guardian_relationship);
  // Session 48a — new mandatory-on-create fields.
  v.required("parent_loss", f.parent_loss);
  v.required("guardian_phone", f.guardian_phone);
  if (!input.photoUuid) {
    v.required("photoUuid", null, "A photo is required for new children.");
  }
  // Cross-field rule — priority_notes required when priority_support
  // is non-'none'. The form already enforces this client-side; this
  // is the server-side contract.
  if (
    f.priority_support &&
    f.priority_support !== "none" &&
    (!f.priority_notes || f.priority_notes.trim().length === 0)
  ) {
    v.required(
      "priority_notes",
      null,
      "Required when priority is standard or urgent.",
    );
  }

  // Per-field validation. The collector's validators are no-ops on
  // null/undefined, so we don't need to guard them like the old
  // ensureRequired-throws-then-validateDate sequence did.
  v.validateDate("date_of_birth", f.date_of_birth);
  v.validateMoney("monthly_cost", f.monthly_cost);
  v.validateDate("last_visit_date", f.last_visit_date);
  v.validateDate("last_medical_checkup", f.last_medical_checkup);
  v.validateMoney("monthly_household_income_bdt", f.monthly_household_income_bdt);
  v.validateMoney("siblings_count", f.siblings_count);
  v.validateMoney("sibling_position", f.sibling_position);
  v.validateMoney("household_size", f.household_size);

  v.throwIfErrors();

  // Division guard — DI may only propose new children in their
  // assigned divisions. Fetch the assigned set once so we can pass
  // it back inside DivisionNotAllowedError for a helpful UI message
  // (Session 51.5 — the dropdown now shows all 8 divisions, so the
  // DI may legitimately pick an unassigned one and the error needs
  // to be self-explanatory).
  const assignedCodes = await getAssignedDivisionsForUser(userId);
  if (!assignedCodes.includes(f.bd_division)) {
    throw new DivisionNotAllowedError(f.bd_division, assignedCodes);
  }

  // Session 52a — pre-create the stub child (or reuse the one the
  // draft already has) so documents + intake photos attached to
  // this proposal (via child_document.child / child_intake_photo.child)
  // have a real FK target. On admin approval the stub is UPDATED
  // in place (status flips to 'active', mirror columns applied)
  // rather than re-inserted — see the approveProposal CREATE branch
  // in admin-proposals.ts.
  //
  // Direct submits (no prior draft) get a fresh stub here. Draft
  // submits arrive via submitDraftProposal → /[id]/submit which
  // passes `existingStubChildId` to skip stub creation and reuse
  // the draft's stub (otherwise we'd orphan the first stub).
  const stubChildId =
    input.existingStubChildId ??
    (await createStubChildForCreate(userId, {
      display_name: f.display_name,
      bd_division: f.bd_division,
    }));

  // Session 46-fix-2 — assemble the full payload including the 17
  // new mirror columns. Optional fields fall through as undefined →
  // omitted from the insert (Directus treats them as default/null).
  // photo_consent defaults FALSE on the column so an unchecked box
  // (or omitted property) is the safe default.
  const created = (await directusServer().request(
    createItem("child_proposal" as never, {
      proposal_type: "create",
      target_child: stubChildId,
      status: "pending",
      created_by: userId,
      // See note in createUpdateProposal — date_created has no
      // auto-fill default; set it explicitly.
      date_created: new Date().toISOString(),
      previous_snapshot: null,
      // Identity
      // P1.3 — first_name mirrors to child_proposal alongside
      // display_name. Approval flow (admin-proposals.ts) copies
      // BOTH to the child row.
      first_name: f.first_name.trim(),
      display_name: f.display_name.trim(),
      gender: f.gender ?? null,
      date_of_birth: f.date_of_birth,
      photo_consent: f.photo_consent ?? false,
      Photo: input.photoUuid,
      // Location (Session 48a — added permanent_address)
      bd_division: f.bd_division,
      bd_district: f.bd_district,
      district_internal: f.district_internal.trim(),
      permanent_address: f.permanent_address?.trim() || null,
      // Education + interests (Session 48a — added educational_organization
      // FK + school_name_raw fallback; areas_of_interest is now text[])
      education_level: f.education_level?.trim() || null,
      class_grade: f.class_grade?.trim() || null,
      educational_organization: f.educational_organization || null,
      school_name_raw: f.school_name_raw?.trim() || null,
      // Session 48a — text[] column. See toPgTextArrayLiteral
      // docstring for why we send the literal string instead of
      // the JS array.
      areas_of_interest:
        Array.isArray(f.areas_of_interest) && f.areas_of_interest.length > 0
          ? toPgTextArrayLiteral(f.areas_of_interest)
          : null,
      // Donor-facing story
      story: f.story.trim(),
      // Support plan (Session 48a — priority columns)
      support_type: f.support_type,
      monthly_cost: f.monthly_cost,
      priority_support: f.priority_support || "none",
      priority_notes: f.priority_notes?.trim() || null,
      // Health
      blood_group: f.blood_group ?? null,
      vaccination_status: f.vaccination_status ?? null,
      last_medical_checkup: f.last_medical_checkup || null,
      disability_status: f.disability_status ?? null,
      disability_notes: f.disability_notes?.trim() || null,
      // Family (Session 48a — parent_loss is now mandatory)
      parent_loss: f.parent_loss,
      siblings_count: f.siblings_count ?? null,
      sibling_position: f.sibling_position ?? null,
      siblings_notes: f.siblings_notes?.trim() || null,
      household_size: f.household_size ?? null,
      // Socioeconomic
      household_income_source: f.household_income_source ?? null,
      monthly_household_income_bdt: f.monthly_household_income_bdt ?? null,
      // Guardian (Session 48a — added employment_type, phone, phone_alt)
      guardian_relationship: f.guardian_relationship,
      guardian_employment_type: f.guardian_employment_type ?? null,
      guardian_employment: f.guardian_employment?.trim() || null,
      guardian_phone: f.guardian_phone.trim(),
      guardian_phone_alt: f.guardian_phone_alt?.trim() || null,
      guardian_summary_internal: f.guardian_summary_internal.trim(),
      additional_family_notes: f.additional_family_notes?.trim() || null,
      // Field visit / submission (Session 48a — both columns mirrored
      // by mirrorSubmissionDate above so writes go to both)
      last_visit_date: f.last_visit_date || null,
      submission_date: f.submission_date || null,
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
  // Session 48a — areas_of_interest is a Postgres text[] column.
  // The Directus SDK can't natively serialise a JS array into a
  // text[] literal — it sends JSON which Postgres rejects with
  // "malformed array literal". Format as a Postgres array literal
  // ({a,b,c}) string so the driver parses it as `_text`. All our
  // slug values are [a-z_]+ so no escaping is needed; if we ever
  // add slugs with commas/quotes, this helper needs to escape them.
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return toPgTextArrayLiteral(value as string[]);
  }
  return value;
}

/**
 * Format a string array as a Postgres text[] literal: `{a,b,c}`.
 * Values containing commas / quotes / braces get quoted + escaped.
 * (Today's slugs don't, but keeping the helper safe-by-default.)
 *
 * Exported because admin-proposals.ts also needs to format arrays
 * when copying proposal mirror columns onto `child` — same Directus
 * limitation, same fix.
 */
export function toPgTextArrayLiteral(values: string[]): string {
  const parts = values.map((v) => {
    if (/[,"{}\\\s]/.test(v)) {
      return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return v;
  });
  return `{${parts.join(",")}}`;
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

// ─── Session 48b — draft mode ───────────────────────────────────────
//
// Draft mode is the DI form's "save partial progress" feature.
// Drafts are personal scratch — only the DI who created them can
// see them, and they don't write to audit_log or notify admin
// until the DI submits.
//
// Storage: same `child_proposal` table, just with status='draft'
// (which the existing schema enum already includes — Sessions 41-46
// set the column up that way). When the DI submits a draft, status
// flips to 'pending' AFTER full validation, audit fires, admin
// notify fires.

export interface DraftSummary {
  id: string;
  proposal_type: ProposalType;
  target_child: string | null;
  // Resolved at query time (live child's display_name for UPDATE
  // drafts; the proposed display_name for CREATE drafts).
  child_display_name: string | null;
  proposed_display_name: string | null;
  date_created: string | null;
}

/**
 * List drafts for the DI. Filtered to status='draft' AND
 * created_by=userId (defence-in-depth alongside the route-level
 * session check). Sorted newest-first.
 */
export async function listDraftsForUser(
  userId: string,
): Promise<DraftSummary[]> {
  let rows: Array<{
    id: string;
    proposal_type: string;
    target_child: string | null;
    display_name: string | null;
    date_created: string | null;
  }> = [];
  try {
    const result = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { created_by: { _eq: userId } },
            { status: { _eq: "draft" } },
          ],
        },
        fields: [
          "id",
          "proposal_type",
          "target_child",
          "display_name",
          "date_created",
        ],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-proposals] listDraftsForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  // Resolve live display_name for UPDATE drafts (the proposal's own
  // display_name column may be null — drafts often have empty
  // fields). Single batch read.
  const targetIds = Array.from(
    new Set(
      rows
        .filter((r) => r.proposal_type === "update" && r.target_child)
        .map((r) => r.target_child as string),
    ),
  );
  const nameByChildId = new Map<string, string>();
  if (targetIds.length > 0) {
    try {
      const childRows = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _in: targetIds } },
          fields: ["id", "display_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; display_name: string | null }> | undefined;
      if (Array.isArray(childRows)) {
        for (const c of childRows) {
          if (c.display_name?.trim())
            nameByChildId.set(c.id, c.display_name.trim());
        }
      }
    } catch {
      // Non-fatal — drafts page falls back to "(child name unavailable)".
    }
  }

  return rows.map((r) => ({
    id: r.id,
    proposal_type: r.proposal_type === "create" ? "create" : "update",
    target_child: r.target_child,
    child_display_name:
      r.proposal_type === "update" && r.target_child
        ? nameByChildId.get(r.target_child) ?? null
        : null,
    proposed_display_name:
      r.proposal_type === "create" ? r.display_name?.trim() ?? null : null,
    date_created: r.date_created,
  }));
}

/**
 * Read one draft for the DI. Returns the full proposal row (for
 * pre-filling the form). Returns null if not owned, not found, or
 * not a draft (so the route can 404 cleanly without leaking
 * existence of others' drafts).
 */
export async function getDraftForUser(
  draftId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!draftId) return null;
  try {
    const rows = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { id: { _eq: draftId } },
            { created_by: { _eq: userId } },
            { status: { _eq: "draft" } },
          ],
        },
        fields: ["*"],
        limit: 1,
      } as never),
    )) as unknown as Array<Record<string, unknown>> | undefined;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn(
      "[di-proposals] getDraftForUser failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Create a new draft proposal. Skips ALL validation (drafts are
 * partial scratch; the DI may not have figured out half the fields
 * yet). Status='draft', created_by=userId, target_child set for
 * UPDATE drafts, null for CREATE drafts.
 *
 * Reuses the same flat-column shape as createCreateProposal +
 * createUpdateProposal but writes only the keys present in `fields`,
 * with no required-field checks.
 */
/**
 * Session 52a — pre-create a stub `child` row so DI can attach
 * documents + intake photos during initial profile entry (before
 * admin approval). The stub has `status='awaiting_intake'` which
 * every donor-facing query filters out (each gates on
 * `status='active'`), so the placeholder is invisible to donors.
 *
 * The display_name + bd_division come from whatever the DI has
 * typed so far; both are recovered from the proposal's flat
 * columns. display_name has a fallback because the bootstrap
 * defines `child.display_name` as required. bd_division is included
 * only if the DI has selected one (column is nullable in current
 * installs; if it ever becomes NOT NULL, the insert would fail
 * with a clear constraint error — handle then).
 *
 * uploaded_by_di + assigned_di are stamped to the current DI so the
 * stub is in their scope across the dashboard.
 *
 * On admin approval the stub is UPDATED (not re-inserted) with the
 * proposal's fields and its status flipped to 'active'. See the
 * approveProposal CREATE branch in admin-proposals.ts.
 */
async function createStubChildForCreate(
  userId: string,
  hint: {
    display_name?: unknown;
    bd_division?: unknown;
  },
): Promise<string> {
  const displayName =
    typeof hint.display_name === "string" && hint.display_name.trim().length > 0
      ? hint.display_name.trim()
      : "Awaiting profile completion";

  const insertPayload: Record<string, unknown> = {
    display_name: displayName,
    status: "awaiting_intake",
    uploaded_by_di: userId,
    assigned_di: userId,
  };
  if (typeof hint.bd_division === "string" && hint.bd_division.trim().length > 0) {
    insertPayload.bd_division = hint.bd_division.trim();
  }

  const created = (await directusServer().request(
    createItem("child" as never, insertPayload as never),
  )) as unknown as { id?: string } | undefined;
  const id = created?.id;
  if (!id) {
    throw new Error("[di-proposals] createStubChildForCreate: no id returned");
  }
  return String(id);
}

export async function createDraftProposal(
  userId: string,
  input: {
    operation: "create" | "update";
    childId?: string;
    fields: Record<string, unknown>;
    photoUuid?: string | null;
  },
): Promise<{ proposalId: string; childId: string | null }> {
  // For UPDATE drafts, scope-check the target child exists in the
  // DI's care. We don't enforce required fields, but the child
  // reference still has to make sense.
  if (input.operation === "update") {
    if (!input.childId) {
      throw new MissingRequiredFieldError("childId");
    }
    const current = await getChildEditSnapshot(input.childId, userId);
    if (!current) throw new OutOfScopeError();
  }

  // Mirror submission_date ↔ last_visit_date even on drafts so the
  // pre-fill on resume stays coherent.
  const fields = mirrorSubmissionDate(input.fields as never) as Record<
    string,
    unknown
  >;

  // Format text[] columns as Postgres array literals (Session 48a
  // limitation).
  if (Array.isArray(fields.areas_of_interest)) {
    fields.areas_of_interest =
      (fields.areas_of_interest as string[]).length > 0
        ? toPgTextArrayLiteral(fields.areas_of_interest as string[])
        : null;
  }

  // Session 52a — for CREATE drafts pre-create the stub child so
  // documents + intake photos can attach to a real child.id during
  // form entry. UPDATE drafts already have childId from the route.
  let targetChild: string | null = input.childId ?? null;
  if (input.operation === "create" && !targetChild) {
    targetChild = await createStubChildForCreate(userId, {
      display_name: fields.display_name,
      bd_division: fields.bd_division,
    });
  }

  const created = (await directusServer().request(
    createItem("child_proposal" as never, {
      proposal_type: input.operation,
      target_child: targetChild,
      status: "draft",
      created_by: userId,
      date_created: new Date().toISOString(),
      previous_snapshot: null,
      ...(input.photoUuid ? { Photo: input.photoUuid } : {}),
      ...fields,
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) throw new Error("[di-proposals] createDraftProposal: no id returned");
  return { proposalId: String(id), childId: targetChild };
}

/**
 * Update an existing draft. Same skip-validation behavior. Verifies
 * ownership + status='draft' before writing. Throws OutOfScopeError
 * if the draft isn't found or isn't owned (collapsed for privacy).
 */
export async function updateDraftProposal(
  userId: string,
  draftId: string,
  fields: Record<string, unknown>,
  photoUuid?: string | null,
): Promise<void> {
  // Ownership + status check.
  const draft = await getDraftForUser(draftId, userId);
  if (!draft) throw new OutOfScopeError();

  // Same mirror + array-literal handling as create.
  const f = mirrorSubmissionDate(fields as never) as Record<string, unknown>;
  if (Array.isArray(f.areas_of_interest)) {
    f.areas_of_interest =
      (f.areas_of_interest as string[]).length > 0
        ? toPgTextArrayLiteral(f.areas_of_interest as string[])
        : null;
  }

  await directusServer().request(
    updateItem("child_proposal" as never, draftId as never, {
      ...f,
      ...(photoUuid !== undefined ? { Photo: photoUuid } : {}),
    } as never),
  );
}

/**
 * Promote a draft to a pending submission. Re-validates the full
 * shape against the create/update Zod schemas (caller's job — this
 * helper just flips the status after the route verified everything).
 *
 * The route handler is responsible for:
 *   1. Fetching the draft via getDraftForUser
 *   2. Building the equivalent CreateProposalInput from the draft
 *      columns
 *   3. Validating it against the Zod schema (same path as a fresh
 *      submit)
 *   4. Calling this function to flip status + write audit + notify
 *
 * Throws OutOfScopeError if the draft isn't owned / isn't a draft.
 */
export async function submitDraftProposal(
  userId: string,
  draftId: string,
): Promise<void> {
  const draft = await getDraftForUser(draftId, userId);
  if (!draft) throw new OutOfScopeError();

  await directusServer().request(
    updateItem("child_proposal" as never, draftId as never, {
      status: "pending",
      // Same explicit timestamp the createCreateProposal path uses
      // — keeps published_at null until admin reviews.
      date_created: new Date().toISOString(),
    } as never),
  );
}

/**
 * Hard-delete a draft. Allowed only when the row is owned by this
 * DI AND status='draft'. Returns false if those conditions don't
 * match (route maps to 404).
 */
export async function discardDraftProposal(
  userId: string,
  draftId: string,
): Promise<boolean> {
  const draft = await getDraftForUser(draftId, userId);
  if (!draft) return false;
  try {
    await directusServer().request(
      deleteItem("child_proposal" as never, draftId as never),
    );
    return true;
  } catch (err) {
    console.warn(
      "[di-proposals] discardDraftProposal failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Count drafts for the bell-style indicator next to "Drafts" in the
 * sidebar nav.
 */
export async function getDraftCountForUser(
  userId: string,
): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { created_by: { _eq: userId } },
            { status: { _eq: "draft" } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}
