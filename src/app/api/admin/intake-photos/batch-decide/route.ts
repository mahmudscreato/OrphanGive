// Session 52b — Batch decide endpoint for intake-photo review.
//
// POST /api/admin/intake-photos/batch-decide
// Body: {
//   decisions: Array<
//     | { photoId: string; decision: "approve" }
//     | { photoId: string; decision: "reject"; reason: string }
//   >
// }
//
// Each decision is processed sequentially through the same
// approve/reject helpers used by the single endpoints. Per-photo
// notifications + audit events fire as usual. The batch endpoint
// returns an array of per-photo results so the admin UI can show
// which (if any) failed without rolling back the rest.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  approveIntakePhoto,
  InvalidStatusError,
  NotFoundError,
  rejectIntakePhoto,
} from "@/lib/admin-intake-photos";
import { notify, resolveDiRecipient } from "@/lib/di-notifications";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({
    photoId: z.string().uuid(),
    decision: z.literal("approve"),
  }),
  z.object({
    photoId: z.string().uuid(),
    decision: z.literal("reject"),
    reason: z.string().min(10).max(1000),
  }),
]);

const bodySchema = z
  .object({
    decisions: z.array(decisionSchema).min(1).max(50),
  })
  .strict();

interface PerPhotoResult {
  photoId: string;
  ok: boolean;
  error?: string;
  message?: string;
}

export async function POST(req: NextRequest) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const results: PerPhotoResult[] = [];
  // Sequential so audit timestamps stay ordered and Directus isn't
  // hammered with a burst.
  for (const d of parsed.data.decisions) {
    try {
      if (d.decision === "approve") {
        const r = await approveIntakePhoto(d.photoId, adminSession.userId);
        const recipient = await resolveDiRecipient(r.uploaderId, r.childId);
        if (recipient) {
          const childLabel = await fetchChildDisplayName(r.childId);
          await notify({
            recipientUserId: recipient,
            type: "admin_approved_intake_photo",
            title: `Intake photo approved for ${childLabel}`,
            body: `Your intake photo is verified and visible to sponsors of ${childLabel}.`,
            relatedCollection: "child_intake_photo",
            relatedId: d.photoId,
          });
        } else {
          console.warn(
            "[/api/admin/intake-photos/batch-decide approve] no notify recipient — uploaded_by AND assigned_di both null",
            { photoId: d.photoId, childId: r.childId },
          );
        }
        results.push({ photoId: d.photoId, ok: true });
      } else {
        const r = await rejectIntakePhoto(
          d.photoId,
          adminSession.userId,
          d.reason,
        );
        const recipient = await resolveDiRecipient(r.uploaderId, r.childId);
        if (recipient) {
          const childLabel = await fetchChildDisplayName(r.childId);
          await notify({
            recipientUserId: recipient,
            type: "admin_rejected_intake_photo",
            title: `Intake photo rejected for ${childLabel}`,
            body: `Admin's note: ${r.reason}`,
            relatedCollection: "child_intake_photo",
            relatedId: d.photoId,
          });
        } else {
          console.warn(
            "[/api/admin/intake-photos/batch-decide reject] no notify recipient — uploaded_by AND assigned_di both null",
            { photoId: d.photoId, childId: r.childId },
          );
        }
        results.push({ photoId: d.photoId, ok: true });
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
        results.push({ photoId: d.photoId, ok: false, error: "not_found" });
      } else if (err instanceof InvalidStatusError) {
        results.push({
          photoId: d.photoId,
          ok: false,
          error: "invalid_status",
          message: err.message,
        });
      } else {
        console.error(
          "[/api/admin/intake-photos/batch-decide] per-photo failure",
          { photoId: d.photoId, err: err instanceof Error ? err.message : err },
        );
        results.push({ photoId: d.photoId, ok: false, error: "server_error" });
      }
    }
  }

  const successes = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    processed: results.length,
    succeeded: successes,
    failed: results.length - successes,
    results,
  });
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
