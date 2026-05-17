// Session 52d — Admin direct document upload endpoint.
//
// POST /api/admin/documents
//   multipart/form-data:
//     document:      File              (required — JPEG/PNG/WebP/PDF, ≤10 MB)
//     childId:       string (UUID)     (required)
//     documentType:  DocumentType enum (required)
//     notes:         string            (optional, ≤1000 chars)
//
// Flow mirrors /api/admin/intake-photos:
//   1. uploadDocumentToDirectus with admin title prefix.
//   2. uploadDirectDocument registers the row with status=approved
//      and uploaded_by = admin.
//   3. Audit event = `admin_uploaded_document`.
//
// No DI notification — DI didn't initiate this, nothing was retracted.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { uploadDirectDocument } from "@/lib/admin-documents";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadDocumentToDirectus,
} from "@/lib/di-photos";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/form-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_TYPE_SET = new Set<string>(DOCUMENT_TYPES);
function isDocumentType(s: string): s is DocumentType {
  return DOC_TYPE_SET.has(s);
}

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
      "[/api/admin/documents POST] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("document");
  const childId = (formData.get("childId") as string | null)?.trim() ?? "";
  const documentTypeRaw =
    (formData.get("documentType") as string | null)?.trim() ?? "";
  const notesRaw = formData.get("notes");
  const notes =
    typeof notesRaw === "string" && notesRaw.trim().length > 0
      ? notesRaw.trim().slice(0, 1000)
      : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!childId) {
    return NextResponse.json({ error: "missing_child" }, { status: 400 });
  }
  if (!isDocumentType(documentTypeRaw)) {
    return NextResponse.json(
      { error: "invalid_document_type" },
      { status: 400 },
    );
  }

  // Step 1: file upload.
  let fileUuid: string;
  try {
    const result = await uploadDocumentToDirectus(file, adminSession.userId, {
      titlePrefix: "Admin document upload by",
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
      "[/api/admin/documents POST] file upload failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  // Step 2: register row.
  try {
    const { documentId } = await uploadDirectDocument({
      adminUserId: adminSession.userId,
      childId,
      documentType: documentTypeRaw,
      fileUuid,
      notes,
    });
    return NextResponse.json({ ok: true, documentId, fileUuid });
  } catch (err) {
    console.error(
      "[/api/admin/documents POST] register failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
