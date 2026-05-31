// Records a donor's response to the SponsorshipQueueShiftEmail
// (Session 14.7 Phase 2). Three decisions:
//
//   accept    — Acknowledge the new start date; sponsorship continues
//               on its updated schedule. Just records the decision
//               in DB; no Stripe touch needed (the trial_end / queue
//               dates were already updated by shiftQueueDates).
//
//   refund    — Cancel the queued sponsorship and refund (prepaid)
//               or just cancel the trial sub (recurring). Mirrors
//               /api/sponsorship/[id]/cancel-queued behaviour.
//
//   transfer  — Move the donor's support to a different child whose
//               queue has room. Cancels the original Stripe object,
//               re-queues against the new child, retains the donor's
//               existing payment intent if possible. Phase 2-light:
//               we issue a refund and ask the donor to re-checkout
//               for the new child rather than mutating the existing
//               PI/sub in place — the latter is messier (PI can't
//               easily be re-targeted) and the donor's intent is
//               already "I want to give differently".
//
// Auto-accept fallback: if the donor never responds, the daily cron
// (/api/cron/promote-queue) flips shift_decision='accept' after 14
// days. The flag clears so the dashboard doesn't keep nagging.

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import {
  getActiveMonthlySponsorForChild,
  updateSponsorship,
} from "@/lib/sponsorship-data";
import {
  shiftQueueDates,
  sendQueueShiftEmail,
} from "@/lib/queue";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";
// Phase 0 — donor lifecycle audit. See cancel/route.ts header for why.
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";

