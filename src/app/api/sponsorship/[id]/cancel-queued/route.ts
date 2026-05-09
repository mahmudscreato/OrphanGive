// Pre-activation cancellation for queued sponsorships (Session 14.7
// Phase 2). The donor pre-paid (prepaid PI succeeded today; or
// recurring sub holding their card via SetupIntent) and is sitting in
// the queue, but their slot hasn't activated yet. They can cancel
// here and:
//
//   • Prepaid: full refund of the original PaymentIntent.
//   • Recurring trial_end: cancel the Stripe subscription (no money
//     was taken — the trial defer means the first invoice never
//     fired). No refund needed.
//
// Either way, the row flips status='cancelled' and the queue cascades
// (later positions move up; their queued_starts_at recomputes; shift
// emails fire).
//
// Distinct from /api/sponsorship/[id]/cancel (the standard route) by
// the queue_position > 0 guard — the standard route refuses to
// cancel queued rows because its model assumes Stripe has charged
// already and the donor's commitment is currently supporting the
// child.
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import {
  getActiveMonthlySponsorForChild,
  updateSponsorship,
} from "@/lib/sponsorship-data";
import {
  sendQueueShiftEmail,
  shiftQueueDates,
} from "@/lib/queue";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  // Guard: must actually be queued. Standard /cancel handles
  // currently-supporting rows.
  const position = sponsorship.queue_position ?? 0;
  if (position <= 0) {
    return NextResponse.json(
      {
        error: "not_queued",
        message:
          "This sponsorship isn't queued. Use the standard cancel flow.",
        redirect: `/api/sponsorship/${sponsorship.id}/cancel`,
      },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "active") {
    return NextResponse.json(
      {
        error: `Cannot cancel a queued sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const childIdRef =
    typeof sponsorship.child === "string"
      ? sponsorship.child
      : sponsorship.child?.id ?? null;

  let refundedAmountUsd: number | null = null;
  let refundId: string | null = null;

  // Refund branch: prepaid rows have a PaymentIntent that already
  // captured funds today. Issue a full refund.
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
          source: "cancel_queued",
        },
      });
      refundId = refund.id;
      // Stripe returns amount in minor units (cents).
      if (typeof refund.amount === "number") {
        refundedAmountUsd = refund.amount / 100;
      }
    } catch (err) {
      console.error(
        `[sponsorship/cancel-queued] refund failed for PI ${sponsorship.stripe_payment_intent_id}:`,
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
    // Recurring trial_end: sub is sitting in 'trialing'. Cancel it.
    // No money was taken, no refund is needed. Stripe will fire
    // customer.subscription.deleted; our webhook handler will see the
    // row already marked 'cancelled' below and no-op (the
    // promoteQueue call below already cascades the queue).
    try {
      await stripe.subscriptions.cancel(sponsorship.stripe_subscription_id);
    } catch (err) {
      // If the sub is already canceled (race with webhook), that's
      // fine — proceed to mark our row.
      const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
      const isAlreadyGone =
        typeof err === "object" &&
        err !== null &&
        ((err as { code?: string }).code === "resource_missing" ||
          msg.includes("already canceled"));
      if (!isAlreadyGone) {
        console.error(
          `[sponsorship/cancel-queued] sub cancel failed for ${sponsorship.stripe_subscription_id}:`,
          err,
        );
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }
  } else {
    return NextResponse.json(
      {
        error:
          "Queued sponsorship has no Stripe payment intent or subscription on file. Contact support.",
      },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  try {
    await updateSponsorship(sponsorship.id, {
      status: "cancelled",
      cancelled_at: nowIso,
      ended_at: nowIso,
      cancellation_reason: "queue_cancelled_pre_activation",
      // Clear queue fields so this row no longer participates in the
      // child's queue. Position math below recomputes for the rest.
      queue_position: null,
      queue_status: null,
      queued_starts_at: null,
      queued_ends_at: null,
    });
  } catch (err) {
    console.error("[sponsorship/cancel-queued] directus update failed:", err);
    return NextResponse.json(
      { error: "Internal update failed." },
      { status: 500 },
    );
  }

  // Cascade: shift remaining queued donors up one position. The
  // active sponsor's scheduled_end_date is the anchor. shiftQueueDates
  // walks the full queue and recomputes each row's start/end + raises
  // shift_decision_required where appropriate.
  if (childIdRef) {
    try {
      const active = await getActiveMonthlySponsorForChild(childIdRef);
      if (active && active.scheduledEndDate) {
        const newAnchor = new Date(active.scheduledEndDate);
        if (!Number.isNaN(newAnchor.getTime())) {
          const activeFirstName =
            active.visibility === "named"
              ? active.donorFirstName ?? null
              : null;
          const { shifted } = await shiftQueueDates(childIdRef, newAnchor, {
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
        `[sponsorship/cancel-queued] queue shift fan-out failed (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Refund-confirmation email to the cancelling donor. The
  // SponsorshipCancelledEmail template is generic enough to cover
  // both standard cancel and queue cancel — the body emphasises
  // "your sponsorship of [Child] has ended" which fits a queued row
  // that never started supporting too.
  try {
    const child = childIdRef ? await fetchChildById(childIdRef) : null;
    const firstName =
      donor.first_name?.trim() || donor.email.split("@")[0]!;
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject:
        refundedAmountUsd !== null
          ? `Refund processed for your sponsorship of ${child?.display_name ?? "your sponsored child"}`
          : `Your queued sponsorship of ${child?.display_name ?? "your sponsored child"} has been cancelled`,
      template: SponsorshipCancelledEmail({
        firstName,
        childName: child?.display_name ?? "your sponsored child",
        browseUrl: siteUrl("/children"),
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/cancel-queued] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    success: true,
    refunded_amount_usd: refundedAmountUsd,
    refund_id: refundId,
  });
}

