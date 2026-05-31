// Daily cron — sponsor queue safety net (Session 14.7 Phase 2).
//
// Triggered by the Hostinger VPS crontab (see docs/cron-setup.md):
//
//   0 2 * * * curl -X POST -H "Authorization: Bearer ${CRON_SECRET}" \
//     https://orphangive.org/api/cron/promote-queue
//
// Three responsibilities, each idempotent:
//
//   1. PROMOTE missed promotions
//      Find queued rows whose queued_starts_at has already passed
//      AND whose child has no current active sponsor — promoteQueue
//      them. Catches webhook drops where customer.subscription.deleted
//      didn't reach the box, or the row update raced.
//
//   2. AUTO-ACCEPT shift decisions older than 14 days
//      Donor was emailed about a queue shift but never responded.
//      Default behaviour: accept the new date silently. Clears the
//      shift_decision_required flag so the dashboard stops nagging.
//
//   3. CLEANUP zombie queued rows whose Stripe sub vanished
//      For queued rows with stripe_subscription_id set, retrieve the
//      sub. If Stripe shows it as canceled / incomplete_expired but
//      our row is still 'active', flip the row to 'cancelled' and
//      cascade the queue.
//
// Auth: Bearer token must equal process.env.CRON_SECRET. Returns 401
// otherwise. The token lives only in env; never in code.

import { NextResponse, type NextRequest } from "next/server";
import { readItems } from "@directus/sdk";
import { getStripe } from "@/lib/stripe-client";
import { directusServer } from "@/lib/directus";
import {
  getActiveMonthlySponsorForChild,
  updateSponsorship,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import {
  promoteQueue,
  shiftQueueDates,
  sendQueueShiftEmail,
} from "@/lib/queue";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, fetchDonorById, formatTo } from "@/lib/email-data";
import { SponsorshipQueueShiftEmail } from "@/emails/SponsorshipQueueShiftEmail";

