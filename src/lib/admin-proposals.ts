// Session 46-fix-2 — admin proposal approval / rejection.
//
// Admin "approving" a child_proposal in Directus admin only sets
// status='approved' — it does NOT copy the proposal's mirror columns
// onto the target_child row. This module fills that gap with a
// proper server-side handler that:
//
//   1. Reads the proposal with the admin token
//   2. For UPDATE: applies all non-null mirror columns onto the
//      target_child row. For CREATE: inserts a new child row from
//      the proposal's columns; the new row's uploaded_by_di =
//      proposal.created_by.
//   3. Updates the proposal: status='approved', approved_by=adminUserId,
//      published_at=now(). For CREATE also sets target_child = new id.
//   4. Writes an audit_log row (admin_approved_proposal).
//   5. Returns { proposalId, targetChildId, appliedFields }.
//
// Reject is symmetric but smaller — sets status='rejected' +
// approved_by + rejection_reason; no row mutation; audit
// admin_rejected_proposal.
//
// Atomicity caveat: Directus doesn't expose Postgres transactions
// across collections via REST. If the child UPDATE succeeds but the
// proposal status update fails, the system is in a recoverable but
// inconsistent state — the child IS updated, but the proposal still
// reads 'pending'. We log loudly so admin can manually fix the proposal
// status. Caller (route handler) returns 500 in that case so the
// admin client knows something went wrong.

import "server-only";

// Session 47 — in-app DI notification on approve/reject.
import { notify } from "./di-notifications";
// Session 48a — Directus can't natively serialise JS arrays into
// Postgres text[] columns; reuse the helper from di-proposals.ts
// to format areas_of_interest as a PG array literal.
import { toPgTextArrayLiteral } from "./di-proposals";

import {
  createItem,
  readItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

export type ApproveResult = {
  proposalId: string;
  targetChildId: string;
  appliedFields: string[];
  operation: "create" | "update";
};

export type RejectResult = {
  proposalId: string;
};

// ─── Typed errors ───────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Proposal not found") {
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

export class TargetChildMissingError extends Error {
  readonly code = "target_child_missing" as const;
  constructor(message = "UPDATE proposal has no target_child") {
    super(message);
    this.name = "TargetChildMissingError";
  }
}

export class ChildWriteFailedError extends Error {
  readonly code = "child_write_failed" as const;
  constructor(public readonly cause?: unknown) {
    super(
      cause instanceof Error
        ? `Child write failed: ${cause.message}`
        : "Child write failed",
    );
    this.name = "ChildWriteFailedError";
  }
}

// ─── Mirror field set ───────────────────────────────────────────────
//
// These are the columns child_proposal stores AND child has the same
// shape for. NEVER includes encrypted columns, medical_conditions,
// allergies, mental_health_notes — those stay admin-only / locked.

const MIRROR_FIELDS = [
  // Identity
  "display_name",
  "first_name",
  "gender",
  "date_of_birth",
  "photo_consent",
  // Photo (M2O directus_files; capital P on child, lowercase 'photo'
  // not a thing here — the column is `Photo`)
  "Photo",
  // Location (Session 48a — added permanent_address)
  "bd_division",
  "bd_district",
  "district_internal",
  "permanent_address",
  // Education + interests (Session 48a — added educational_organization
  // M2O + school_name_raw fallback; areas_of_interest is now text[])
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  // Donor-facing story
  "story",
  // Support plan (Session 48a — priority columns)
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  // Health (excludes medical_conditions, allergies, mental_health_notes)
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  // Family (Session 48a — added parent_loss)
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  // Socioeconomic
  "household_income_source",
  "monthly_household_income_bdt",
  // Guardian (Session 48a — added employment_type + phones)
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  // Field visit / submission (Session 48a — both columns mirror)
  "last_visit_date",
  "submission_date",
] as const;

type ProposalRowFlat = {
  id: string;
  proposal_type: "create" | "update";
  target_child: string | null;
  status: string;
  created_by: string | null;
} & Partial<Record<(typeof MIRROR_FIELDS)[number], unknown>>;

async function readProposal(proposalId: string): Promise<ProposalRowFlat | null> {
  try {
    const result = (await directusServer().request(
      readItem("child_proposal" as never, proposalId as never, {
        fields: ["*"],
      } as never),
    )) as unknown as ProposalRowFlat | null;
    return result ?? null;
  } catch (err) {
    // Directus's "not found" path returns a FORBIDDEN error
    // ("You don't have permission to access this.") — the standard
    // Directus pattern of not revealing whether an item exists. The
    // SDK wraps this as a DirectusError with an `errors` array
    // containing `{ extensions: { code: 'FORBIDDEN' } }`. We translate
    // those to null so the route returns 404 instead of 500.
    //
    // Any other error is unexpected and re-thrown to bubble to the
    // route handler's 500 path.
    if (isDirectusForbiddenOrMissing(err)) return null;
    throw err;
  }
}

// Detect "Directus says no such item / no permission" via either the
// SDK's structured error shape OR a string fallback. The SDK's
// `DirectusError` exposes `errors[].extensions.code`; the string
// fallback covers any older or wrapped errors.
function isDirectusForbiddenOrMissing(err: unknown): boolean {
  if (!err) return false;
  const errors = (err as { errors?: Array<{ extensions?: { code?: string } }> })
    .errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const code = e?.extensions?.code;
      if (
        code === "FORBIDDEN" ||
        code === "RECORD_NOT_UNIQUE" ||
        code === "ROUTE_NOT_FOUND"
      ) {
        return true;
      }
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("FORBIDDEN") ||
    msg.includes("permission to access") ||
    msg.includes("not found") ||
    msg.includes("doesn't exist")
  );
}

