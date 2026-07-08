// Session 52b — Admin document approval endpoint.
//
// POST /api/admin/documents/[id]/approve
// Requires admin session.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  approveDocument,
  InvalidStatusError,
  NotFoundError,
} from "@/lib/admin-documents";
import { DOCUMENT_TYPE_LABELS } from "@/lib/form-constants";
import { notify, resolveDiRecipient } from "@/lib/di-notifications";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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
  try {
    const result = await approveDocument(id, adminSession.userId);
    // Notify the uploading DI; fall back to the child's assigned DI when
    // uploaded_by is null (legacy rows). Skip only if BOTH are null.
    // Best-effort — failures swallowed inside notify().
    const recipient = await resolveDiRecipient(
      result.uploaderId,
      result.childId,
    );
    if (recipient) {
      const childLabel = await fetchChildDisplayName(result.childId);
      await notify({
        recipientUserId: recipient,
        type: "admin_approved_document",
        title: `Document approved for ${childLabel}`,
        body: `Your document is verified. It now counts toward ${childLabel}'s verification badge on the public profile.`,
        relatedCollection: "child_document",
        relatedId: id,
      });
    } else {
      console.warn(
        "[/api/admin/documents/approve] no notify recipient — uploaded_by AND assigned_di both null",
        { documentId: id, childId: result.childId },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidStatusError) {
      return NextResponse.json(
        { error: "invalid_status", message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/documents/approve] server_error",
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

// Re-exported for symmetry with the moments/intake-photo routes; lets
// future audit-style monitoring grep by file.
export const _docTypeLabels = DOCUMENT_TYPE_LABELS;
