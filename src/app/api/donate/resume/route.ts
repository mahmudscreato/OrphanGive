// Session 58.6 — POST /api/donate/resume
//
// Resume a pending_payment sponsorship row by reusing the Stripe
// object that was already created during the original /api/donate/init
// call. The donor confirms the SAME PaymentIntent / Subscription via
// Stripe Elements — no duplicate row, no duplicate charge.
//
// Body: { sponsorshipId: string }
// Response:
//   200 { clientSecret, sponsorshipId, stripePublishableKey,
//         intentType: 'payment' | 'setup', alreadyPaid: false }
//   200 { alreadyPaid: true, sponsorshipId, reconciled: true }
//        when the Stripe object already succeeded between abandonment
//        and resume — row gets flipped to active/completed (mirrors
//        the webhook + 58.5 reconcile), donor sees a friendly
//        "already complete" message and is sent to /donate/success.
//   400 { error: 'unrecoverable', message: ... }
//        when the underlying Stripe object is in a terminal failure
//        state (canceled / incomplete_expired). The donor is asked
//        to cancel the attempt and start fresh (the dashboard
//        already has Cancel attempt; 58.5 reconcile handles it).
//
// What this endpoint does NOT do:
//   - It does NOT recreate Stripe objects from scratch when the
//     original is terminally dead. That path would mean rebuilding
//     the entire payload (rate lookup, currency conversion, queue
//     re-check, etc.) — bigger scope. Donor's recovery path for the
//     rare terminal-Stripe-object case is: Cancel attempt → start a
//     fresh sponsor flow.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentDonor } from "@/lib/donor-data";
import {
  getStripe,
  getStripePublishableKey,
} from "@/lib/stripe-client";
import {
  getSponsorshipForDonor,
  updateSponsorship,
} from "@/lib/sponsorship-data";
import type Stripe from "stripe";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

// ── PI / Sub status sets ──────────────────────────────────────────

const REUSABLE_PI_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

// PI is already paid → reconcile, don't ask donor to confirm again.
const PAID_PI_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "succeeded",
  "processing",
  "requires_capture",
]);

// Subscription states the donor can still confirm a card for.
// 'incomplete' is the default_incomplete state right after creation.
const REUSABLE_SUB_STATUSES = new Set<Stripe.Subscription.Status>([
  "incomplete",
  "trialing", // queue-joined subs sit here until trial_end fires
]);

// Subscription states meaning donor already paid the first invoice.
const PAID_SUB_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "past_due", // first paid, retry failing — still "paid" in the sense
  "unpaid",
]);

function extractInvoiceClientSecret(
  inv:
    | (Stripe.Invoice & {
        confirmation_secret?: { client_secret?: string } | null;
        payment_intent?: Stripe.PaymentIntent | string | null;
      })
    | string
    | null,
): string | null {
  if (!inv || typeof inv === "string") return null;
  const newer =
    (inv as { confirmation_secret?: { client_secret?: string } | null })
      .confirmation_secret?.client_secret ?? null;
  if (newer) return newer;
  const pi = (inv as { payment_intent?: Stripe.PaymentIntent | string | null })
    .payment_intent;
  if (!pi || typeof pi === "string") return null;
  return pi.client_secret ?? null;
}

// ── Handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { sponsorshipId?: unknown };
  try {
    body = (await req.json()) as { sponsorshipId?: unknown };
  } catch {
    return bad("Invalid JSON body");
  }
  const sponsorshipId =
    typeof body.sponsorshipId === "string" ? body.sponsorshipId : null;
  if (!sponsorshipId || !UUID_RE.test(sponsorshipId)) {
    return bad("sponsorshipId (uuid) required");
  }

  const donor = await getCurrentDonor();
  if (!donor) return bad("Not authenticated", 401);

  const sponsorship = await getSponsorshipForDonor(sponsorshipId, donor.id);
  if (!sponsorship) {
    return bad("Sponsorship not found", 404);
  }
  if (sponsorship.status !== "pending_payment") {
    return bad(
      `Cannot resume: sponsorship is in state '${sponsorship.status}'.`,
      400,
    );
  }

  const stripe = getStripe();
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return bad("Stripe is not configured on the server.", 500);
  }
  const nowIso = new Date().toISOString();

  // ── PaymentIntent path (one-time OR pending prepaid bundle) ─────
  if (sponsorship.stripe_payment_intent_id) {
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(
        sponsorship.stripe_payment_intent_id,
      );
    } catch (err) {
      console.error("[/api/donate/resume] PI retrieve failed:", err);
      return bad(
        "Could not load the original payment. Cancel this attempt and start fresh.",
        400,
        { reason: "pi_retrieve_failed" },
      );
    }

    // Already paid → reconcile (mirrors 58.5 cancel-route reconcile).
    if (PAID_PI_STATUSES.has(pi.status)) {
      try {
        const isOneTime = sponsorship.payment_mode === "one_time";
        await updateSponsorship(sponsorship.id, {
          status: isOneTime ? "completed" : "active",
          ...(sponsorship.started_at ? {} : { started_at: nowIso }),
          ...(isOneTime ? { ended_at: nowIso } : {}),
        });
      } catch (err) {
        console.error(
          "[/api/donate/resume] PI-paid reconcile update failed:",
          err,
        );
      }
      return NextResponse.json({
        alreadyPaid: true,
        sponsorshipId,
        reconciled: true,
        message:
          "This payment already completed — your sponsorship is now active.",
      });
    }

    // Reusable → return the existing client_secret.
    if (REUSABLE_PI_STATUSES.has(pi.status)) {
      if (!pi.client_secret) {
        return bad(
          "Original payment has no client_secret. Cancel this attempt and start fresh.",
          400,
          { reason: "no_client_secret" },
        );
      }
      return NextResponse.json({
        clientSecret: pi.client_secret,
        sponsorshipId,
        stripePublishableKey: publishableKey,
        intentType: "payment",
        alreadyPaid: false,
      });
    }

    // Terminal: canceled / unknown future state.
    return bad(
      `Original payment is in state '${pi.status}' and cannot be resumed. Cancel this attempt and start fresh.`,
      400,
      { reason: "pi_terminal", piStatus: pi.status },
    );
  }

  // ── Subscription path (open-ended OR finite recurring monthly) ──
  if (sponsorship.stripe_subscription_id) {
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(
        sponsorship.stripe_subscription_id,
        {
          expand: [
            "latest_invoice.confirmation_secret",
            "latest_invoice.payment_intent",
            "pending_setup_intent",
          ],
        },
      );
    } catch (err) {
      console.error("[/api/donate/resume] sub retrieve failed:", err);
      return bad(
        "Could not load the original subscription. Cancel this attempt and start fresh.",
        400,
        { reason: "sub_retrieve_failed" },
      );
    }

    // Already paid first invoice → reconcile.
    if (PAID_SUB_STATUSES.has(sub.status)) {
      try {
        await updateSponsorship(sponsorship.id, {
          status: "active",
          ...(sponsorship.started_at ? {} : { started_at: nowIso }),
        });
      } catch (err) {
        console.error(
          "[/api/donate/resume] sub-paid reconcile update failed:",
          err,
        );
      }
      return NextResponse.json({
        alreadyPaid: true,
        sponsorshipId,
        reconciled: true,
        message:
          "This subscription is already active. Welcome back!",
      });
    }

    // Reusable: incomplete (default_incomplete) OR trialing (queued).
    if (REUSABLE_SUB_STATUSES.has(sub.status)) {
      // Pull the right client_secret per the original endpoint's
      // selection rule (mirrored from /api/donate/init):
      //   queued (trial_end set) → pending_setup_intent.client_secret
      //                            (seti_…)
      //   incomplete unqueued    → latest_invoice client_secret
      //                            (pi_…)
      let clientSecret: string | null = null;
      let intentType: "payment" | "setup" = "payment";
      const isQueued = sub.status === "trialing" && sub.trial_end !== null;
      if (isQueued) {
        const psi = (sub as unknown as {
          pending_setup_intent?:
            | { client_secret?: string | null }
            | string
            | null;
        }).pending_setup_intent;
        if (psi && typeof psi !== "string") {
          clientSecret = psi.client_secret ?? null;
          intentType = "setup";
        }
      } else {
        const inv = sub.latest_invoice as
          | (Stripe.Invoice & {
              confirmation_secret?: { client_secret?: string } | null;
              payment_intent?: Stripe.PaymentIntent | string | null;
            })
          | string
          | null;
        clientSecret = extractInvoiceClientSecret(inv);
        intentType = "payment";
      }
      if (!clientSecret) {
        return bad(
          "Could not extract a client secret from the existing subscription. Cancel this attempt and start fresh.",
          400,
          { reason: "no_sub_client_secret", subStatus: sub.status },
        );
      }
      return NextResponse.json({
        clientSecret,
        sponsorshipId,
        stripePublishableKey: publishableKey,
        intentType,
        alreadyPaid: false,
      });
    }

    // Terminal: incomplete_expired / canceled.
    return bad(
      `Original subscription is in state '${sub.status}' and cannot be resumed. Cancel this attempt and start fresh.`,
      400,
      { reason: "sub_terminal", subStatus: sub.status },
    );
  }

  // Pending row with no Stripe object — shouldn't happen for rows
  // created via /api/donate/init, but defensive.
  return bad(
    "Pending sponsorship has no Stripe object. Cancel this attempt and start fresh.",
    400,
    { reason: "no_stripe_object" },
  );
}