// Pull the non-null mirror slice off a proposal row. For UPDATE, this
// is the proposed-changes set (DI submitted only changed fields). For
// CREATE, this is the full new-record set.
function pickMirrorPayload(
  proposal: ProposalRowFlat,
): { payload: Record<string, unknown>; appliedFields: string[] } {
  const payload: Record<string, unknown> = {};
  const appliedFields: string[] = [];
  for (const field of MIRROR_FIELDS) {
    const value = proposal[field];
    if (value === null || value === undefined) continue;
    // Treat empty strings as not-set so UPDATE doesn't blank a field
    // when the DI form passed a stripped-empty submission.
    if (typeof value === "string" && value.trim().length === 0) continue;
    // Empty arrays are also "not-set" for the same reason.
    if (Array.isArray(value) && value.length === 0) continue;
    // Session 48a — text[] columns need the Postgres array literal
    // form when written via Directus; the SDK can't serialise JS
    // arrays into text[]. Currently only areas_of_interest hits
    // this path; the helper is generic so future text[] columns
    // are covered automatically.
    if (Array.isArray(value)) {
      payload[field] = toPgTextArrayLiteral(value as string[]);
    } else {
      payload[field] = value;
    }
    appliedFields.push(field);
  }
  return { payload, appliedFields };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Approve a child_proposal: copy its mirror fields onto the target
 * child (or insert a new child for CREATE), then mark the proposal
 * approved + write an audit log entry.
 */
export async function approveProposal(
  proposalId: string,
  adminUserId: string,
): Promise<ApproveResult> {
  if (!proposalId) throw new NotFoundError();

  const proposal = await readProposal(proposalId);
  if (!proposal) throw new NotFoundError();

  if (proposal.status !== "pending") {
    throw new InvalidStatusError(
      `Only pending proposals can be approved (current: ${proposal.status})`,
    );
  }

  const { payload, appliedFields } = pickMirrorPayload(proposal);
  let targetChildId: string;

  if (proposal.proposal_type === "update") {
    if (!proposal.target_child) throw new TargetChildMissingError();
    targetChildId = proposal.target_child;

    if (Object.keys(payload).length === 0) {
      // Edge case: proposal exists but has no mirror columns set.
      // Mark approved anyway (admin's call to approve says yes) but
      // skip the child write — nothing to apply.
      console.warn(
        "[admin-proposals] approveProposal: UPDATE proposal has no mirror fields to apply",
        { proposalId },
      );
    } else {
      try {
        await directusServer().request(
          updateItem(
            "child" as never,
            targetChildId as never,
            payload as never,
          ),
        );
      } catch (err) {
        throw new ChildWriteFailedError(err);
      }
    }
  } else {
    // CREATE: Session 52a — two sub-paths based on whether the
    // proposal already has a stub child attached.
    //   (a) target_child is set (Session 52a stub from draft / direct
    //       submit): UPDATE the existing stub in place. Documents +
    //       intake photos uploaded during proposal entry are already
    //       FK-attached to this row, so we MUST preserve its id.
    //       Status flips from 'awaiting_intake' to 'active'.
    //   (b) target_child is null (legacy CREATE proposal from before
    //       Session 52a, or future variant that intentionally skips
    //       the stub): INSERT a brand-new child row as before.
    if (!proposal.created_by) {
      throw new ChildWriteFailedError(
        new Error("CREATE proposal has no created_by"),
      );
    }
    if (proposal.target_child) {
      // (a) UPDATE the stub — apply mirror columns + flip status.
      targetChildId = proposal.target_child;
      const updatePayload: Record<string, unknown> = {
        ...payload,
        status: "active",
        // uploaded_by_di / assigned_di were already stamped at stub
        // creation time. We don't overwrite them on approval — the
        // stub is the source of truth for those fields.
      };
      try {
        await directusServer().request(
          updateItem(
            "child" as never,
            targetChildId as never,
            updatePayload as never,
          ),
        );
      } catch (err) {
        throw new ChildWriteFailedError(err);
      }
    } else {
      // (b) Legacy / fallback INSERT path.
      const insertPayload: Record<string, unknown> = {
        ...payload,
        uploaded_by_di: proposal.created_by,
        assigned_di: proposal.created_by, // first DI is also the assignee
        // Status defaults to 'active' on child; admin can adjust later.
        status: "active",
      };
      try {
        const created = (await directusServer().request(
          createItem("child" as never, insertPayload as never),
        )) as unknown as { id?: string } | undefined;
        if (!created?.id) {
          throw new ChildWriteFailedError(
            new Error("Insert returned no child id"),
          );
        }
        targetChildId = String(created.id);
      } catch (err) {
        if (err instanceof ChildWriteFailedError) throw err;
        throw new ChildWriteFailedError(err);
      }
    }
  }

  // Mark proposal approved. For CREATE, also stamp the new
  // target_child id so the proposal row links back to its result.
  const proposalPatch: Record<string, unknown> = {
    status: "approved",
    approved_by: adminUserId,
    published_at: new Date().toISOString(),
    rejection_reason: null,
  };
  if (proposal.proposal_type === "create") {
    proposalPatch.target_child = targetChildId;
  }

  try {
    await directusServer().request(
      updateItem(
        "child_proposal" as never,
        proposalId as never,
        proposalPatch as never,
      ),
    );
  } catch (err) {
    // Loud log per header — child IS updated, but proposal still
    // reads pending. Caller maps to 500.
    console.error(
      "[admin-proposals] CRITICAL: child write succeeded but proposal status update failed",
      {
        proposalId,
        targetChildId,
        operation: proposal.proposal_type,
        appliedFields,
        err: err instanceof Error ? err.message : String(err),
      },
    );
    throw new Error(
      "child_updated_but_proposal_status_failed: see server logs",
    );
  }

  // Best-effort audit. Failure swallowed (matches recordAuditEvent
  // contract — audit is never the blocker).
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_approved_proposal",
        collection: "child_proposal",
        record_id: proposalId,
        metadata: {
          targetChildId,
          operation: proposal.proposal_type,
          appliedFields,
          // childId duplicated under the canonical key so the per-
          // child History tab (Session 46) surfaces this event.
          childId: targetChildId,
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-proposals] audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  // Session 47 — in-app notification to the DI who submitted the
  // proposal. Best-effort: notify() swallows internally so a
  // notification miss can't roll back the approval.
  if (proposal.created_by) {
    const childLabel = await fetchChildDisplayName(targetChildId);
    const opLabel =
      proposal.proposal_type === "create" ? "new-child proposal" : "edit";
    await notify({
      recipientUserId: proposal.created_by,
      type: "admin_approved_proposal",
      title: `Approved: ${opLabel} for ${childLabel}`,
      body:
        proposal.proposal_type === "create"
          ? `Your new-child proposal for ${childLabel} is live. Donors can now sponsor them.`
          : `Your profile edit for ${childLabel} is live. ${appliedFields.length} field${appliedFields.length === 1 ? "" : "s"} updated.`,
      relatedCollection: "child_proposal",
      relatedId: proposalId,
    });
  }

  return {
    proposalId,
    targetChildId,
    appliedFields,
    operation: proposal.proposal_type,
  };
}

/**
 * Fetch a child's display_name for notification body composition.
 * Returns "this child" on miss so the notification still renders
 * cleanly even if the lookup fails.
 */
async function fetchChildDisplayName(childId: string): Promise<string> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["display_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ display_name: string | null }> | undefined;
    return rows?.[0]?.display_name?.trim() || "this child";
  } catch {
    return "this child";
  }
}

