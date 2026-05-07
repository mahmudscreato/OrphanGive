import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
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
import { clearCartByDonor } from "@/lib/cart-data";

// Webhooks need the RAW request body to verify signatures. Force the
// Node.js runtime so request.text() returns the unparsed payload.
export const runtime = "nodejs";

// ─── Event handlers ─────────────────────────────────────────────────────────
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (
    invoice as unknown as { subscription?: string | Stripe.Subscription | null }
  ).subscription;
  if (!subscriptionId) return; // not a subscription invoice
  const subId = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;

  const sponsorships = await findSponsorshipsByStripeRef({ subscriptionId: subId });
  if (sponsorships.length === 0) {
    console.warn(`[stripe-webhook] no sponsorship found for sub ${subId}`);
    return;
  }
  const sponsorship = sponsorships[0]!;

  const amountUsd = (invoice.amount_paid ?? 0) / 100;
  const piRef = (
    invoice as unknown as {
      payment_intent?: string | { id?: string } | null;
    }
  ).payment_intent;
  const piId =
    typeof piRef === "string" ? piRef : piRef?.id ?? null;
  const chargeId =
    typeof (invoice as unknown as { charge?: string | { id?: string } }).charge === "string"
      ? ((invoice as unknown as { charge: string }).charge)
      : ((invoice as unknown as { charge?: { id?: string } }).charge?.id ?? null);

  // Best-effort method type lookup.
  let methodType: string | null = null;
  try {
    if (piId) {
      const pi = await getStripe().paymentIntents.retrieve(piId, {
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

  const created = await createPaymentIfMissing({
    sponsorshipId: sponsorship.id,
    amount_usd: amountUsd,
    status: "succeeded",
    stripe_payment_intent_id: piId,
    stripe_charge_id: chargeId,
    stripe_invoice_id: invoice.id ?? null,
    payment_method_type: methodType,
    paid_at: new Date(((invoice as unknown as { status_transitions?: { paid_at?: number } })
      .status_transitions?.paid_at ?? Date.now() / 1000) * 1000).toISOString(),
  });

  // Activate the sponsorship + bump accumulators only if this is a
  // freshly recorded payment (idempotency: don't double-bump on replay).
  const patch: Partial<Sponsorship> = { status: "active" };
  if (!sponsorship.started_at) {
    patch.started_at = new Date().toISOString();
  }
  // next_billing_date — Stripe sometimes sends this on the invoice or on
  // the subscription. Best effort: +30 days from now.
  patch.next_billing_date = new Date(Date.now() + 30 * 86_400_000).toISOString();
  if (created) {
    patch.payment_count = (sponsorship.payment_count ?? 0) + 1;
    patch.total_paid_usd = Number(sponsorship.total_paid_usd ?? 0) + amountUsd;
  }
  await updateSponsorship(sponsorship.id, patch);

  // Mark donor's cart as converted on first successful payment for this donor.
  await clearCartByDonor(sponsorship.donor).catch(() => {});
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (
    invoice as unknown as { subscription?: string | Stripe.Subscription | null }
  ).subscription;
  if (!subscriptionId) return;
  const subId = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;
  const sponsorships = await findSponsorshipsByStripeRef({ subscriptionId: subId });
  for (const s of sponsorships) {
    // Only flip status to 'failed' if no successful payment has ever
    // landed. After it's been active, a one-month failure leaves status
    // 'active' so dunning can recover it; we just log a payment row.
    const patch: Partial<Sponsorship> = {};
    if (!s.started_at) patch.status = "failed";

    const failureMessage =
      (invoice as unknown as { last_finalization_error?: { message?: string } })
        .last_finalization_error?.message ?? "Payment failed.";

    const failPiRef = (
      invoice as unknown as {
        payment_intent?: string | { id?: string } | null;
      }
    ).payment_intent;
    const failPiId =
      typeof failPiRef === "string" ? failPiRef : failPiRef?.id ?? null;

    await createPaymentIfMissing({
      sponsorshipId: s.id,
      amount_usd: (invoice.amount_due ?? 0) / 100,
      status: "failed",
      stripe_payment_intent_id: failPiId,
      stripe_invoice_id: invoice.id ?? null,
      failure_reason: failureMessage,
      paid_at: new Date().toISOString(),
    });

    if (Object.keys(patch).length > 0) {
      await updateSponsorship(s.id, patch);
    }
  }
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  // We only auto-handle one-time payments here (tagged via metadata).
  // Subscription invoices are handled by invoice.payment_succeeded above.
  if (pi.metadata?.payment_mode !== "one_time") return;

  const sponsorships = await findSponsorshipsByStripeRef({ paymentIntentId: pi.id });
  if (sponsorships.length === 0) {
    console.warn(`[stripe-webhook] no sponsorships for one-time PI ${pi.id}`);
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

  for (const s of sponsorships) {
    const created = await createPaymentIfMissing({
      sponsorshipId: s.id,
      amount_usd: s.amount_usd,
      status: "succeeded",
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: chargeId,
      payment_method_type: methodType,
      paid_at: new Date().toISOString(),
    });

    const patch: Partial<Sponsorship> = { status: "active" };
    if (!s.started_at) patch.started_at = new Date().toISOString();
    if (created) {
      patch.payment_count = (s.payment_count ?? 0) + 1;
      patch.total_paid_usd = Number(s.total_paid_usd ?? 0) + s.amount_usd;
    }
    await updateSponsorship(s.id, patch);
  }

  // Convert cart for this donor (one-time PI carries donor_id in metadata).
  const donorId = pi.metadata?.donor_id;
  if (donorId) await clearCartByDonor(donorId).catch(() => {});
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

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const sponsorships = await findSponsorshipsByStripeRef({ subscriptionId: sub.id });
  for (const s of sponsorships) {
    if (s.status === "cancelled") continue;
    await updateSponsorship(s.id, {
      status: "cancelled",
      ended_at: new Date().toISOString(),
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "stripe_cancelled",
    });
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
    switch (event.type) {
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
