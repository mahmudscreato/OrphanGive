// Session 48b — promote a draft proposal to a pending submission.
//
// POST /api/di/proposals/[id]/submit
//
// Re-uses the same strict validation as /api/di/proposals POST
// mode=submit by re-building a CreateProposalInput from the draft
// row's columns and feeding it back through createProposal. After
// the new pending row is created, the original draft is deleted —
// admin reviews the pending submission, not the original draft.
//
// Why "create new + delete old" instead of just flipping status:
// the strict validators in createCreateProposal / createUpdateProposal
// recompute diffs, validate cross-field rules, and produce
// `previous_snapshot` for the diff display. Re-running them via
// createProposal() guarantees the resulting pending row matches
// what a fresh-from-form submission would have stored. Status-flip
// alone would skip those guarantees.
//
// Status mapping:
//   200 ok                       — { proposalId } (the NEW pending row's id)
//   400 bad_request              — draft fails strict validation
//   401 unauthorized
//   404 not_found                — draft not owned / not found / not a draft
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createProposal,
  DivisionNotAllowedError,
  discardDraftProposal,
  getDraftForUser,
  InvalidValueError,
  MissingRequiredFieldError,
  NoChangesError,
  OutOfScopeError,
  type CreateProposalInput,
} from "@/lib/di-proposals";
import { recordAuditEvent } from "@/lib/di-audit";
import { notifyAdminOfPendingSubmission } from "@/lib/di-notify";

export const dynamic = "force-dynamic";

// List of column names we expect on a draft row that map 1:1 to the
// editable/creatable fields. Source of truth for what gets carried
// across into the pending submission body. Anything not in this list
// is dropped silently (e.g. status, target_child handled separately).
const COPYABLE_FIELDS = [
  "display_name",
  "gender",
  "date_of_birth",
  "photo_consent",
  "bd_division",
  "bd_district",
  "district_internal",
  "permanent_address",
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  "story",
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  "household_income_source",
  "monthly_household_income_bdt",
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  "last_visit_date",
  "submission_date",
] as const;

function buildSubmissionInput(
  draft: Record<string, unknown>,
): CreateProposalInput | { error: string } {
  const operation = draft.proposal_type as "create" | "update" | undefined;
  if (operation !== "create" && operation !== "update") {
    return { error: "draft has invalid proposal_type" };
  }
  const photoUuid = (draft.Photo as string | null) ?? null;

  // Strip nulls so optional fields fall through as missing.
  const fields: Record<string, unknown> = {};
  for (const key of COPYABLE_FIELDS) {
    const value = draft[key];
    if (value === null || value === undefined) continue;
    fields[key] = value;
  }

  if (operation === "update") {
    const childId = draft.target_child as string | null;
    if (!childId) {
      return { error: "update draft has no target_child" };
    }
    return {
      operation: "update",
      childId,
      fields,
      photoUuid,
    };
  }
  // create
  if (!photoUuid) {
    // The strict validator will also reject this, but surfacing it
    // up front gives a clearer error than the zod issue list.
    return { error: "create draft has no Photo" };
  }
  return {
    operation: "create",
    fields: fields as never,
    photoUuid,
  };
}

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

  const draft = await getDraftForUser(id, session.userId);
  if (!draft) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const built = buildSubmissionInput(draft);
  if ("error" in built) {
    return NextResponse.json(
      { error: "bad_request", message: built.error },
      { status: 400 },
    );
  }

  // Re-run the strict validation by going through createProposal.
  // Any required-field / cross-field rule failure surfaces here.
  let proposalId: string;
  try {
    const result = await createProposal(session.userId, built);
    proposalId = result.proposalId;
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof NoChangesError) {
      return NextResponse.json(
        { error: "no_changes", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof DivisionNotAllowedError) {
      return NextResponse.json(
        {
          error: "division_not_allowed",
          divisionCode: err.divisionCode,
          message: err.message,
        },
        { status: 403 },
      );
    }
    if (err instanceof MissingRequiredFieldError) {
      return NextResponse.json(
        {
          error: "missing_required_field",
          field: err.fieldName,
          message: err.message,
        },
        { status: 400 },
      );
    }
    if (err instanceof InvalidValueError) {
      return NextResponse.json(
        {
          error: "invalid_value",
          field: err.fieldName,
          message: err.message,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/di/proposals/[id]/submit POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Now that the pending row exists, discard the original draft.
  // (Best-effort — if the discard fails, the DI ends up with both a
  // pending submission AND a draft, which is mildly confusing but
  // not broken. They can manually discard the draft.)
  await discardDraftProposal(session.userId, id);

  // Audit + notify, same shape as the fresh-submit POST path.
  const childIdForMeta =
    built.operation === "update" ? built.childId : null;
  await recordAuditEvent({
    actorUserId: session.userId,
    action: "di_submitted_proposal",
    collection: "child_proposal",
    recordId: proposalId,
    metadata: {
      operation: built.operation,
      promotedFromDraftId: id,
      ...(childIdForMeta ? { childId: childIdForMeta } : {}),
    },
    request: req,
  });
  await notifyAdminOfPendingSubmission({
    collection: "child_proposal",
    recordId: proposalId,
    submittedByUserId: session.userId,
    ...(childIdForMeta ? { childId: childIdForMeta } : {}),
    summary:
      built.operation === "create"
        ? `New child proposal: ${(built.fields as { display_name?: string }).display_name ?? "(unnamed)"}`
        : "Edit-profile proposal (from draft)",
  });

  return NextResponse.json({ proposalId });
}