export const runtime = "nodejs";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const QUEUE_FIELDS = [
  "id",
  "donor",
  "child.id",
  "child.display_name",
  "status",
  "payment_mode",
  "payment_schedule",
  "queue_position",
  "queue_status",
  "queued_starts_at",
  "queued_ends_at",
  "stripe_subscription_id",
  "stripe_payment_intent_id",
  "stripe_customer_id",
  "amount_usd",
  "duration_months",
  "scheduled_end_date",
  "shift_decision_required",
  "shift_decision_required_at",
  "shift_decision",
  "shift_decision_at",
] as const;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      "[cron/promote-queue] CRON_SECRET not configured — refusing to run",
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

  const stripe = getStripe();
  const ds = directusServer();
  const stats = {
    promoted: 0,
    auto_accepted: 0,
    cleaned: 0,
    errors: 0,
  };

  // ── 1. Promote missed promotions ────────────────────────────────────
  // Find queued rows whose queued_starts_at <= now. Group by child;
  // call promoteQueue once per affected child. promoteQueue itself
  // is idempotent and no-ops when the active row hasn't ended.
  const nowIso = new Date().toISOString();
  try {
    const ready = (await ds.request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
            { queue_position: { _gt: 0 } },
            { queued_starts_at: { _lte: nowIso } },
          ],
        },
        fields: ["id", "child.id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string; child: { id: string } | string }>;

    const childIds = new Set<string>();
    for (const r of ready) {
      const cid = typeof r.child === "string" ? r.child : r.child?.id;
      if (cid) childIds.add(cid);
    }
    for (const cid of childIds) {
      try {
        const result = await promoteQueue(cid, { stripe });
        if (result.promoted) stats.promoted++;
      } catch (err) {
        stats.errors++;
        console.warn(
          `[cron/promote-queue] promoteQueue ${cid} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.error(
      "[cron/promote-queue] step 1 (promote) query failed:",
      err instanceof Error ? err.message : err,
    );
    stats.errors++;
  }

  // ── 2. Auto-accept stale shift decisions ────────────────────────────
  // shift_decision_required=true AND shift_decision_required_at older
  // than 14 days. Set decision='accept', clear the flag.
  const cutoffIso = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();
  try {
    const stale = (await ds.request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            { queue_position: { _gt: 0 } },
            { shift_decision_required: { _eq: true } },
            { shift_decision_required_at: { _lt: cutoffIso } },
          ],
        },
        fields: [...QUEUE_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];

    for (const s of stale ?? []) {
      try {
        await updateSponsorship(s.id, {
          shift_decision: "accept",
          shift_decision_at: new Date().toISOString(),
          shift_decision_required: false,
        });
        stats.auto_accepted++;
        console.log(
          `[cron/promote-queue] auto-accepted shift decision for sponsorship=${s.id}`,
        );
      } catch (err) {
        stats.errors++;
        console.warn(
          `[cron/promote-queue] auto-accept ${s.id} failed:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      // Notice email — confirms the silent acceptance (autoAccepted
      // variant of SponsorshipQueueShiftEmail removes the action
      // buttons since the decision is already locked in). Best-effort:
      // a mail-server hiccup shouldn't undo the row update.
      try {
        const donorId = typeof s.donor === "string" ? s.donor : "";
        const childIdRef =
          typeof s.child === "string" ? s.child : s.child?.id ?? null;
        if (!donorId || !childIdRef) continue;
        const donor = await fetchDonorById(donorId);
        const child = await fetchChildById(childIdRef);
        if (!donor || !donor.email) continue;
        const firstName =
          donor.first_name?.trim() || donor.email.split("@")[0]!;
        const childName = child?.display_name ?? "your sponsored child";
        await sendEmail({
          to: formatTo(donor.email, firstName),
          subject: `Your sponsorship of ${childName} is set to begin on the new date`,
          template: SponsorshipQueueShiftEmail({
            firstName,
            childName,
            activeSponsorFirstName: null,
            oldStartDate: null,
            newStartDate: s.queued_starts_at ?? null,
            decisionUrl: siteUrl(
              `/dashboard/sponsorship/${s.id}/queue-shift-decision`,
            ),
            autoAccepted: true,
          }),
        });
        console.log(
          `[cron/promote-queue] auto-accept notice email sent for sponsorship=${s.id}`,
        );
      } catch (err) {
        console.warn(
          `[cron/promote-queue] auto-accept notice email for ${s.id} failed (non-fatal):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.error(
      "[cron/promote-queue] step 2 (auto-accept) query failed:",
      err instanceof Error ? err.message : err,
    );
    stats.errors++;
  }

  // ── 3. Cleanup queued rows whose Stripe sub is gone ─────────────────
  // For queued rows with stripe_subscription_id, retrieve the sub. If
  // it's canceled/incomplete_expired, our row should match — flip to
  // 'cancelled' and cascade the queue.
  try {
    const queued = (await ds.request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
            { queue_position: { _gt: 0 } },
            { stripe_subscription_id: { _nnull: true } },
          ],
        },
        fields: [...QUEUE_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];

    const childIdsToShift = new Set<string>();
    for (const s of queued ?? []) {
      if (!s.stripe_subscription_id) continue;
      try {
        const sub = await stripe.subscriptions.retrieve(
          s.stripe_subscription_id,
        );
        if (
          sub.status === "canceled" ||
          sub.status === "incomplete_expired"
        ) {
          await updateSponsorship(s.id, {
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
            cancellation_reason: "stripe_cleanup",
            queue_position: null,
            queue_status: null,
            queued_starts_at: null,
            queued_ends_at: null,
          });
          stats.cleaned++;
          const cid = typeof s.child === "string" ? s.child : s.child?.id;
          if (cid) childIdsToShift.add(cid);
          console.log(
            `[cron/promote-queue] cleaned zombie queued sponsorship=${s.id} (Stripe sub ${sub.status})`,
          );
        }
      } catch (err) {
        // Sub vanished from Stripe entirely — same treatment.
        const isMissing =
          typeof err === "object" &&
          err !== null &&
          (err as { code?: string }).code === "resource_missing";
        if (isMissing) {
          try {
            await updateSponsorship(s.id, {
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              ended_at: new Date().toISOString(),
              cancellation_reason: "stripe_cleanup_missing",
              queue_position: null,
              queue_status: null,
              queued_starts_at: null,
              queued_ends_at: null,
            });
            stats.cleaned++;
            const cid = typeof s.child === "string" ? s.child : s.child?.id;
            if (cid) childIdsToShift.add(cid);
          } catch (e2) {
            stats.errors++;
            console.warn(
              `[cron/promote-queue] cleanup-missing ${s.id} update failed:`,
              e2 instanceof Error ? e2.message : e2,
            );
          }
        } else {
          stats.errors++;
          console.warn(
            `[cron/promote-queue] cleanup retrieve ${s.stripe_subscription_id} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    // After cleanup, cascade the queue on each affected child.
    for (const cid of childIdsToShift) {
      try {
        const active = await getActiveMonthlySponsorForChild(cid);
        if (active && active.scheduledEndDate) {
          const anchor = new Date(active.scheduledEndDate);
          if (!Number.isNaN(anchor.getTime())) {
            const activeFirstName =
              active.visibility === "named"
                ? active.donorFirstName ?? null
                : null;
            const { shifted } = await shiftQueueDates(cid, anchor, {
              stripe,
            });
            for (const sh of shifted) {
              await sendQueueShiftEmail(sh, {
                activeSponsorFirstName: activeFirstName,
              });
            }
          }
        }
      } catch (err) {
        console.warn(
          `[cron/promote-queue] cleanup cascade ${cid} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.error(
      "[cron/promote-queue] step 3 (cleanup) query failed:",
      err instanceof Error ? err.message : err,
    );
    stats.errors++;
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    `[cron/promote-queue] done`,
    JSON.stringify({ ...stats, duration_ms }),
  );
  return NextResponse.json({ ...stats, duration_ms });
}
