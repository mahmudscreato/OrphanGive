// Session 51.5 — DI document file upload endpoint.
//
// Sibling of /api/di/uploads/photo but for the documents pipeline.
// Same multipart-form contract (`file` field), same audit shape,
// wider MIME allow-list (JPEG/PNG/WebP + PDF).
//
// Why a separate route rather than a query param on the photo
// route: route name carries semantic meaning in server logs + audit
// records; "I uploaded a document" is a different intent from "I
// uploaded a child photo." Keeping the routes parallel makes audit
// review easier later.
//
// Auth: requires DI session. Out-of-session requests get 401.
//
// Status mapping:
//   400 missing_file       — no file part in the form data
//   401 unauthorized       — no DI session
//   413 too_large          — file exceeds 5 MB
//   415 invalid_type       — mime not in jpeg/png/webp/pdf
//   500 upload_failed      — anything else (logged server-side)

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadDocumentToDirectus,
} from "@/lib/di-photos";
// Audit at the file-upload step (Session 46 pattern). The downstream
// /api/di/documents POST records a separate di_uploaded_document
// event when the child_document row is created. Both audits are
// useful: this one captures the file blob (orphaned-file investigations);
// the row-level one captures the document type + child id.
import { recordAuditEvent } from "@/lib/di-audit";

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
      "[/api/di/uploads/document] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // The form field is named `file` (not `photo`) to match the document
  // semantics. DocumentsSection's client code is updated in lockstep.
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    const { fileUuid } = await uploadDocumentToDirectus(file, session.userId);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_uploaded_photo", // file-blob-level event (reused;
                                    // mime in metadata disambiguates)
      collection: "directus_files",
      recordId: fileUuid,
      metadata: {
        sizeBytes: file.size,
        mime: file.type,
        kind: "document", // distinguishes from a child photo upload
      },
      request: req,
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
      "[/api/di/uploads/document] upload_failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
