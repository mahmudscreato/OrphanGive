// Session 66 — POST /api/admin/children/[id]/edit
//
// Direct admin edit of a child record. Bypasses the DI proposal
// queue — admin authority. Body is a partial AdminChildEditableFields
// payload; only present keys are written, only changed values trigger
// the actual update.
//
// Validation is performed inside editChildAsAdmin (rejects blanking
// of required fields). Body shape is validated here with a permissive
// Zod schema — anything not in the schema is dropped silently so a
// stale UI sending extra fields doesn't 400.
//
// Status mapping:
//   200 ok            — { childId, appliedFields, editedAt }
//   400 bad_request   — body isn't JSON
//   400 invalid_state — required field would be blanked
//   401 unauthorized
//   404 not_found
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildNotFoundError,
  ChildWriteFailedError,
  InvalidChildStateError,
  editChildAsAdmin,
  type AdminChildEditableFields,
} from "@/lib/admin-child-actions";

export const dynamic = "force-dynamic";

// Loose schema: every field optional, anything not listed gets
// stripped (Zod's .strip() is the default). The action helper does
// the actual change-detection + required-blanking guard.
const editSchema = z
  .object({
    display_name: z.string().min(1).max(200).optional(),
    gender: z.string().max(40).nullable().optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    photo_consent: z.boolean().nullable().optional(),
    bd_division: z.string().max(50).nullable().optional(),
    bd_district: z.string().max(50).nullable().optional(),
    district_internal: z.string().max(200).nullable().optional(),
    permanent_address: z.string().max(500).nullable().optional(),
    education_level: z.string().max(60).nullable().optional(),
    class_grade: z.string().max(100).nullable().optional(),
    educational_organization: z.string().uuid().nullable().optional(),
    school_name_raw: z.string().max(200).nullable().optional(),
    areas_of_interest: z.array(z.string()).max(20).nullable().optional(),
    story: z.string().min(50).max(2000).optional(),
    support_type: z.string().max(60).nullable().optional(),
    monthly_cost: z.number().int().min(0).max(1_000_000).nullable().optional(),
    priority_support: z.string().max(40).nullable().optional(),
    priority_notes: z.string().max(500).nullable().optional(),
    blood_group: z.string().max(8).nullable().optional(),
    vaccination_status: z.string().max(40).nullable().optional(),
    last_medical_checkup: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    disability_status: z.string().max(40).nullable().optional(),
    disability_notes: z.string().max(1000).nullable().optional(),
    parent_loss: z.string().max(40).nullable().optional(),
    siblings_count: z.number().int().min(0).max(30).nullable().optional(),
    sibling_position: z.number().int().min(0).max(30).nullable().optional(),
    siblings_notes: z.string().max(500).nullable().optional(),
    household_size: z.number().int().min(0).max(30).nullable().optional(),
    household_income_source: z.string().max(40).nullable().optional(),
    monthly_household_income_bdt: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    guardian_relationship: z.string().max(40).nullable().optional(),
    guardian_employment_type: z.string().max(40).nullable().optional(),
    guardian_employment: z.string().max(200).nullable().optional(),
    guardian_phone: z.string().min(7).max(32).nullable().optional(),
    guardian_phone_alt: z.string().max(32).nullable().optional(),
    guardian_summary_internal: z.string().min(1).max(2000).optional(),
    additional_family_notes: z.string().max(1000).nullable().optional(),
    last_visit_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    submission_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strip();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const parsed = editSchema.safeParse(json);
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
    const result = await editChildAsAdmin(
      id,
      session.userId,
      parsed.data as AdminChildEditableFields,
      req,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ChildNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidChildStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildWriteFailedError) {
      console.error(
        "[/api/admin/children/edit] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't save the change." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children/edit] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
