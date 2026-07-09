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
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildNotFoundError,
  ChildWriteFailedError,
  InvalidChildStateError,
  adminChildFieldsSchema,
  editChildAsAdmin,
  type AdminChildEditableFields,
} from "@/lib/admin-child-actions";

export const dynamic = "force-dynamic";

// Field validation is the SHARED adminChildFieldsSchema (also used by the
// create route). The action helper does change-detection + the
// required-blanking guard.
const editSchema = adminChildFieldsSchema;

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
