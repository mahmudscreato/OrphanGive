import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { readItems, updateItem } from "@directus/sdk";
import {
  getStripe,
  getStripeWebhookSecret,
} from "@/lib/stripe-client";
import {
  createPaymentIfMissing,
  findSponsorshipsByStripeRef,
  isStripeEventProcessed,
  markStripeEventProcessed,
  updateSponsorship,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import { directusServer } from "@/lib/directus";
import { clearCartByDonor } from "@/lib/cart-data";
import { promoteQueue } from "@/lib/queue";
import {
  fireMonthlyReceiptEmail,
  fireRefundEmail,
  fireWelcomeEmail,
} from "@/lib/email-triggers";

// Webhooks need the RAW request body to verify signatures. Force the
// Node.js runtime so request.text() returns the unparsed payload.
export const runtime = "nodejs";

// ─── Event handlers ─────────────────────────────────────────────────────────
// Normalized "invoice was paid" payload. Fed from any of:
//   - invoice.payment_succeeded (event.data.object is a full Invoice)
//   - invoice.paid              (also a full Invoice)
//   - invoice_payment.paid      (newer wrapper — needs a separate fetch
//                                to get the invoice + subscription)
type PaidInvoiceCtx = {
  invoiceId: string | null;
  subId: string | null;
  piId: string | null;
  chargeId: string | null;
  amountPaidCents: number;
  paidAtIso: string;
  source: string;
};

async function activateFromPaidInvoice(ctx: PaidInvoiceCtx) {
  if (!ctx.subId) return;

  const sponsorships = await findSponsorshipsByStripeRef({
    subscriptionId: ctx.subId,
  });
  if (sponsorships.length === 0) {
    console.warn(`[stripe-webhook] no sponsorship found for sub ${ctx.subId}`);
    return;
  }
  const sponsorship = sponsorships[0]!;
  const amountUsd = ctx.amountPaidCents / 100;

  // Best-effort method type lookup off the PI's latest charge.
  let methodType: string | null = null;
  try {
    if (ctx.piId) {
      const pi = await getStripe().paymentIntents.retrieve(ctx.piId, {
        expand: ["latest_charge"],
      });
      const charge =
        typeof pi.latest_charge === "string"
          ? null
          : (pi.latest_charge as Stripe.Charge | null);
      methodType = charge?.payment_method_details?.type ?? null;
    }
  } catch {
    /* non-fatal */
  }

  let created = false;
  let paymentId: string | null = null;
  try {
    const result = await createPaymentIfMissing({
      sponsorshipId: sponsorship.id,
      amount_usd: amountUsd,
      status: "succeeded",
      stripe_payment_intent_id: ctx.piId,
      stripe_charge_id: ctx.chargeId,
      stripe_invoice_id: ctx.invoiceId,
      payment_method_type: methodType,
      paid_at: ctx.paidAtIso,
    });
    created = result.created;
    paymentId = result.id;
  } catch (err) {
    console.error(
      `[webhook] createPaymentIfMissing(sponsorship=${sponsorship.id}) THREW:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  // Activate the sponsorship + bump accumulators only if this is a
  // freshly recorded payment (idempotency: don't double-bump on replay).
  // `wasFirstActivation` tracks whether this event flipped the row
  // into its supporting state — drives the inline welcome-email
  // trigger below (Session 14.5b).
  const wasFirstActivation = !sponsorship.started_at;
  const patch: Partial<Sponsorship> = { status: "active" };
  if (wasFirstActivation) {
    patch.started_at = new Date().toISOString();
  }
  patch.next_billing_date = new Date(Date.now() + 30 * 86_400_000).toISOString();
  if (created) {
    patch.payment_count = (sponsorship.payment_count ?? 0) + 1;
    patch.total_paid_usd = Number(sponsorship.total_paid_usd ?? 0) + amountUsd;
  }
  await updateSponsorship(sponsorship.id, patch);

  await clearCartByDonor(sponsorship.donor).catch(() => {});

  // ── Inline email triggers (Session 14.5b) ─────────────────────────
  // Welcome: fires once on the FIRST activation of this row. The
  // `!sponsorship.started_at` guard skips:
  //   - subsequent recurring invoices (started_at already set)
  //   - queue promotions (promoteQueue sets started_at + sends its own
  //     SponsorshipActivatedEmail before Stripe's invoice.paid arrives)
  // The internal route's own donor-level dedup (6h window) is the
  // second line of defence against duplicate sends.
  if (wasFirstActivation) {
    await fireWelcomeEmail([sponsorship.id]);
  }
  // Monthly receipt: fires per FRESHLY recorded payment row. On
  // replay (Stripe re-sends the same invoice event), createPayment
  // returns created=false and we skip — the original delivery
  // already sent the receipt.
  if (created && paymentId) {
    await fireMonthlyReceiptEmail(paymentId);
  }
}

// Pulls the normalized context out of an Invoice object (legacy event names).
function ctxFromInvoice(invoice: Stripe.Invoice, source: string): PaidInvoiceCtx {
  const subId = extractSubIdFromInvoice(invoice);

  const piRef = (
    invoice as unknown as {
      payment_intent?: string | { id?: string } | null;
    }
  ).payment_intent;
  const piId =
    typeof piRef === "string" ? piRef : piRef?.id ?? null;

  const chargeRef = (
    invoice as unknown as {
      charge?: string | { id?: string } | null;
    }
  ).charge;
  const chargeId =
    typeof chargeRef === "string" ? chargeRef : chargeRef?.id ?? null;

  const paidAtSec =
    (invoice as unknown as { status_transitions?: { paid_at?: number } })
      .status_transitions?.paid_at ?? Date.now() / 1000;

  return {
    invoiceId: invoice.id ?? null,
    subId,
    piId,
    chargeId,
    amountPaidCents: invoice.amount_paid ?? 0,
    paidAtIso: new Date(paidAtSec * 1000).toISOString(),
    source,
  };
}

// Pulls the normalized context out of an "invoice payment" wrapper object
// (the newer invoice_payment.paid event). Requires a Stripe round-trip
// to fetch the underlying invoice so we can read its subscription id.
type InvoicePaymentObject = {
  invoice?: string | { id?: string } | null;
  payment?: { payment_intent?: string | { id?: string } | null } | null;
  amount_paid?: number;
  status_transitions?: { paid_at?: number };
};

// Walk every path Stripe has used for the subscription reference across
// API versions (top-level, expanded object, parent.subscription_details).
function extractSubIdFromInvoice(inv: unknown): string | null {
  const i = inv as {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id?: string } | null;
      } | null;
    } | null;
  };
  if (typeof i.subscription === "string") return i.subscription;
  if (i.subscription && typeof i.subscription === "object" && i.subscription.id) {
    return i.subscription.id;
  }
  const parentSub = i.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object" && parentSub.id) {
    return parentSub.id;
  }
  return null;
}

async function ctxFromInvoicePaymentPaid(
  obj: InvoicePaymentObject,
  source: string,
): Promise<PaidInvoiceCtx> {
  const invoiceRef = obj.invoice;
  const invoiceId =
    typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id ?? null;

  // PI + amount come straight off the event object — no invoice fetch needed.
  const piRefRaw = obj.payment?.payment_intent;
  const piId =
    typeof piRefRaw === "string" ? piRefRaw : piRefRaw?.id ?? null;

  let subId: string | null = null;
  let chargeId: string | null = null;
  if (invoiceId) {
    try {
      // CRITICAL: API 2024-09+ doesn't populate `invoice.subscription` by
      // default. Have to expand it. `parent` is the new shape used on
      // newer API versions; we walk both paths.
      const inv = await getStripe().invoices.retrieve(invoiceId, {
        expand: ["subscription", "parent", "payments"],
      });
      subId = extractSubIdFromInvoice(inv);
      const chargeRef = (
        inv as unknown as { charge?: string | { id?: string } | null }
      ).charge;
      chargeId =
        typeof chargeRef === "string" ? chargeRef : chargeRef?.id ?? null;
      if (!subId) {
        console.warn(
          `[webhook] ${source}: could not extract subscription id from invoice`,
          {
            invoice_id: invoiceId,
            has_subscription_field: !!(inv as { subscription?: unknown })
              .subscription,
            has_parent_field: !!(inv as { parent?: unknown }).parent,
          },
        );
      }
    } catch (err) {
      console.warn(
        `[webhook] ${source}: invoices.retrieve(${invoiceId}) failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const paidAtSec = obj.status_transitions?.paid_at ?? Date.now() / 1000;
  return {
    invoiceId,
    subId,
    piId,
    chargeId,
    amountPaidCents: obj.amount_paid ?? 0,
    paidAtIso: new Date(paidAtSec * 1000).toISOString(),
    source,
  };
}

// Failure path — same shape, simpler logic.
type FailedInvoiceCtx = {
  invoiceId: string | null;
  subId: string | null;
  piId: string | null;
  amountDueCents: number;
  failureMessage: string;
  source: string;
};

async function handleFailedInvoice(ctx: FailedInvoiceCtx) {
  if (!ctx.subId) return;
  const sponsorships = await findSponsorshipsByStripeRef({
    subscriptionId: ctx.subId,
  });
  for (const s of sponsorships) {
    const patch: Partial<Sponsorship> = {};
    if (!s.started_at) patch.status = "failed";
    await createPaymentIfMissing({
      sponsorshipId: s.id,
      amount_usd: ctx.amountDueCents / 100,
      status: "failed",
      stripe_payment_intent_id: ctx.piId,
      stripe_invoice_id: ctx.invoiceId,
      failure_reason: ctx.failureMessage,
      paid_at: new Date().toISOString(),
    });
    if (Object.keys(patch).length > 0) {
      await updateSponsorship(s.id, patch);
    }
  }
}

function ctxFromFailedInvoice(
  invoice: Stripe.Invoice,
  source: string,
): FailedInvoiceCtx {
  const subId = extractSubIdFromInvoice(invoice);
  const piRef = (
    invoice as unknown as {
      payment_intent?: string | { id?: string } | null;
    }
  ).payment_intent;
  const piId =
    typeof piRef === "string" ? piRef : piRef?.id ?? null;
  const failureMessage =
    (invoice as unknown as { last_finalization_error?: { message?: string } })
      .last_finalization_error?.message ?? "Payment failed.";
  return {
    invoiceId: invoice.id ?? null,
    subId,
    piId,
    amountDueCents: invoice.amount_due ?? 0,
    failureMessage,
    source,
  };
}

async function ctxFromInvoicePaymentFailed(
  obj: InvoicePaymentObject,
  source: string,
): Promise<FailedInvoiceCtx> {
  const invoiceRef = obj.invoice;
  const invoiceId =
    typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id ?? null;
  const piRefRaw = obj.payment?.payment_intent;
  const piId =
    typeof piRefRaw === "string" ? piRefRaw : piRefRaw?.id ?? null;
  let subId: string | null = null;
  let amountDueCents = obj.amount_paid ?? 0;
  let failureMessage = "Payment failed.";
  if (invoiceId) {
    try {
      const inv = await getStripe().invoices.retrieve(invoiceId, {
        expand: ["subscription", "parent", "payments"],
      });
      subId = extractSubIdFromInvoice(inv);
      amountDueCents = inv.amount_due ?? amountDueCents;
      failureMessage =
        (inv as unknown as { last_finalization_error?: { message?: string } })
          .last_finalization_error?.message ?? failureMessage;
    } catch (err) {
      console.warn(
        `[webhook] ${source}: invoices.retrieve(${invoiceId}) failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { invoiceId, subId, piId, amountDueCents, failureMessage, source };
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  // Two PI shapes flow through here:
  //   payment_mode='one_time'        → multi-sponsorship bundle (one PI shared)
  //   payment_mode='monthly_prepaid' → single sponsorship (one PI per row)
  // Subscription invoices are handled by invoice.payment_succeeded above
  // (they don't tag payment_mode in PI metadata).
  const metaMode = pi.metadata?.payment_mode;
  if (metaMode !== "one_time" && metaMode !== "monthly_prepaid") return;

  const sponsorships = await findSponsorshipsByStripeRef({ paymentIntentId: pi.id });
  if (sponsorships.length === 0) {
    console.warn(`[stripe-webhook] no sponsorships for PI ${pi.id} (${metaMode})`);
    return;
  }

  const chargeId =
    typeof pi.latest_charge === "string"
      ? pi.latest_charge
      : pi.latest_charge?.id ?? null;

  let methodType: string | null = null;
  try {
    if (chargeId) {
      const charge = await getStripe().charges.retrieve(chargeId);
      methodType = charge.payment_method_details?.type ?? null;
    }
  } catch {
    /* non-fatal */
  }

  // For one-time: per-row amount = s.amount_usd. The PI charge is the
  // sum across sponsorships, but we record one payment row per
  // sponsorship at its own amount.
  // For prepaid: one row per PI. The payment row carries the FULL PI
  // amount (months × monthly rate), not the per-month rate, since this
  // is what the donor was actually charged today.
  // Track sponsorships that flipped from pending → active in THIS
  // event so we can fan out a single welcome email summarising the
  // bundle (Session 14.5b inline trigger).
  const newlyActiveIds: string[] = [];
  for (const s of sponsorships) {
    const isPrepaid = s.payment_schedule === "monthly_prepaid";
    const paymentAmount = isPrepaid
      ? (pi.amount ?? 0) / 100 // full upfront sum
      : s.amount_usd;

    const { created } = await createPaymentIfMissing({
      sponsorshipId: s.id,
      amount_usd: paymentAmount,
      status: "succeeded",
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: chargeId,
      payment_method_type: methodType,
      paid_at: new Date().toISOString(),
    });

    const wasFirstActivation = !s.started_at;
    // Session 15b1.1 Bug 1: one-time gifts complete immediately on
    // PI success. There's no future-state for a one-time gift —
    // status='active' is only correct for monthly_prepaid (covers
    // a future window) and recurring monthly subs (continue billing).
    // For one-time, jump straight to 'completed' + stamp ended_at.
    const isOneTime = s.payment_mode === "one_time";
    const nowIso = new Date().toISOString();
    const patch: Partial<Sponsorship> = {
      status: isOneTime ? "completed" : "active",
    };
    if (wasFirstActivation) patch.started_at = nowIso;
    if (isOneTime) patch.ended_at = nowIso;
    if (created) {
      patch.payment_count = (s.payment_count ?? 0) + 1;
      patch.total_paid_usd = Number(s.total_paid_usd ?? 0) + paymentAmount;
    }
    await updateSponsorship(s.id, patch);

    if (wasFirstActivation) newlyActiveIds.push(s.id);
  }

  // Convert cart for this donor.
  const donorId = pi.metadata?.donor_id;
  if (donorId) await clearCartByDonor(donorId).catch(() => {});

  // Inline welcome email (Session 14.5b). One-time bundles → ONE
  // welcome email summarising all newly-active sponsorships in the
  // PI. Prepaid PIs → single ID. The internal route's own donor-
  // level dedup ensures no duplicate fires if this event replays.
  // Note: monthly-receipt email is NOT triggered here — receipts
  // are for recurring invoice billing cycles, not for the upfront
  // PI charge (one-time gifts and prepaid bundles get covered by
  // the welcome email instead, which is the canonical "your
  // sponsorship has begun" notification).
  if (newlyActiveIds.length > 0) {
    await fireWelcomeEmail(newlyActiveIds);
  }
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const sponsorships = await findSponsorshipsByStripeRef({ paymentIntentId: pi.id });
  for (const s of sponsorships) {
    await createPaymentIfMissing({
      sponsorshipId: s.id,
      amount_usd: s.amount_usd,
      status: "failed",
      stripe_payment_intent_id: pi.id,
      failure_reason: pi.last_payment_error?.message ?? "Payment failed.",
      paid_at: new Date().toISOString(),
    });
    if (!s.started_at) {
      await updateSponsorship(s.id, { status: "failed" });
    }
  }
}

// Session 15b1.1 Bug 2 — charge.refunded handler. When a refund
// is issued (full or partial) on a Stripe charge, mirror the state
// onto our payment + sponsorship rows so the donor's dashboard
// reads consistently and the refund-confirmation email fires.
//
// Stripe events relevant here:
//   - charge.refunded — full refund (or first refund on a charge)
//   - charge.refund.updated — refund settled, edited, etc. (we
//     could subscribe later if partial-refund accounting needs it)
//
// charge.refunded carries the Charge object with .payment_intent
// pointing at the original PI. We look up our payment row by
// stripe_payment_intent_id, mark refunded_at + status='refunded',
// then set the linked sponsorship to status='refunded'/'cancelled'
// per its mode.
async function handleChargeRefunded(charge: Stripe.Charge) {
  const piId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!piId) {
    console.warn(
      `[stripe-webhook] charge.refunded ${charge.id} has no payment_intent; skip`,
    );
    return;
  }

  const sponsorships = await findSponsorshipsByStripeRef({
    paymentIntentId: piId,
  });
  if (sponsorships.length === 0) {
    console.warn(
      `[stripe-webhook] charge.refunded: no sponsorship found for PI ${piId}`,
    );
    return;
  }

  // Find the payment row(s) tied to this PI. There's one per
  // sponsorship in the bundle case (one-time gifts share a PI but
  // each row gets its own payment record); for prepaid + recurring
  // there's a single row.
  const ds = directusServer();
  const paymentRows = (await ds.request(
    readItems("payment" as never, {
      filter: { stripe_payment_intent_id: { _eq: piId } },
      fields: ["id", "sponsorship", "amount_usd", "status", "refunded_at"],
      limit: -1,
    } as never),
  )) as unknown as Array<{
    id: string;
    sponsorship: string;
    amount_usd: number | string;
    status: string;
    refunded_at: string | null;
  }>;

  const refundedAtIso = new Date(
    (charge.created ?? Date.now() / 1000) * 1000,
  ).toISOString();
  const refundedAmountUsd = (charge.amount_refunded ?? 0) / 100;
  const refundReason = charge.refunds?.data?.[0]?.reason ?? "manual_refund";

  // Mark every payment row tied to this PI as refunded — bundle
  // PI for one-time gifts shares charge_id across N payment rows.
  for (const p of paymentRows) {
    if (p.refunded_at) continue; // idempotent — already marked
    try {
      await ds.request(
        updateItem("payment" as never, p.id as never, {
          status: "refunded",
          refunded_at: refundedAtIso,
          refund_reason: refundReason,
        } as never),
      );
      console.log(
        `[stripe-webhook] payment=${p.id} marked refunded ($${refundedAmountUsd})`,
      );
    } catch (err) {
      console.warn(
        `[stripe-webhook] payment ${p.id} update failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // For each affected sponsorship: flip status to 'cancelled' with
  // a refund-specific reason. One-time + prepaid both terminate.
  // For recurring monthly subs, refunding a single invoice doesn't
  // cancel the underlying sub — Stripe handles that separately;
  // we still mark the sponsorship cancelled because the donor's
  // intent is clear (they got their money back). If this turns
  // out to be wrong for partial refunds on recurring, future work
  // can refine.
  for (const s of sponsorships) {
    // Idempotent guard (Session 15b1.2 fix).
    //
    // Canonical "this sponsorship has already been refunded" signal:
    // cancellation_reason === 'refunded'. We do NOT gate on
    // status === 'completed' or status === 'cancelled' — refunds
    // SUPERSEDE those terminal states. The Session 15b1.1 Bug 1
    // fix flips one-time gifts to status='completed' on PI success;
    // a later refund must still mark the sponsorship cancelled with
    // reason='refunded' so the donor's dashboard reflects the
    // money-back outcome (and so the refund email fires).
    //
    // Event-level replay protection lives upstream in
    // stripe_event_processed — by the time we reach here, this is
    // a first-delivery (or our deliberate manual replay). Per-row
    // dedup just prevents looping over the same row twice within
    // one handler invocation.
    if (s.cancellation_reason === "refunded") continue;
    try {
      await updateSponsorship(s.id, {
        status: "cancelled",
        cancelled_at: refundedAtIso,
        ended_at: refundedAtIso,
        cancellation_reason: "refunded",
      });
      console.log(
        `[stripe-webhook] sponsorship=${s.id} marked cancelled (refund of $${refundedAmountUsd})`,
      );
      // Inline refund email — Bug 4 migration. Reuses the existing
      // sponsorship-cancelled internal route with reason='refunded'
      // for refund-specific subject copy.
      try {
        await fireRefundEmail({
          sponsorshipId: s.id,
          refundedAmountUsd,
        });
      } catch (err) {
        console.warn(
          `[stripe-webhook] refund email for ${s.id} failed (non-fatal):`,
          err instanceof Error ? err.message : err,
        );
      }
    } catch (err) {
      console.warn(
        `[stripe-webhook] sponsorship ${s.id} refund update failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// Part 5.6 Z.4 — defensive customer.subscription.created handler.
// Insurance against future drift in case any sponsorship-creation
// path ever forgets to set `payment_schedule`. Strategy: when
// Stripe announces a subscription was created, find the matching
// sponsorship row by stripe_subscription_id; if it exists AND
// `payment_schedule` is null, write "monthly". No-op otherwise.
//
// Idempotent at TWO levels:
//   1. Event-level via existing markStripeEventProcessed
//   2. Field-level via the null check (re-running on the same
//      already-backfilled record is a no-op)
async function handleSubscriptionCreated(sub: Stripe.Subscription) {
  const sponsorships = await findSponsorshipsByStripeRef({
    subscriptionId: sub.id,
  });
  if (sponsorships.length === 0) {
    // No matching sponsorship row — likely a sub created outside
    // our checkout flow, or a timing race where this event arrived
    // before the row was written. Defensive no-op.
    console.log(
      `[stripe-webhook] subscription.created — no sponsorship row for sub ${sub.id}`,
    );
    return;
  }
  for (const s of sponsorships) {
    if (s.payment_schedule !== null) continue; // already set, no-op
    try {
      await updateSponsorship(s.id, { payment_schedule: "monthly" });
      console.log(
        `[stripe-webhook] subscription.created — backfilled payment_schedule="monthly" on sponsorship ${s.id}`,
      );
    } catch (err) {
      console.warn(
        `[stripe-webhook] sponsorship ${s.id} payment_schedule backfill failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const sponsorships = await findSponsorshipsByStripeRef({ subscriptionId: sub.id });

  // Distinguish a SCHEDULED end-of-term cancel (cancel_at hit) from a
  // MANUAL cancel (donor or admin). For fixed-term subs created via
  // /api/checkout/init we set sub.cancel_at; when Stripe auto-cancels,
  // sub.canceled_at lands very close to that scheduled time.
  // Tolerance accounts for Stripe's billing scheduler not running on the
  // exact second.
  const SCHEDULED_TOLERANCE_SEC = 5 * 60;
  const isScheduledCompletion =
    typeof sub.cancel_at === "number" &&
    typeof sub.canceled_at === "number" &&
    Math.abs(sub.canceled_at - sub.cancel_at) <= SCHEDULED_TOLERANCE_SEC;

  const nowIso = new Date().toISOString();
  // Track the set of children whose active sponsor (queue_position=0)
  // ended in this webhook so we can promote their queues afterward.
  // We only promote ONCE per child even if multiple sponsorship rows
  // for the same sub were affected (defensive).
  const childrenToPromote = new Set<string>();

  for (const s of sponsorships) {
    if (s.status === "cancelled" || s.status === "completed") continue;
    // Donor scheduled cancellation during prepaid: their Stripe sub
    // (the monthly tail) gets cancelled immediately, but the local row
    // stays 'active' until the prepaid period ends. Don't overwrite —
    // Session 15's cron will flip the row at the right time.
    if (s.cancellation_scheduled_at) {
      console.log(
        `[stripe-webhook] sub deleted for sponsorship ${s.id} — leaving 'active', cancellation already scheduled for ${s.cancellation_scheduled_at}`,
      );
      continue;
    }
    if (isScheduledCompletion) {
      await updateSponsorship(s.id, {
        status: "completed",
        ended_at: nowIso,
        cancellation_reason: "completed_term",
      });
    } else {
      await updateSponsorship(s.id, {
        status: "cancelled",
        ended_at: nowIso,
        cancelled_at: nowIso,
        cancellation_reason: "stripe_cancelled",
      });
    }

    // Session 14.7: if this row was the active sponsor (queue_position=0
    // or null), the child's queue advances. Queue join rows
    // (queue_position>0) ending here means a queued donor cancelled
    // before activation — also a queue cascade. Either way, promote.
    const childId = typeof s.child === "string" ? s.child : s.child?.id;
    if (childId) childrenToPromote.add(childId);
  }

  // Promote queues after all row updates complete. promoteQueue is
  // defensive — if there's nothing to promote (empty queue, or the
  // active row hasn't actually ended) it no-ops.
  for (const childId of childrenToPromote) {
    try {
      await promoteQueue(childId, { stripe: getStripe() });
    } catch (err) {
      console.warn(
        `[stripe-webhook] promoteQueue ${childId} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ─── Webhook entry point ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing signature." },
      { status: 400 },
    );
  }

  let secret: string;
  try { secret = getStripeWebhookSecret(); }
  catch {
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 },
    );
  }

  // CRITICAL: read RAW body, not parsed JSON.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn(
      "[stripe-webhook] signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 400 },
    );
  }

  // Idempotency guard.
  if (await isStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true, dedup: true });
  }

  try {
    // Cast away from Stripe's typed event union — newer event names
    // (invoice_payment.failed, invoice_payment.created) aren't yet in the
    // SDK's literal union.
    const eventType = event.type as string;
    switch (eventType) {
      // ── Invoice paid (legacy + dual-aliased + new wrapper) ───────────
      case "invoice.payment_succeeded":
      case "invoice.paid":
        await activateFromPaidInvoice(
          ctxFromInvoice(event.data.object as Stripe.Invoice, event.type),
        );
        break;
      case "invoice_payment.paid":
        await activateFromPaidInvoice(
          await ctxFromInvoicePaymentPaid(
            event.data.object as InvoicePaymentObject,
            event.type,
          ),
        );
        break;
      // ── Invoice failed (legacy + new wrapper) ────────────────────────
      case "invoice.payment_failed":
        await handleFailedInvoice(
          ctxFromFailedInvoice(event.data.object as Stripe.Invoice, event.type),
        );
        break;
      case "invoice_payment.failed":
        await handleFailedInvoice(
          await ctxFromInvoicePaymentFailed(
            event.data.object as InvoicePaymentObject,
            event.type,
          ),
        );
        break;
      // ── Informational only ───────────────────────────────────────────
      case "invoice_payment.created":
        // Ack and ignore; we react to invoice_payment.paid instead.
        break;
      // ── One-time PaymentIntents ──────────────────────────────────────
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      // ── Subscription created (Part 5.6 Z.4 — defensive
      //    payment_schedule backfill) ──────────────────────────────
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      // ── Subscription cancellation ────────────────────────────────────
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      // ── Refund (Session 15b1.1 Bug 2) ─────────────────────────────────
      // charge.refunded fires for full refunds and the first partial
      // refund on a charge. We mirror onto our payment row
      // (status='refunded', refunded_at, refund_reason) and the
      // sponsorship row (status='cancelled', cancellation_reason='refunded'),
      // then fire the inline refund-confirmation email.
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        // Unhandled event types are still acknowledged — Stripe shouldn't
        // retry them.
        break;
    }
  } catch (err) {
    // If processing throws, do NOT mark processed. Stripe will retry.
    console.error("[stripe-webhook] handler threw:", err);
    return NextResponse.json(
      { error: "Handler error." },
      { status: 500 },
    );
  }

  // Mark as processed LAST so failures don't accidentally skip the event.
  await markStripeEventProcessed(event.id, event.type);

  return NextResponse.json({ received: true });
}
