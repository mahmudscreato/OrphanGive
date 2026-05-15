// Session 44 — DI proposals collection endpoint.
//
//   GET  — lists the authenticated DI's proposals (optionally filtered
//          by ?status=). Sorted newest-first.
//   POST — creates a new proposal. Body must validate against the
//          createProposalBodySchema (zod). Server scope-guards UPDATE
//          via getDiChildById; for CREATE it validates bd_division
//          against the user's assigned_divisions.
//
// Status mapping (POST):
//   200 ok                         — { proposalId }
//   400 bad_request                — body shape invalid OR no_changes / missing_field / invalid_value
//   401 unauthorized
//   403 division_not_allowed
//   404 not_found                  — UPDATE on a child outside DI scope (collapsed with not-exists)
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createProposal,
  DivisionNotAllowedError,
  InvalidValueError,
  listProposalsForUser,
  MissingRequiredFieldError,
  NoChangesError,
  OutOfScopeError,
  type ProposalStatus,
} from "@/lib/di-proposals";
// Session 46 — audit + admin notification on every successful submission.
import { recordAuditEvent } from "@/lib/di-audit";
import { notifyAdminOfPendingSubmission } from "@/lib/di-notify";
// Session 48a — single source of truth for the new + extended enums.
// The other inline enums (SUPPORT_TYPES, BLOOD_GROUPS, etc.) stay
// inline below; consolidating them here is purely refactoring,
// flagged for follow-up.
import {
  AREAS_OF_INTEREST,
  EDUCATION_LEVELS,
  GUARDIAN_EMPLOYMENT_TYPES,
  GUARDIAN_RELATIONSHIPS as GUARDIAN_RELATIONSHIPS_EXTENDED,
  PARENT_LOSS,
  PRIORITY_SUPPORT,
} from "@/lib/form-constants";

export const dynamic = "force-dynamic";

// ─── GET ────────────────────────────────────────────────────────────

const VALID_STATUSES: ReadonlyArray<ProposalStatus> = [
  "draft",
  "pending",
  "approved",
  "rejected",
];

function parseStatusParam(s: string | null): ProposalStatus | undefined {
  if (!s) return undefined;
  return (VALID_STATUSES as readonly string[]).includes(s)
    ? (s as ProposalStatus)
    : undefined;
}

