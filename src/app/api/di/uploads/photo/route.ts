// Session 44 — DI photo upload endpoint.
//
// Accepts a multipart form with a single `photo` file field. Forwards
// to Directus's /files endpoint via the admin token (server-side, so
// the token never touches the browser). Returns the new
// directus_files UUID; the client then includes that UUID on the
// proposal submission.
//
// Auth: requires DI session. Out-of-session requests get 401.
//
// Status mapping:
//   400 missing_file       — no file part in the form data
//   401 unauthorized       — no DI session
//   413 too_large          — file exceeds 5 MB
//   415 invalid_type       — mime not in jpeg/png/webp
//   500 upload_failed      — anything else (logged server-side)

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadPhotoToDirectus,
} from "@/lib/di-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn(
      "[/api/di/uploads/photo] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    const { fileUuid } = await uploadPhotoToDirectus(file, session.userId);
    return NextResponse.json({ fileUuid });
  } catch (err) {
    if (err instanceof InvalidFileTypeError) {
      return NextResponse.json(
        { error: "invalid_type", mime: err.mime },
        { status: 415 },
      );
    }
    if (err instanceof FileTooLargeError) {
      return NextResponse.json(
        { error: "too_large", bytes: err.bytes },
        { status: 413 },
      );
    }
    console.error(
      "[/api/di/uploads/photo] upload_failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
