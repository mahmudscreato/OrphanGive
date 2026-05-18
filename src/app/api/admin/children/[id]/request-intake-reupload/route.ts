// Session 66 — POST /api/admin/children/[id]/request-intake-reupload
//
// Body: { intakePhotoId: string, reason: string }
//
// Twin of request-document-reupload but targets child_intake_photo.
// Same workaround (audit + notify, no schema mutation).
//
// Status mapping identical to request-document-reupload.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildWriteFailedError,
  InvalidChildStateError,
  ReuploadTargetNotFoundError,
  requestIntakePhotoReupload,
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

  let body: { intakePhotoId?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as {
      intakePhotoId?: unknown;
      reason?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const intakePhotoId =
    typeof body.intakePhotoId === "string" ? body.intakePhotoId : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!intakePhotoId) {
    return NextResponse.json(
      { error: "bad_request", message: "intakePhotoId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await requestIntakePhotoReupload(
      id,
      intakePhotoId,
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
        "[/api/admin/children/request-intake-reupload] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't send the request." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children/request-intake-reupload] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
