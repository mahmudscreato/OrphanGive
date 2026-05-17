// Session 52d — Admin direct intake-photo upload endpoint.
//
// POST /api/admin/intake-photos
//   multipart/form-data:
//     photo:    File          (required — JPEG/PNG/WebP, ≤5 MB)
//     childId:  string (UUID) (required — target child)
//     caption:  string        (optional, ≤200 chars)
//
// Flow:
//   1. Upload the file blob to directus_files via the admin token
//      (uploadPhotoToDirectus with an "Admin upload by" title prefix).
//   2. Register a child_intake_photo row with status='approved' and
//      uploaded_by = admin user (so the row appears in the same grids
//      as DI-uploaded photos but skips the review queue).
//   3. Audit event = `admin_uploaded_intake_photo`.
//
// No DI notification fires for admin direct uploads — the DI didn't
// initiate this and nothing has been retracted, so there's no "news
// worth knowing" event. If the DI later opens the child, the photo
// will simply appear in their grid (read-only for them since they
// don't own it).

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { uploadDirectIntakePhoto } from "@/lib/admin-intake-photos";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadPhotoToDirectus,
} from "@/lib/di-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn(
      "[/api/admin/intake-photos POST] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("photo");
  const childId = (formData.get("childId") as string | null)?.trim() ?? "";
  const captionRaw = formData.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0
      ? captionRaw.trim().slice(0, 200)
      : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!childId) {
    return NextResponse.json({ error: "missing_child" }, { status: 400 });
  }

  // Step 1: file blob upload.
  let fileUuid: string;
  try {
    const result = await uploadPhotoToDirectus(file, adminSession.userId, {
      titlePrefix: "Admin upload by",
    });
    fileUuid = result.fileUuid;
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
      "[/api/admin/intake-photos POST] file upload failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  // Step 2: register the row (status=approved, uploaded_by=admin).
  try {
    const { photoId } = await uploadDirectIntakePhoto({
      adminUserId: adminSession.userId,
      childId,
      photoUuid: fileUuid,
      caption,
    });
    return NextResponse.json({ ok: true, photoId, fileUuid });
  } catch (err) {
    console.error(
      "[/api/admin/intake-photos POST] register failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
