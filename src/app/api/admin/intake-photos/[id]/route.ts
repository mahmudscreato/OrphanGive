// Session 52c → 52d — Admin intake-photo remove endpoint.
//
// DELETE /api/admin/intake-photos/[id]
// Body: { reason?: string } — surfaces in DI notification when
//                              the removed row was previously
//                              approved (post-approval reversal).
// Requires admin session.
//
// Session 52d lifted the pending-only constraint (Mahmud's
// brief: admin needs ongoing curation power even on approved
// photos — e.g., if identifying info wasn't caught at first
// review). The pending vs approved distinction now lives in the
// audit action name + the notification choice (silent for
// pending mistake-cleanups, notify-DI for approved removes).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import { NotFoundError, removeIntakePhoto } from "@/lib/admin-intake-photos";
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
    const result = await removeIntakePhoto(id, adminSession.userId, reason);

    if (result.wasStatus === "approved" && result.uploaderId) {
      const childLabel = await fetchChildDisplayName(result.childId);
      const reasonText =
        reason && reason.trim().length > 0
          ? `Admin's note: ${reason.trim()}`
          : "No reason provided. Reach out if you have questions.";
      await notify({
        recipientUserId: result.uploaderId,
        type: "admin_removed_approved_intake_photo",
        title: `Intake photo removed from ${childLabel}`,
        body: `An intake photo you uploaded for ${childLabel} was removed by admin. ${reasonText}`,
        relatedCollection: "child_intake_photo",
        relatedId: id,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/admin/intake-photos/[id] DELETE] server_error",
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
