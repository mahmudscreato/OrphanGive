// Admin document/image upload endpoint (for task comment attachments).
//
// Admin mirror of /api/di/uploads/document. Same multipart contract
// (`file` field), same MIME allow-list (JPEG/PNG/WebP + PDF), same
// 5 MB ceiling, same Directus file store. Returns the new
// directus_files UUID; the comment POST then links it.
//
// PRIVACY: uploadDocumentToDirectus titles the file with a "document
// upload" marker, so the /api/assets proxy classifies it PRIVATE
// (session-gated) — comment attachments are never openly served.
//
// Auth: requires an ADMIN session. Out-of-session requests get 401.
//
// Status mapping:
//   400 missing_file / 401 unauthorized / 413 too_large
//   415 invalid_type / 500 upload_failed

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadDocumentToDirectus,
} from "@/lib/di-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn(
      "[/api/admin/uploads/document] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    // Keep the "document upload" marker in the title so the asset proxy
    // classifies the attachment PRIVATE (session-gated).
    const { fileUuid } = await uploadDocumentToDirectus(file, admin.userId, {
      titlePrefix: "Admin comment document upload by",
    });
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
      "[/api/admin/uploads/document] upload_failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
