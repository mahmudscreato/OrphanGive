// Session 66 — POST /api/admin/children/[id]/request-document-reupload
//
// Body: { documentId: string, reason: string }
//
// Audit + notify-only — the document row's schema doesn't have
// re-upload flag columns yet (deferred to a future schema session).
// See the workaround note in admin-child-actions.ts.
//
// Status mapping:
//   200 ok            — { targetId, notifiedDiId, requestedAt }
//   400 bad_request   — body missing fields or not JSON
//   400 invalid_state — reason invalid
//   401 unauthorized
//   404 not_found     — child or document not found / not linked
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildWriteFailedError,
  InvalidChildStateError,
  ReuploadTargetNotFoundError,
  requestDocumentReupload,
} from "@/lib/admin-child-actions";

export const dynamic = "force-dynamic";

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

  let body: { documentId?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as {
      documentId?: unknown;
      reason?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const documentId =
    typeof body.documentId === "string" ? body.documentId : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!documentId) {
    return NextResponse.json(
      { error: "bad_request", message: "documentId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await requestDocumentReupload(
      id,
      documentId,
      session.userId,
      reason,
      req,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReuploadTargetNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof InvalidChildStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildWriteFailedError) {
      console.error(
        "[/api/admin/children/request-document-reupload] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't send the request." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children/request-document-reupload] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
