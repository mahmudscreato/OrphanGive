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

  // Profile photo (child.Photo, a directus_files uuid) rides alongside the
  // field payload but isn't part of the editable field schema — read it from
  // the raw body and validate it's a uuid-shaped string.
  const rawPhoto =
    json && typeof json === "object" && "Photo" in json
      ? (json as Record<string, unknown>).Photo
      : undefined;
  const photoUuid =
    typeof rawPhoto === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawPhoto,
    )
      ? rawPhoto
      : null;

  // Consent rule (mirrors the DI form): if a photo is attached, photo_consent
  // MUST be true — no photo may be published without recorded consent.
  if (photoUuid && parsed.data.photo_consent !== true) {
    return NextResponse.json(
      {
        error: "invalid_state",
        message:
          "Photo consent is required when a photo is attached. Tick the consent box or remove the photo.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await createChildAsAdmin(
      session.userId,
      parsed.data as AdminChildEditableFields,
      { photoUuid, request: req },
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
