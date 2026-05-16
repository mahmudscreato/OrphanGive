// Session 52c → 52d — Admin document remove endpoint.
//
// DELETE /api/admin/documents/[id]
// Body: { reason?: string }  — recommended when removing an
//                               already-approved row (passes
//                               verbatim to the DI notification);
//                               optional for pending cleanup.
// Requires admin session.
//
// Session 52d lifted the pending-only constraint (the brief
// explicitly requires admin to be able to remove approved
// content as ongoing curation). When the removed row was
// previously approved, the DI who uploaded it gets a notification
// with admin's reason — the DI deserves to know a previously-
// delivered piece of work has been retracted.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import { NotFoundError, removeDocument } from "@/lib/admin-documents";
import { notify } from "@/lib/di-notifications";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().max(1000).optional(),
  })
  .strict()
  .or(z.undefined());

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Body is optional. Accept JSON if present; treat missing /
  // malformed as no reason. The lib decides the actual contract.
  let json: unknown = undefined;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    try {
      json = await req.json();
    } catch {
      json = undefined;
    }
  }
  const parsed = bodySchema.safeParse(json);
  const reason = parsed.success ? parsed.data?.reason : undefined;

  try {
    const result = await removeDocument(id, adminSession.userId, reason);

    // Session 52d — DI notification only for post-approval removes.
    // Removing a pending row is silent cleanup (52c contract:
    // "admin hits these when a DI uploaded by mistake — no
    // decision to convey"). Removing an approved row IS news the
    // DI should know about.
    if (result.wasStatus === "approved" && result.uploaderId) {
      const childLabel = await fetchChildDisplayName(result.childId);
      const reasonText =
        reason && reason.trim().length > 0
          ? `Admin's note: ${reason.trim()}`
          : "No reason provided. Reach out if you have questions.";
      await notify({
        recipientUserId: result.uploaderId,
        type: "admin_removed_approved_document",
        title: `Document removed from ${childLabel}`,
        body: `A document you uploaded for ${childLabel} was removed by admin. ${reasonText}`,
        relatedCollection: "child_document",
        relatedId: id,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/admin/documents/[id] DELETE] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

async function fetchChildDisplayName(childId: string | null): Promise<string> {
  if (!childId) return "the child";
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["display_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ display_name: string | null }> | undefined;
    return rows?.[0]?.display_name?.trim() || "this child";
  } catch {
    return "this child";
  }
}
