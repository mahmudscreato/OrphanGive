// Session 52b — Admin document rejection endpoint.
//
// POST /api/admin/documents/[id]/reject
// Body: { reason: string }   (min 10 chars per the form-side guard)
// Requires admin session.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidStatusError,
  NotFoundError,
  rejectDocument,
} from "@/lib/admin-documents";
import { notify } from "@/lib/di-notifications";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().min(10).max(1000),
  })
  .strict();

export async function POST(
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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
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
    const result = await rejectDocument(
      id,
      adminSession.userId,
      parsed.data.reason,
    );
    // Notify the uploader; fall back to the child's assigned DI when
    // uploaded_by is null (legacy rows, or any future null) so the reject
    // never silently fails to reach a DI. Only skip if BOTH are null.
    const child = await fetchChildForNotify(result.childId);
    const recipient = result.uploaderId ?? child.assignedDi;
    if (recipient) {
      await notify({
        recipientUserId: recipient,
        type: "admin_rejected_document",
        title: `Document rejected for ${child.displayName}`,
        body: `Admin's note: ${result.reason}`,
        relatedCollection: "child_document",
        relatedId: id,
      });
    } else {
      console.warn(
        "[/api/admin/documents/reject] no notify recipient — uploaded_by AND assigned_di both null",
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
      "[/api/admin/documents/reject] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

async function fetchChildForNotify(
  childId: string | null,
): Promise<{ displayName: string; assignedDi: string | null }> {
  if (!childId) return { displayName: "the child", assignedDi: null };
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["display_name", "assigned_di"],
        limit: 1,
      } as never),
    )) as unknown as
      | Array<{ display_name: string | null; assigned_di: string | null }>
      | undefined;
    const row = rows?.[0];
    return {
      displayName: row?.display_name?.trim() || "this child",
      assignedDi: (row?.assigned_di as string | null) ?? null,
    };
  } catch {
    return { displayName: "this child", assignedDi: null };
  }
}