export async function GET(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = parseStatusParam(req.nextUrl.searchParams.get("status"));
  try {
    const proposals = await listProposalsForUser(session.userId, { status });
    return NextResponse.json({ proposals });
  } catch (err) {
    console.error(
      "[/api/di/proposals GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// ─── POST ───────────────────────────────────────────────────────────

// Session 46-fix-2 — full DI-collectable surface.
//
// All enum values match production Directus admin metadata. Free-text
// fields cap at 200 chars (single-line) or 2000 chars (textarea).
// Number fields cap at 1M (BDT income / cost) or 30 (siblings) per
// human-realistic ranges.

const SUPPORT_TYPES = [
  "education",
  "food",
  "healthcare",
  "clothing",
  "general_care",
  "other",
] as const;
const GENDERS = ["male", "female"] as const;
const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "unknown",
] as const;
const VACCINATION_STATUSES = [
  "up_to_date",
  "partial",
  "unknown",
  "not_started",
] as const;
const DISABILITY_STATUSES = [
  "none",
  "physical",
  "visual",
  "hearing",
  "cognitive",
  "multiple",
  "other",
] as const;
const HOUSEHOLD_INCOME_SOURCES = [
  "none",
  "day_labor",
  "agriculture",
  "small_business",
  "remittance",
  "mixed",
  "unknown",
] as const;
// Session 48a — replaces the inline enum with the shared constant
// (which now includes father + mother). Aliased to keep the local
// name unchanged across the rest of this file.
const GUARDIAN_RELATIONSHIPS = GUARDIAN_RELATIONSHIPS_EXTENDED;

// Shared field definitions. The editable schema makes everything
// optional; the creatable schema picks the required subset and tightens
// the optional ones to nullable-or-omitted.
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const editableFieldsSchema = z
  .object({
    // Identity
    display_name: z.string().min(1).max(200).optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: dateField.optional(),
    photo_consent: z.boolean().optional(),
    // Location (Session 48a — added permanent_address)
    bd_division: z.string().min(1).max(50).optional(),
    bd_district: z.string().min(1).max(50).optional(),
    district_internal: z.string().min(1).max(200).optional(),
    permanent_address: z.string().max(500).optional(),
    // Education + interests (Session 48a — education_level is now an
    // enum; areas_of_interest is text[]; school M2O + raw fallback)
    education_level: z.enum(EDUCATION_LEVELS).nullable().optional(),
    class_grade: z.string().max(100).optional(),
    educational_organization: z.string().uuid().nullable().optional(),
    school_name_raw: z.string().max(200).optional(),
    areas_of_interest: z
      .array(z.enum(AREAS_OF_INTEREST))
      .max(20)
      .optional(),
    // Donor-facing story
    story: z.string().min(50).max(2000).optional(),
    // Support plan (Session 48a — priority columns)
    support_type: z.enum(SUPPORT_TYPES).optional(),
    monthly_cost: z.number().int().min(0).max(1_000_000).nullable().optional(),
    priority_support: z.enum(PRIORITY_SUPPORT).optional(),
    priority_notes: z.string().max(500).optional(),
    // Health
    blood_group: z.enum(BLOOD_GROUPS).optional(),
    vaccination_status: z.enum(VACCINATION_STATUSES).optional(),
    last_medical_checkup: dateField.nullable().optional(),
    disability_status: z.enum(DISABILITY_STATUSES).optional(),
    disability_notes: z.string().max(1000).optional(),
    // Family (Session 48a — added parent_loss)
    parent_loss: z.enum(PARENT_LOSS).optional(),
    siblings_count: z.number().int().min(0).max(30).nullable().optional(),
    sibling_position: z.number().int().min(0).max(30).nullable().optional(),
    siblings_notes: z.string().max(500).optional(),
    household_size: z.number().int().min(0).max(30).nullable().optional(),
    // Socioeconomic
    household_income_source: z.enum(HOUSEHOLD_INCOME_SOURCES).optional(),
    monthly_household_income_bdt: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    // Guardian context (Session 48a — added employment_type + phones)
    guardian_relationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
    guardian_employment_type: z.enum(GUARDIAN_EMPLOYMENT_TYPES).optional(),
    guardian_employment: z.string().max(200).optional(),
    guardian_phone: z.string().min(7).max(32).optional(),
    guardian_phone_alt: z.string().max(32).optional(),
    guardian_summary_internal: z.string().min(1).max(2000).optional(),
    additional_family_notes: z.string().max(1000).optional(),
    // Field visit / submission (Session 48a — submission_date is the
    // canonical column; last_visit_date stays for backward compat
    // and is mirrored from submission_date in di-proposals.ts).
    last_visit_date: dateField.nullable().optional(),
    submission_date: dateField.nullable().optional(),
  })
  .strict();

const creatableFieldsSchema = z
  .object({
    // Required-on-create per Mahmud's V1 decision (Session 48a added
    // parent_loss + guardian_phone to the required set).
    display_name: z.string().min(1).max(200),
    date_of_birth: dateField,
    bd_division: z.string().min(1).max(50),
    bd_district: z.string().min(1).max(50),
    district_internal: z.string().min(1).max(200),
    support_type: z.enum(SUPPORT_TYPES),
    monthly_cost: z.number().int().min(0).max(1_000_000),
    story: z.string().min(50).max(2000),
    guardian_summary_internal: z.string().min(1).max(2000),
    guardian_relationship: z.enum(GUARDIAN_RELATIONSHIPS),
    parent_loss: z.enum(PARENT_LOSS),
    guardian_phone: z.string().min(7).max(32),
    // Optional-on-create.
    gender: z.enum(GENDERS).optional(),
    photo_consent: z.boolean().optional(),
    permanent_address: z.string().max(500).optional(),
    education_level: z.enum(EDUCATION_LEVELS).nullable().optional(),
    class_grade: z.string().max(100).optional(),
    educational_organization: z.string().uuid().nullable().optional(),
    school_name_raw: z.string().max(200).optional(),
    areas_of_interest: z
      .array(z.enum(AREAS_OF_INTEREST))
      .max(20)
      .optional(),
    priority_support: z.enum(PRIORITY_SUPPORT).optional(),
    priority_notes: z.string().max(500).optional(),
    blood_group: z.enum(BLOOD_GROUPS).optional(),
    vaccination_status: z.enum(VACCINATION_STATUSES).optional(),
    last_medical_checkup: dateField.nullable().optional(),
    disability_status: z.enum(DISABILITY_STATUSES).optional(),
    disability_notes: z.string().max(1000).optional(),
    siblings_count: z.number().int().min(0).max(30).nullable().optional(),
    sibling_position: z.number().int().min(0).max(30).nullable().optional(),
    siblings_notes: z.string().max(500).optional(),
    household_size: z.number().int().min(0).max(30).nullable().optional(),
    household_income_source: z.enum(HOUSEHOLD_INCOME_SOURCES).optional(),
    monthly_household_income_bdt: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    guardian_employment_type: z.enum(GUARDIAN_EMPLOYMENT_TYPES).optional(),
    guardian_employment: z.string().max(200).optional(),
    guardian_phone_alt: z.string().max(32).optional(),
    additional_family_notes: z.string().max(1000).optional(),
    last_visit_date: dateField.nullable().optional(),
    submission_date: dateField.nullable().optional(),
  })
  .strict();

const updateBodySchema = z
  .object({
    operation: z.literal("update"),
    childId: z.string().uuid(),
    fields: editableFieldsSchema,
    photoUuid: z.string().min(8).nullable(),
  })
  .strict();

const createBodySchema = z
  .object({
    operation: z.literal("create"),
    fields: creatableFieldsSchema,
    photoUuid: z.string().min(8),
  })
  .strict();

const createProposalBodySchema = z.discriminatedUnion("operation", [
  updateBodySchema,
  createBodySchema,
]);

export async function POST(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = createProposalBodySchema.safeParse(json);
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
    const { proposalId } = await createProposal(session.userId, parsed.data);
    // Session 46 — audit + admin notify, in that order. Both are
    // best-effort: failures are logged but don't break the user
    // submission (recordAuditEvent + notifyAdminOfPendingSubmission
    // both swallow internally).
    const childIdForMeta =
      parsed.data.operation === "update"
        ? parsed.data.childId
        : null;
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_submitted_proposal",
      collection: "child_proposal",
      recordId: proposalId,
      metadata: {
        operation: parsed.data.operation,
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
        parsed.data.operation === "create"
          ? `New child proposal: ${parsed.data.fields.display_name}`
          : "Edit-profile proposal",
    });
    return NextResponse.json({ proposalId });
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
      "[/api/di/proposals POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
