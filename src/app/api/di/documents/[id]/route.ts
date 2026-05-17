// Session 49 — DI document single-row endpoint.
//
// PATCH  /api/di/documents/[id]   — update notes only
// DELETE /api/di/documents/[id]   — remove (pending only)
//
// Both routes 404-collapse "not exists" with "not owned" with
// "not pending" — the API never reveals which document IDs the DI
// is or isn't allowed to mutate.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  deleteDocument,
  InvalidInputError,
  OutOfScopeError,
  updateDocument,
} from "@/lib/di-documents";
import { recordAuditEvent } from "@/lib/di-audit";

export const dynamic = "force-dynamic";

const patchBodySchema = z
  .object({
    notes: z.string().max(1000).nullable(),
  })
  .strict();

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
    await updateDocument(session.userId, id, { notes: parsed.data.notes });
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_updated_document_notes",
      collection: "child_document",
      recordId: id,
      // Field-level metadata only (no values). Notes may contain
      // Tier 3 admin-only context.
      metadata: { fields: ["notes"] },
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
      "[/api/di/documents/[id] PATCH] server_error",
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
    const { childId, documentType } = await deleteDocument(session.userId, id);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_deleted_document",
      collection: "child_document",
      recordId: id,
      metadata: {
        childId,
        ...(documentType ? { documentType } : {}),
      },
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/di/documents/[id] DELETE] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
