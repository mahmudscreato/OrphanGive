// Session 48b — DI intake-photo single-row endpoint.
//
// PATCH  /api/di/intake-photos/[id]   — update caption / display_order
// DELETE /api/di/intake-photos/[id]   — remove (pending only)
//
// Both routes 404-collapse "not exists" with "not owned" with
// "not pending" — the API never reveals which intake-photo IDs
// the DI is or isn't allowed to mutate.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  deleteIntakePhoto,
  InvalidInputError,
  OutOfScopeError,
  updateIntakePhoto,
} from "@/lib/di-intake-photos";
import { recordAuditEvent } from "@/lib/di-audit";

export const dynamic = "force-dynamic";

const patchBodySchema = z
  .object({
    caption: z.string().max(200).nullable().optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .refine(
    (v) => v.caption !== undefined || v.displayOrder !== undefined,
    { message: "must provide caption or displayOrder" },
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = patchBodySchema.safeParse(json);
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
    await updateIntakePhoto(session.userId, id, parsed.data);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_edited_intake_photo",
      collection: "child_intake_photo",
      recordId: id,
      metadata: {
        // Field-level metadata (not values) — caption/display_order
        // changes aren't sensitive but staying consistent with
        // Tier 3 redaction posture.
        fields: Object.keys(parsed.data),
      },
      request: req,
    });
    return NextResponse.json({ ok: true });
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
      "[/api/di/intake-photos/[id] PATCH] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const { childId } = await deleteIntakePhoto(session.userId, id);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_deleted_intake_photo",
      collection: "child_intake_photo",
      recordId: id,
      metadata: { childId },
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/di/intake-photos/[id] DELETE] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