/**
 * Reject a child_proposal. Sets status='rejected', approved_by, and
 * rejection_reason. No row mutation on child. Audit
 * admin_rejected_proposal.
 *
 * Session 52a note: when rejecting a CREATE proposal that already
 * has a target_child (the Session 52a stub created at draft time),
 * we LEAVE the stub in place with status='awaiting_intake'. The DI
 * can resubmit (the documents + intake photos they uploaded against
 * the stub are still attached and will surface on the next
 * approval). Future cleanup pass: a scheduled job to GC stubs whose
 * proposals have been rejected + N days have passed without
 * resubmission. Out of scope for the hotfix.
 */
export async function rejectProposal(
  proposalId: string,
  adminUserId: string,
  reason?: string,
): Promise<RejectResult> {
  if (!proposalId) throw new NotFoundError();

  const proposal = await readProposal(proposalId);
  if (!proposal) throw new NotFoundError();

  if (proposal.status !== "pending") {
    throw new InvalidStatusError(
      `Only pending proposals can be rejected (current: ${proposal.status})`,
    );
  }

  const reasonTrimmed = reason?.trim() ?? "";
  const proposalPatch: Record<string, unknown> = {
    status: "rejected",
    approved_by: adminUserId,
    rejection_reason: reasonTrimmed.length > 0 ? reasonTrimmed : null,
    published_at: new Date().toISOString(),
  };

  try {
    await directusServer().request(
      updateItem(
        "child_proposal" as never,
        proposalId as never,
        proposalPatch as never,
      ),
    );
  } catch (err) {
    console.error(
      "[admin-proposals] rejectProposal update failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("proposal_update_failed");
  }

  // Best-effort audit.
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_rejected_proposal",
        collection: "child_proposal",
        record_id: proposalId,
        metadata: {
          rejectionReason: reasonTrimmed || null,
          // Surface on per-child History when an UPDATE proposal is
          // rejected (CREATE proposals have no target_child yet).
          ...(proposal.target_child
            ? { childId: proposal.target_child }
            : {}),
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-proposals] audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  // Session 47 — in-app notification to the DI. Same best-effort
  // contract as audit. Body includes the rejection_reason verbatim
  // (admin-to-DI communication channel — admins are trusted to keep
  // it professional). Empty/missing reason yields a neutral copy.
  if (proposal.created_by) {
    const childLabel = proposal.target_child
      ? await fetchChildDisplayName(proposal.target_child)
      : "your new child proposal";
    const opLabel =
      proposal.proposal_type === "create" ? "new-child proposal" : "edit";
    await notify({
      recipientUserId: proposal.created_by,
      type: "admin_rejected_proposal",
      title: `Rejected: ${opLabel} for ${childLabel}`,
      body: reasonTrimmed
        ? `Admin's note: ${reasonTrimmed}`
        : "Admin rejected this submission. Open the proposal to see context.",
      relatedCollection: "child_proposal",
      relatedId: proposalId,
    });
  }

  return { proposalId };
}

// Re-export the audit reader so admin tooling has a single import
// point — the Session 46 di-audit lib already does the heavy lifting.
export { listAuditEventsForChild } from "./di-audit";
// readItems is re-exported intentionally for future admin list
// endpoints (e.g. all-pending-proposals view) without making them
// re-import from the SDK.
export { readItems };
