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

const editableFieldsSchema = z
  .object({
    display_name: z.string().min(1).max(200).optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bd_division: z.string().min(1).max(50).optional(),
    district_internal: z.string().min(1).max(200).optional(),
    support_type: z
      .enum([
        "education",
        "food",
        "healthcare",
        "clothing",
        "general_care",
        "other",
      ])
      .optional(),
    monthly_cost: z.number().int().min(0).max(1_000_000).nullable().optional(),
    education_level: z.string().max(100).nullable().optional(),
    story: z.string().min(50).max(2000).optional(),
    guardian_summary_internal: z.string().min(1).max(2000).optional(),
    last_visit_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

const creatableFieldsSchema = z
  .object({
    display_name: z.string().min(1).max(200),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bd_division: z.string().min(1).max(50),
    district_internal: z.string().min(1).max(200),
    support_type: z.enum([
      "education",
      "food",
      "healthcare",
      "clothing",
      "general_care",
      "other",
    ]),
    monthly_cost: z.number().int().min(0).max(1_000_000),
    story: z.string().min(50).max(2000),
    guardian_summary_internal: z.string().min(1).max(2000),
    education_level: z.string().max(100).nullable().optional(),
    last_visit_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
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
