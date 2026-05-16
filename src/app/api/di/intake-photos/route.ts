// Session 48b — DI intake-photos collection endpoint.
//
// GET  /api/di/intake-photos?childId=X     — list child's intake photos
// POST /api/di/intake-photos               — create new intake-photo row
//                                           Body: { childId, photoUuid,
//                                                   caption?, displayOrder?,
//                                                   proposalId? }
//
// Out-of-scope childId returns 404 (collapsed with not-found).
// Photo file upload happens via the existing /api/di/uploads/photo
// pipeline; this endpoint only registers the directus_files UUID
// against the new child_intake_photo row.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createIntakePhoto,
  InvalidInputError,
  listIntakePhotosForChild,
  OutOfScopeError,
} from "@/lib/di-intake-photos";
import { recordAuditEvent } from "@/lib/di-audit";

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
    const photos = await listIntakePhotosForChild(session.userId, childId);
    return NextResponse.json({ photos });
  } catch (err) {
    console.error(
      "[/api/di/intake-photos GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

const createBodySchema = z
  .object({
    childId: z.string().uuid(),
    photoUuid: z.string().min(8),
    caption: z.string().max(200).nullable().optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
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
    const { photoId } = await createIntakePhoto(
      { userId: session.userId, accessToken: session.accessToken },
      parsed.data,
    );
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_uploaded_intake_photo",
      collection: "child_intake_photo",
      recordId: photoId,
      metadata: {
        childId: parsed.data.childId,
        photoUuid: parsed.data.photoUuid,
        ...(parsed.data.proposalId ? { proposalId: parsed.data.proposalId } : {}),
        ...(typeof parsed.data.displayOrder === "number"
          ? { displayOrder: parsed.data.displayOrder }
          : {}),
      },
      request: req,
    });
    return NextResponse.json({ photoId });
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
      "[/api/di/intake-photos POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
