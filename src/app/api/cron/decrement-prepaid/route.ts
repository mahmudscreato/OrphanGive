// Daily cron — prepaid sponsorship month decrement (Session 15b1).
//
// Triggered by the Hostinger VPS crontab at 04:00 UTC. Walks
// every active prepaid sponsorship and reconciles
// prepaid_months_remaining against elapsed time since started_at.
// When a row's remaining months reach 0, transitions to:
//   • status='cancelled' if cancellation_scheduled_at was set
//     (donor cancelled mid-prepaid; coverage ran out today)
//   • status='completed' otherwise (full prepaid term fulfilled)
//
// Math (30.44-day month convention, matching the rest of the
// codebase): completed_months = floor((now - started_at) /
// 30.44 days). expected_remaining = max(0, total - completed).
// If actual differs, update.
//
// Idempotent: a re-run with all rows already reconciled does
// nothing.
//
// Auth: Bearer token must equal process.env.CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { readItems, updateItem } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
// P2 — revoke active reveals when the cron flips a prepaid-cancelled
// row to status='cancelled' at the end of its paid coverage.
import { revokeRevealsForSponsorshipEnd } from "@/lib/reveal-data";

export const runtime = "nodejs";

const DAYS_PER_MONTH = 30.44;
const MS_PER_MONTH = DAYS_PER_MONTH * 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  status: string;
  payment_schedule: string | null;
  started_at: string | null;
  prepaid_months_total: number | null;
  prepaid_months_remaining: number | null;
  scheduled_end_date: string | null;
  cancellation_scheduled_at: string | null;
  // P2 — needed for revoke-on-cancel. Both are FKs at the column
  // level; Directus returns the string id when not expanded.
  donor: string | null;
  child: string | null;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      "[cron/decrement-prepaid] CRON_SECRET not configured — refusing to run",
    );
    return NextResponse.json(
      { error: "cron secret not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "");
  if (presented !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ds = directusServer();
  const stats = {
    scanned: 0,
    decremented: 0,
    completed: 0,
    cancelled: 0,
    errors: 0,
  };

  try {
    const rows = (await ds.request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            { payment_schedule: { _eq: "monthly_prepaid" } },
            { prepaid_months_total: { _gt: 0 } },
          ],
        },
        fields: [
          "id",
          "status",
          "payment_schedule",
          "started_at",
          "prepaid_months_total",
          "prepaid_months_remaining",
          "scheduled_end_date",
          "cancellation_scheduled_at",
          // P2 — needed for revokeRevealsForSponsorshipEnd.
          "donor",
          "child",
        ],
        limit: -1,
      } as never),
    )) as unknown as Row[];

    stats.scanned = rows?.length ?? 0;
    const nowIso = new Date().toISOString();

    for (const r of rows ?? []) {
      // Defensive: missing started_at means we never recorded the
      // activation timestamp (shouldn't happen post-Session 14.5b
      // welcome rollout). Skip — can't compute elapsed.
      if (!r.started_at) continue;

      const startedMs = new Date(r.started_at).getTime();
      if (!Number.isFinite(startedMs)) continue;

      const elapsedMs = Date.now() - startedMs;
      const completedMonths = Math.floor(elapsedMs / MS_PER_MONTH);
      const total = r.prepaid_months_total ?? 0;
      const expectedRemaining = Math.max(0, total - completedMonths);
      const currentRemaining = r.prepaid_months_remaining ?? total;

      if (expectedRemaining === currentRemaining) continue;

      // Transition rules when expected reaches 0:
      //   - cancellation_scheduled_at set → status='cancelled'
      //     (donor opted out mid-prepaid; coverage ran out)
      //   - otherwise → status='completed' (full term fulfilled)
      const patch: Record<string, unknown> = {
        prepaid_months_remaining: expectedRemaining,
      };
      if (expectedRemaining === 0) {
        if (r.cancellation_scheduled_at) {
          patch.status = "cancelled";
          patch.cancelled_at = nowIso;
          patch.ended_at = nowIso;
          patch.cancellation_reason = "prepaid_term_ended_with_cancel";
          stats.cancelled++;
        } else {
          patch.status = "completed";
          patch.ended_at = nowIso;
          stats.completed++;
        }
      } else {
        stats.decremented++;
      }

      try {
        await ds.request(
          updateItem("sponsorship" as never, r.id as never, patch as never),
        );
      } catch (err) {
        stats.errors++;
        console.warn(
          `[cron/decrement-prepaid] update ${r.id} failed:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      console.log(
        `[cron/decrement-prepaid] sponsorship=${r.id} remaining ${currentRemaining} → ${expectedRemaining} (status: ${(patch.status as string) ?? r.status})`,
      );

      // P2 — revoke active reveals when this row truly ended
      // (cancelled OR completed). No-op if the donor still has
      // another active/paused sponsorship of the child.
      if (
        (patch.status === "cancelled" || patch.status === "completed") &&
        r.donor &&
        r.child
      ) {
        try {
          await revokeRevealsForSponsorshipEnd({
            sponsorshipId: r.id,
            donorId: r.donor,
            childId: r.child,
            reason:
              patch.status === "cancelled"
                ? "cron_prepaid_term_ended_with_cancel"
                : "cron_prepaid_term_completed",
          });
        } catch (err) {
          console.warn(
            `[cron/decrement-prepaid] reveal revoke for ${r.id} failed (non-fatal):`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  } catch (err) {
    stats.errors++;
    console.warn(
      "[cron/decrement-prepaid] read failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    "[cron/decrement-prepaid] done",
    JSON.stringify({ ...stats, duration_ms }),
  );
  return NextResponse.json({ ...stats, duration_ms });
}
