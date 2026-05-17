// Session 45 — DI video upload endpoint.
//
// Sibling to /api/di/uploads/photo. Differences:
//   - Different MIME allowlist (mp4 / webm / mov)
//   - 50 MB size limit (vs 5 MB for photos)
//   - Caller MUST pass ?duration=<seconds> as a query param. The
//     client VideoUploadField reads metadata from the file before
//     uploading (so the duration is known) and includes it here.
//     The route + helper enforce 60s max independently of the client
//     gate.
//
// Why duration in query string vs form field: query strings are part
// of the URL path Next.js parses cleanly; pulling it from FormData
// would need an additional roundtrip through the multipart parser
// before we know whether to even start the upload. The client decides
// the duration before posting; we trust it just enough to gate
// before the file processing begins, then re-validate post-upload.

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  FileTooLargeError,
  InvalidFileTypeError,
  uploadVideoToDirectus,
  VideoTooLongError,
} from "@/lib/di-photos";
// Session 46 — audit on every successful video upload (same shape
// rationale as the photo route: collection-level, no childId).
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pull duration from query string FIRST so we can fast-fail before
  // parsing a 50 MB form body.
  const durationParam = req.nextUrl.searchParams.get("duration");
  const durationSeconds = durationParam ? Number(durationParam) : NaN;
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > 60
  ) {
    return NextResponse.json(
      { error: "video_too_long", seconds: durationSeconds },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn(
      "[/api/di/uploads/video] formData parse failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = formData.get("video");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    const { fileUuid } = await uploadVideoToDirectus(
      file,
      session.userId,
      durationSeconds,
    );
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_uploaded_video",
      collection: "directus_files",
      recordId: fileUuid,
      metadata: {
        sizeBytes: file.size,
        mime: file.type,
        durationSeconds,
      },
      request: req,
    });
    return NextResponse.json({ fileUuid, durationSeconds });
  } catch (err) {
    if (err instanceof InvalidFileTypeError) {
      return NextResponse.json(
        { error: "invalid_type", mime: err.mime },
        { status: 415 },
      );
    }
    if (err instanceof VideoTooLongError) {
      return NextResponse.json(
        { error: "video_too_long", seconds: err.seconds },
        { status: 400 },
      );
    }
    if (err instanceof FileTooLargeError) {
      return NextResponse.json(
        { error: "too_large", bytes: err.bytes },
        { status: 413 },
      );
    }
    console.error(
      "[/api/di/uploads/video] upload_failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
