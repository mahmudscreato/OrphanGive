// Admin profile-photo upload — mirrors /api/di/uploads/photo but admin-gated.
//
// Reuses the SAME uploadPhotoToDirectus helper (EXIF strip + asset
// classification + Directus file storage as PRIVATE) — no new storage path.
// Returns the directus_files UUID; the admin create form then writes it to
// child.Photo. The photo stays PRIVATE/non-public until the child is
// published (same rules as DI-uploaded child photos).
//
// Status mapping (matches the DI route):
//   400 missing_file / bad_request
//   401 unauthorized  — no admin session
//   413 too_large     — file exceeds 5 MB
//   415 invalid_type  — mime not in jpeg/png/webp
//   500 upload_failed

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadPhotoToDirectus,
} from "@/lib/di-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn(
      "[/api/admin/uploads/photo] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    // Attributed to the admin. The durable trace is the admin_created_child
    // audit written when the child (referencing this file) is created.
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
      "[/api/admin/uploads/photo] upload_failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
