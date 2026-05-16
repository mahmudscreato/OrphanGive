// Session 48b — Bulk reorder for intake photos. The drag-reorder UI
// posts the entire desired ordering at once after a drop, rather
// than firing one PATCH per row. Cuts request volume from N to 1
// for typical 3-5 photo sets.
//
// Body: { ordered: [{ id: uuid, displayOrder: int }, ...] }
//
// Each row is independently scope-checked + status-checked inside
// reorderIntakePhotos; mismatched rows are silently skipped (no
// partial-error; the response just reports how many actually moved).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import { reorderIntakePhotos } from "@/lib/di-intake-photos";
import { recordAuditEvent } from "@/lib/di-audit";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    ordered: z
      .array(
        z.object({
          id: z.string().uuid(),
          displayOrder: z.number().int().min(0).max(999),
        }),
      )
      .min(1)
      .max(50),
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
    const { updated } = await reorderIntakePhotos(
      session.userId,
      parsed.data.ordered,
    );
    if (updated > 0) {
      // One audit row covering the bulk reorder. Record-level audit
      // would explode the log on every drag — we collapse into a
      // single edit event with the count in metadata.
      await recordAuditEvent({
        actorUserId: session.userId,
        action: "di_edited_intake_photo",
        collection: "child_intake_photo",
        recordId: parsed.data.ordered[0].id,
        metadata: {
          op: "reorder",
          count: updated,
          ids: parsed.data.ordered.map((o) => o.id),
        },
        request: req,
      });
    }
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error(
      "[/api/di/intake-photos/reorder POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
