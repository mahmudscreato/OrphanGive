// Session 49 — DI documents collection endpoint.
//
// GET  /api/di/documents?childId=X     — list this DI's documents for a child
// POST /api/di/documents               — create new document row.
//                                       Body: { childId, documentType,
//                                               fileUuid, notes?, proposalId? }
//
// Out-of-scope childId returns 404 (collapsed with not-found).
// File upload happens via the existing /api/di/uploads/photo pipeline
// (which accepts JPEG/PNG/WebP — same allowlist works for scanned
// document photos); this endpoint only registers the directus_files
// UUID against a new child_document row.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createDocument,
  InvalidInputError,
  listDocumentsForChild,
  OutOfScopeError,
} from "@/lib/di-documents";
import { recordAuditEvent } from "@/lib/di-audit";
import { DOCUMENT_TYPES } from "@/lib/form-constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const childId = req.nextUrl.searchParams.get("childId")?.trim();
  if (!childId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const documents = await listDocumentsForChild(session.userId, childId);
    return NextResponse.json({ documents });
  } catch (err) {
    console.error(
      "[/api/di/documents GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

const createBodySchema = z
  .object({
    childId: z.string().uuid(),
    documentType: z.enum(DOCUMENT_TYPES),
    fileUuid: z.string().min(8),
    notes: z.string().max(1000).nullable().optional(),
    proposalId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = createBodySchema.safeParse(json);
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
    const { documentId } = await createDocument(
      { userId: session.userId, accessToken: session.accessToken },
      parsed.data,
    );
    // Audit metadata intentionally omits notes (Tier 3 free text the
    // DI may have written about identifying details on the document).
    // documentType is safe — it's enum-valued, not free text.
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_uploaded_document",
      collection: "child_document",
      recordId: documentId,
      metadata: {
        childId: parsed.data.childId,
        documentType: parsed.data.documentType,
        fileUuid: parsed.data.fileUuid,
        ...(parsed.data.proposalId ? { proposalId: parsed.data.proposalId } : {}),
      },
      request: req,
    });
    return NextResponse.json({ documentId });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidInputError) {
      return NextResponse.json(
        { error: "invalid_input", field: err.field, message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/di/documents POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
