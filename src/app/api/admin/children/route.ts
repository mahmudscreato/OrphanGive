// POST /api/admin/children — admin direct-CREATE of a child profile.
//
// Body: a partial AdminChildEditableFields payload (validated by the SHARED
// adminChildFieldsSchema — same schema the edit route uses). display_name is
// required; everything else is optional at create.
//
// The child lands status='awaiting_intake' (NOT public/sponsorable),
// attributed to the creating admin (created_by). The admin then reviews on
// /admin/children/[id] and PUBLISHES via the existing reactivate action
// (which enforces the required-field gate). This route never publishes.
//
// Status mapping:
//   200 ok            — { childId }
//   400 bad_request   — body isn't JSON / fails schema
//   400 invalid_state — display_name missing (or other create precondition)
//   401 unauthorized
//   500 server_error / write_failed

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildNotFoundError,
  ChildWriteFailedError,
  InvalidChildStateError,
  adminChildFieldsSchema,
  createChildAsAdmin,
  type AdminChildEditableFields,
} from "@/lib/admin-child-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const parsed = adminChildFieldsSchema.safeParse(json);
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
    const result = await createChildAsAdmin(
      session.userId,
      parsed.data as AdminChildEditableFields,
      req,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InvalidChildStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof ChildWriteFailedError) {
      console.error("[/api/admin/children POST] write_failed", err.message);
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't create the child." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