const VALID_DECISIONS = new Set(["accept", "transfer", "refund"]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  let body: { decision?: unknown; transferToChildId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const decision =
    typeof body.decision === "string" ? body.decision : "";
  if (!VALID_DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: "decision must be one of: accept, transfer, refund." },
      { status: 400 },
    );
  }

  // Guard: the row must be queued and currently flagged for a shift
  // decision. Allow re-submission if the flag is already cleared
  // (idempotent for accept), but reject decisions on rows that were
  // never queued or already terminal.
  const position = sponsorship.queue_position ?? 0;
  if (position <= 0) {
    return NextResponse.json(
      { error: "Sponsorship is not queued." },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "active") {
    return NextResponse.json(
      { error: `Cannot record shift decision in state ${sponsorship.status}.` },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const childIdRef =
    typeof sponsorship.child === "string"
      ? sponsorship.child
      : sponsorship.child?.id ?? null;
  const nowIso = new Date().toISOString();

  // ── ACCEPT ──────────────────────────────────────────────────────
  if (decision === "accept") {
    try {
      await updateSponsorship(sponsorship.id, {
        shift_decision: "accept",
        shift_decision_at: nowIso,
        shift_decision_required: false,
      });
    } catch (err) {
      console.error("[sponsorship/queue-shift] accept update failed:", err);
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }
    await recordAuditEvent({
      actorUserId: donor.id,
      actorRole: "donor",
      action: "donor_resolved_queue_shift",
      collection: "sponsorship",
      recordId: sponsorship.id,
      metadata: {
        donor: donor.id,
        childId: childIdRef,
        decision: "accept",
      },
      request: req,
    });
    return NextResponse.json({ success: true, decision: "accept" });
  }

  // ── REFUND ──────────────────────────────────────────────────────
  if (decision === "refund") {
    let refundedAmountUsd: number | null = null;
    let refundId: string | null = null;

    if (
      sponsorship.payment_schedule === "monthly_prepaid" &&
      sponsorship.stripe_payment_intent_id
    ) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: sponsorship.stripe_payment_intent_id,
          reason: "requested_by_customer",
          metadata: {
            sponsorship_id: sponsorship.id,
            donor_id: donor.id,
            source: "queue_shift_refund",
          },
        });
        refundId = refund.id;
        if (typeof refund.amount === "number") {
          refundedAmountUsd = refund.amount / 100;
        }
      } catch (err) {
        console.error(
          `[sponsorship/queue-shift] refund failed for PI ${sponsorship.stripe_payment_intent_id}:`,
          err,
        );
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Stripe refund failed.",
          },
          { status: 502 },
        );
      }
    } else if (
      sponsorship.payment_schedule === "monthly" &&
      sponsorship.stripe_subscription_id
    ) {
      try {
        await stripe.subscriptions.cancel(sponsorship.stripe_subscription_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
        const isAlreadyGone =
          typeof err === "object" &&
          err !== null &&
          ((err as { code?: string }).code === "resource_missing" ||
            msg.includes("already canceled"));
        if (!isAlreadyGone) {
          console.error(
            `[sponsorship/queue-shift] sub cancel failed:`,
            err,
          );
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }
    }

    try {
      await updateSponsorship(sponsorship.id, {
        status: "cancelled",
        cancelled_at: nowIso,
        ended_at: nowIso,
        cancellation_reason: "shift_refund",
        shift_decision: "refund",
        shift_decision_at: nowIso,
        shift_decision_required: false,
        queue_position: null,
        queue_status: null,
        queued_starts_at: null,
        queued_ends_at: null,
      });
    } catch (err) {
      console.error(
        "[sponsorship/queue-shift] refund directus update failed:",
        err,
      );
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }

    // Cascade other queued donors on this child.
    if (childIdRef) {
      try {
        const active = await getActiveMonthlySponsorForChild(childIdRef);
        if (active && active.scheduledEndDate) {
          const anchor = new Date(active.scheduledEndDate);
          if (!Number.isNaN(anchor.getTime())) {
            const activeFirstName =
              active.visibility === "named"
                ? active.donorFirstName ?? null
                : null;
            const { shifted } = await shiftQueueDates(childIdRef, anchor, {
              stripe,
            });
            for (const s of shifted) {
              await sendQueueShiftEmail(s, {
                activeSponsorFirstName: activeFirstName,
              });
            }
          }
        }
      } catch (err) {
        console.warn(
          "[sponsorship/queue-shift] cascade failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Refund-confirmation email.
    try {
      const child = childIdRef ? await fetchChildById(childIdRef) : null;
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject:
          refundedAmountUsd !== null
            ? `A refund is on its way for your sponsorship of ${child?.display_name ?? "your sponsored child"}`
            : `Your queued sponsorship of ${child?.display_name ?? "your sponsored child"} has been cancelled`,
        template: SponsorshipCancelledEmail({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          browseUrl: siteUrl("/children"),
        }),
      });
    } catch (err) {
      console.warn(
        "[sponsorship/queue-shift] refund email failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }

    await recordAuditEvent({
      actorUserId: donor.id,
      actorRole: "donor",
      action: "donor_resolved_queue_shift",
      collection: "sponsorship",
      recordId: sponsorship.id,
      metadata: {
        donor: donor.id,
        childId: childIdRef,
        decision: "refund",
        refundedAmountUsd,
        refundId,
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      decision: "refund",
      refunded_amount_usd: refundedAmountUsd,
      refund_id: refundId,
    });
  }

  // ── TRANSFER ────────────────────────────────────────────────────
  // Phase 2-light implementation: refund the donor's existing
  // commitment (same as the refund branch above) AND attach a clear
  // "now go pick a new child" follow-up. The donor's payment is
  // returned and they're directed back to /children to choose
  // another child to support. Re-issuing a fresh checkout is cleaner
  // than mutating an existing PI/sub to point at a new child —
  // Stripe's data model doesn't support that change cleanly, and the
  // donor's amount/duration choice may differ for the new child.
  //
  // Future polish (14.7d?): a one-click in-place transfer that
  // re-queues against the picked child while preserving the
  // original payment. Out of scope for Phase 2.
  if (decision === "transfer") {
    if (typeof body.transferToChildId !== "string") {
      return NextResponse.json(
        { error: "transferToChildId is required for transfer decisions." },
        { status: 400 },
      );
    }
    // Validate the target child exists. Full queue-availability check
    // happens at the resulting /sponsor flow's checkout-init time.
    const targetChild = await fetchChildById(body.transferToChildId);
    if (!targetChild) {
      return NextResponse.json(
        { error: "Transfer target child not found." },
        { status: 404 },
      );
    }
    // Refund + cancel the existing row, same as the refund branch.
    let refundedAmountUsd: number | null = null;
    if (
      sponsorship.payment_schedule === "monthly_prepaid" &&
      sponsorship.stripe_payment_intent_id
    ) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: sponsorship.stripe_payment_intent_id,
          reason: "requested_by_customer",
          metadata: {
            sponsorship_id: sponsorship.id,
            donor_id: donor.id,
            source: "queue_shift_transfer",
            transfer_to_child_id: body.transferToChildId,
          },
        });
        if (typeof refund.amount === "number") {
          refundedAmountUsd = refund.amount / 100;
        }
      } catch (err) {
        console.error(
          `[sponsorship/queue-shift] transfer refund failed for PI ${sponsorship.stripe_payment_intent_id}:`,
          err,
        );
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Stripe refund failed.",
          },
          { status: 502 },
        );
      }
    } else if (
      sponsorship.payment_schedule === "monthly" &&
      sponsorship.stripe_subscription_id
    ) {
      try {
        await stripe.subscriptions.cancel(
          sponsorship.stripe_subscription_id,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
        const isAlreadyGone =
          typeof err === "object" &&
          err !== null &&
          ((err as { code?: string }).code === "resource_missing" ||
            msg.includes("already canceled"));
        if (!isAlreadyGone) {
          console.error(
            `[sponsorship/queue-shift] transfer sub cancel failed:`,
            err,
          );
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }
    }
    try {
      await updateSponsorship(sponsorship.id, {
        status: "cancelled",
        cancelled_at: nowIso,
        ended_at: nowIso,
        cancellation_reason: "shift_transfer",
        shift_decision: "transfer",
        shift_decision_at: nowIso,
        shift_decision_required: false,
        queue_position: null,
        queue_status: null,
        queued_starts_at: null,
        queued_ends_at: null,
      });
    } catch (err) {
      console.error(
        "[sponsorship/queue-shift] transfer directus update failed:",
        err,
      );
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }
    // Cascade the original child's queue.
    if (childIdRef) {
      try {
        const active = await getActiveMonthlySponsorForChild(childIdRef);
        if (active && active.scheduledEndDate) {
          const anchor = new Date(active.scheduledEndDate);
          if (!Number.isNaN(anchor.getTime())) {
            const activeFirstName =
              active.visibility === "named"
                ? active.donorFirstName ?? null
                : null;
            const { shifted } = await shiftQueueDates(childIdRef, anchor, {
              stripe,
            });
            for (const s of shifted) {
              await sendQueueShiftEmail(s, {
                activeSponsorFirstName: activeFirstName,
              });
            }
          }
        }
      } catch (err) {
        console.warn(
          "[sponsorship/queue-shift] transfer cascade failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    }

    await recordAuditEvent({
      actorUserId: donor.id,
      actorRole: "donor",
      action: "donor_resolved_queue_shift",
      collection: "sponsorship",
      recordId: sponsorship.id,
      metadata: {
        donor: donor.id,
        childId: childIdRef,
        decision: "transfer",
        transferToChildId: body.transferToChildId,
        refundedAmountUsd,
      },
      request: req,
    });

    // Hand the donor a sponsor-flow URL targeting the new child.
    // The dashboard redirects them after the API call returns.
    return NextResponse.json({
      success: true,
      decision: "transfer",
      refunded_amount_usd: refundedAmountUsd,
      transferTo: {
        childId: body.transferToChildId,
        sponsorUrl: `/sponsor/${body.transferToChildId}?mode=monthly`,
      },
    });
  }

  // Unreachable — VALID_DECISIONS guard at the top covers all cases.
  return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
}
