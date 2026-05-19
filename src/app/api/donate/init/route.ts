// Session 58.2 — unified donation checkout endpoint.
//
// Replaces /api/checkout/init in the new system. Handles all three
// modes from a single entry point:
//
//   subscription   — open-ended monthly (donation_package with
//                    duration_months = null), Stripe Subscription
//   prepaid-bundle — N months upfront (duration_months > 0), single
//                    Stripe PaymentIntent for amount × N
//   one-time       — campaign or earmarked one-time gift, single
//                    Stripe PaymentIntent
//
// Mode is derived server-side from the loaded package (or supplied
// explicitly for custom-amount donations); the client doesn't pick
// the mode.
//
// What this endpoint does NOT do (out of scope for 58.2 — filed for
// 58.3):
//   - Queue handling (Session 14.7) — if a child already has an
//     active monthly sponsor, this endpoint will currently allow a
//     second subscription. The queue race-guard from the legacy
//     /api/checkout/init isn't ported yet.
//   - Cart / multi-item flows — one package per request.
//   - Fixed-term subscriptions with auto-cancel (use prepaid-bundle
//     for finite commitments).

import { NextResponse, type NextRequest } from "next/server";
import {
  readUser,
  updateUser,
  createItem,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { getCurrentDonor } from "@/lib/donor-data";
import { getStripe, getStripePublishableKey } from "@/lib/stripe-client";
import {
  getPackageById,
  getMinimumActiveMonthlyAmountBdt,
  type DonationPackage,
} from "@/lib/donation-packages";
import { getCurrencyByCode } from "@/lib/currency-rates";
import {
  buildDonationPayload,
  validateCustomAmount,
  type SponsorshipRowDraft,
} from "@/lib/donation-checkout";
import { computeNextQueueSlot, QUEUE_DEPTH_LIMIT } from "@/lib/queue";

export const runtime = "nodejs";

// ─── Request body ───────────────────────────────────────────────────

interface DonateInitBody {
  packageId?: string | null;
  customAmountBdt?: number | null;
  /** Required when no packageId — disambiguates monthly vs one-time. */
  customPackageType?: "monthly" | "one_time" | null;
  currencyCode: string;
  childId?: string | null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ─── Stripe customer reuse (mirrors checkout/init) ─────────────────

async function ensureStripeCustomer(donor: {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  og_country: string | null;
}): Promise<string> {
  const stripe = getStripe();
  const ds = directusServer();
  const userRow = (await ds.request(
    readUser(donor.id as never, {
      fields: ["og_stripe_customer_id"],
    } as never),
  )) as unknown as { og_stripe_customer_id?: string | null };
  const existing = userRow?.og_stripe_customer_id ?? null;

  if (existing) {
    try {
      const c = await stripe.customers.retrieve(existing);
      if (!c.deleted) return existing;
    } catch {
      /* fall through to create */
    }
  }

  const fullName =
    [donor.first_name, donor.last_name].filter(Boolean).join(" ").trim() ||
    undefined;
  const customer = await stripe.customers.create({
    email: donor.email,
    name: fullName,
    metadata: {
      donor_id: donor.id,
      og_country: donor.og_country ?? "",
    },
  });
  await ds.request(
    updateUser(donor.id as never, {
      og_stripe_customer_id: customer.id,
    } as never),
  );
  return customer.id;
}

// ─── Sponsorship row writer ────────────────────────────────────────
//
// The legacy createPendingSponsorship() in sponsorship-data.ts predates
// the 58.2 columns and doesn't accept them. We could extend its opts
// type, but that's another commit's worth of plumbing. Instead, the
// endpoint writes directly via the SDK with the full row shape — the
// generic sponsorship-data.updateSponsorship helper is then used for
// the second pass that attaches Stripe IDs (which happens AFTER Stripe
// creation, see below).

async function writePendingSponsorship(
  draft: SponsorshipRowDraft & {
    stripe_subscription_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_customer_id?: string | null;
    // Queue fields (Session 58.2-overnight Task 1). Set when the row
    // is being created in a queued slot (position 1..3). Null/absent
    // means active-from-the-start, the unqueued default.
    queue_position?: number | null;
    queue_status?: string | null;
    queued_starts_at?: string | null;
    queued_ends_at?: string | null;
  },
): Promise<string> {
  const payload: Record<string, unknown> = {
    donor: draft.donor,
    child: draft.child, // nullable for campaign one-time gifts
    payment_mode: draft.payment_mode,
    amount_usd: draft.amount_usd,
    currency: "USD", // legacy field, kept "USD" — donor truth is in donor_currency_*
    status: "pending_payment",
    stripe_subscription_id: draft.stripe_subscription_id ?? null,
    stripe_payment_intent_id: draft.stripe_payment_intent_id ?? null,
    stripe_customer_id: draft.stripe_customer_id ?? null,
    payment_schedule: draft.payment_schedule ?? null,
    prepaid_months_total: draft.prepaid_months_total ?? null,
    prepaid_months_remaining: draft.prepaid_months_remaining ?? null,
    // 58.2 columns:
    cause_tag: draft.cause_tag ?? null,
    donation_package: draft.donation_package ?? null,
    donor_currency_code: draft.donor_currency_code ?? null,
    donor_currency_amount: draft.donor_currency_amount ?? null,
    bdt_per_unit_at_checkout: draft.bdt_per_unit_at_checkout ?? null,
    // Queue columns (only populated when joining a queued slot):
    queue_position: draft.queue_position ?? null,
    queue_status: draft.queue_status ?? null,
    queued_starts_at: draft.queued_starts_at ?? null,
    queued_ends_at: draft.queued_ends_at ?? null,
  };
  const created = (await directusServer().request(
    createItem("sponsorship" as never, payload as never),
  )) as unknown as { id: string };
  return created.id;
}

async function attachStripeRefs(
  sponsorshipId: string,
  refs: {
    stripe_subscription_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_customer_id?: string | null;
  },
): Promise<void> {
  await directusServer().request(
    updateItem(
      "sponsorship" as never,
      sponsorshipId,
      refs as never,
    ),
  );
}

// ─── Handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: DonateInitBody;
  try {
    body = (await req.json()) as DonateInitBody;
  } catch {
    return bad("Invalid JSON body");
  }

  // Validate XOR: exactly one of packageId or customAmountBdt.
  const hasPackage = Boolean(body.packageId);
  const hasCustom =
    body.customAmountBdt !== undefined &&
    body.customAmountBdt !== null &&
    Number.isFinite(body.customAmountBdt);
  if (hasPackage === hasCustom) {
    return bad("Provide exactly one of packageId or customAmountBdt");
  }

  if (!body.currencyCode || typeof body.currencyCode !== "string") {
    return bad("currencyCode required");
  }

  // Donor must be authenticated. Anonymous donations aren't supported
  // in v1 — donors must sign in (or sign up) before checkout.
  const donor = await getCurrentDonor();
  if (!donor) {
    return bad("Not authenticated", 401);
  }
  if (donor.og_admin_approval_status !== "approved") {
    return bad("Donor account is not approved for donations", 403);
  }

  // Load currency rate. Donor-supplied code is validated against
  // the active set; rejected if missing / inactive.
  const rate = await getCurrencyByCode(body.currencyCode);
  if (!rate) {
    return bad(`Currency '${body.currencyCode}' not active`, 400);
  }

  // Resolve package (or null + per-charge amount for custom).
  let pkg: DonationPackage | null = null;
  let perChargeAmountBdt: number;
  let packageTypeForRow: "monthly" | "one_time";

  if (hasPackage) {
    pkg = await getPackageById(body.packageId!);
    if (!pkg) return bad("Package not found or inactive", 404);
    perChargeAmountBdt = pkg.amount_bdt;
    packageTypeForRow = pkg.package_type;
  } else {
    // Custom amount path. customPackageType disambiguates the floor +
    // the resulting Stripe mode.
    if (
      body.customPackageType !== "monthly" &&
      body.customPackageType !== "one_time"
    ) {
      return bad(
        "customPackageType required when using customAmountBdt (monthly | one_time)",
      );
    }
    const floor =
      body.customPackageType === "monthly"
        ? await getMinimumActiveMonthlyAmountBdt()
        : 500;
    const validation = validateCustomAmount(
      body.customAmountBdt!,
      body.customPackageType,
      floor,
    );
    if (!validation.ok) {
      return bad(validation.reason);
    }
    perChargeAmountBdt = body.customAmountBdt!;
    packageTypeForRow = body.customPackageType;
  }

  // For child-scoped flows (subscription, prepaid-bundle, OR monthly
  // custom), childId is REQUIRED. For one-time flows childId is
  // optional (campaign donations have no child).
  const isMonthlyMode = packageTypeForRow === "monthly";
  if (isMonthlyMode && !body.childId) {
    return bad(
      "childId required for monthly subscriptions and prepaid bundles",
    );
  }

  const childIdNormalized: string | null = body.childId || null;

  // ── Queue race-guard (Session 58.2-overnight Task 1) ────────────────
  // Subscription mode (open-ended monthly) is the only path that
  // queues. One-time + prepaid-bundle either don't have a queue
  // concept (one-time) or are single-charge upfront (prepaid).
  //
  // Mirrors the pattern in /api/checkout/init/route.ts (~line 543):
  //   position = 0   → no active sponsor; this donor goes active
  //   position 1..3  → queued (sub created with trial_end pinned to
  //                     queued_starts_at; Stripe holds in 'trialing'
  //                     until the slot opens, then fires the first
  //                     invoice; SetupIntent captures the card today)
  //   position > 3   → queue is full; 409 conflict, donor is asked
  //                     to choose another child or give one-time
  //
  // The /sponsor page renders queue UI off a SNAPSHOT of queue
  // depth — two donors racing through can fill the slot between
  // page render and checkout. Re-check here as the canonical gate.
  type QueueSlot = {
    position: number;
    startsAt: Date | null;
    endsAt: Date | null;
  };
  let queueSlot: QueueSlot | null = null;
  const isOpenEndedSubscription =
    pkg !== null &&
    pkg.package_type === "monthly" &&
    pkg.duration_months === null;
  const isCustomMonthly =
    pkg === null && body.customPackageType === "monthly";
  const needsQueueCheck =
    (isOpenEndedSubscription || isCustomMonthly) && childIdNormalized;

  if (needsQueueCheck) {
    const slot = await computeNextQueueSlot(childIdNormalized);
    if (slot.position > QUEUE_DEPTH_LIMIT) {
      return NextResponse.json(
        {
          error: "queue_full",
          message:
            "This child's sponsor queue filled while you were checking out. Please try another child, or send a one-time gift instead.",
        },
        { status: 409 },
      );
    }
    // Open-ended subs leave endsAt null (the sub runs indefinitely).
    // Fixed-term subs would compute endsAt = startsAt + duration —
    // not relevant on this code path because the new model has no
    // fixed-term-subscription type (prepaid-bundle is its replacement).
    queueSlot = {
      position: slot.position,
      startsAt: slot.startsAt,
      endsAt: null,
    };
  }

  // Compose the full donation payload (donor amount, Stripe amount,
  // metadata, sponsorship draft).
  const payload = buildDonationPayload({
    pkg,
    rate,
    perChargeAmountBdt,
    childId: childIdNormalized,
    donorId: donor.id,
  });

  // Stripe customer.
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer({
    id: donor.id,
    email: donor.email,
    first_name: donor.first_name,
    last_name: donor.last_name,
    og_country: donor.og_country,
  });

  // Pre-write sponsorship row in pending_payment state so the
  // webhook has something to flip to active on success. Stripe refs
  // get attached in the second pass below.
  //
  // When queueSlot.position > 0, the row carries queue_position +
  // queued_starts_at so promoteQueue() can find it later, and the
  // status remains pending_payment until Stripe fires the invoice
  // at trial_end. The existing queue-promotion cron flips it to
  // active.
  const isQueued = Boolean(queueSlot && queueSlot.position > 0);
  const sponsorshipId = await writePendingSponsorship({
    ...payload.sponsorshipRowDraft,
    stripe_customer_id: customerId,
    ...(isQueued
      ? {
          queue_position: queueSlot!.position,
          queue_status: "queued",
          queued_starts_at: queueSlot!.startsAt
            ? queueSlot!.startsAt.toISOString()
            : null,
          queued_ends_at: queueSlot!.endsAt
            ? queueSlot!.endsAt.toISOString()
            : null,
        }
      : {}),
  });

  // Mode dispatch.
  try {
    if (payload.mode === "subscription") {
      // Open-ended monthly subscription, donor currency.
      //
      // Queue handling (Task 1): when isQueued, pin trial_end to the
      // donor's queued_starts_at — Stripe holds the sub in 'trialing'
      // state with no charge until that date, then fires the first
      // invoice. The donor still confirms a SetupIntent today to save
      // their card; that's the clientSecret returned. When the queue
      // slot opens, the existing promoteQueue cron flips the
      // sponsorship row to active and Stripe's trial_end fires the
      // invoice automatically.
      const product = await stripe.products.create({
        name: `Monthly sponsorship — ${donor.first_name ?? "Donor"}`,
        metadata: {
          donor_id: donor.id,
          child_id: childIdNormalized ?? "",
        },
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: payload.stripeAmount,
        currency: payload.stripeCurrency,
        recurring: { interval: "month" },
      });

      const trialEndSec =
        isQueued && queueSlot?.startsAt
          ? Math.floor(queueSlot.startsAt.getTime() / 1000)
          : undefined;

      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        // For queued subs Stripe creates pending_setup_intent in lieu
        // of latest_invoice; expand both so we can return whichever
        // one the donor needs to confirm today.
        expand: [
          "latest_invoice.confirmation_secret",
          "latest_invoice.payment_intent",
          "pending_setup_intent",
        ],
        ...(trialEndSec ? { trial_end: trialEndSec } : {}),
        metadata: {
          ...payload.metadata,
          sponsorship_id: sponsorshipId,
          ...(isQueued && queueSlot
            ? { queue_position: String(queueSlot.position) }
            : {}),
        },
      });

      await attachStripeRefs(sponsorshipId, {
        stripe_subscription_id: sub.id,
      });

      // Pick the right client_secret:
      //   - Unqueued: confirm the first invoice's PaymentIntent
      //     (pi_…_secret_…)
      //   - Queued (trialing): confirm the SetupIntent that Stripe
      //     auto-generated (seti_…_secret_…). The /sponsor +
      //     /donate clients already dispatch confirmCardSetup vs
      //     confirmCardPayment by prefix.
      let clientSecret: string | null = null;
      if (isQueued) {
        const psi = (sub as unknown as {
          pending_setup_intent?:
            | { client_secret?: string | null }
            | string
            | null;
        }).pending_setup_intent;
        if (psi && typeof psi !== "string") {
          clientSecret = psi.client_secret ?? null;
        }
      } else {
        const inv = sub.latest_invoice as
          | (Stripe_Invoice & {
              confirmation_secret?: { client_secret?: string } | null;
              payment_intent?: Stripe_PaymentIntent | string | null;
            })
          | string
          | null;
        clientSecret = extractInvoiceClientSecret(inv);
      }
      if (!clientSecret) {
        return bad(
          "Stripe subscription created but no client_secret returned",
          500,
        );
      }
      return NextResponse.json({
        mode: payload.mode,
        clientSecret,
        sponsorshipId,
        subscriptionId: sub.id,
        stripePublishableKey: getStripePublishableKey(),
        donorCurrency: rate.currency_code,
        donorAmount: payload.totalDonorAmount,
        amountBdtEquivalent: payload.totalBdt,
        // Queue state surfaced to client so /donate/success can
        // distinguish "you're sponsoring now" vs "you'll start on date".
        queuePosition: isQueued && queueSlot ? queueSlot.position : 0,
        queuedStartsAt:
          isQueued && queueSlot?.startsAt
            ? queueSlot.startsAt.toISOString()
            : null,
      });
    }

    if (payload.mode === "prepaid-bundle") {
      const pi = await stripe.paymentIntents.create({
        amount: payload.stripeAmount,
        currency: payload.stripeCurrency,
        customer: customerId,
        // Save the card for future off-session use (e.g. extension).
        setup_future_usage: "off_session",
        metadata: { ...payload.metadata, sponsorship_id: sponsorshipId },
      });
      await attachStripeRefs(sponsorshipId, {
        stripe_payment_intent_id: pi.id,
      });
      if (!pi.client_secret) {
        return bad("Stripe PaymentIntent created but no client_secret", 500);
      }
      return NextResponse.json({
        mode: payload.mode,
        clientSecret: pi.client_secret,
        sponsorshipId,
        stripePublishableKey: getStripePublishableKey(),
        donorCurrency: rate.currency_code,
        donorAmount: payload.totalDonorAmount,
        amountBdtEquivalent: payload.totalBdt,
      });
    }

    // one-time
    const pi = await stripe.paymentIntents.create({
      amount: payload.stripeAmount,
      currency: payload.stripeCurrency,
      customer: customerId,
      setup_future_usage: "off_session",
      metadata: { ...payload.metadata, sponsorship_id: sponsorshipId },
    });
    await attachStripeRefs(sponsorshipId, {
      stripe_payment_intent_id: pi.id,
    });
    if (!pi.client_secret) {
      return bad("Stripe PaymentIntent created but no client_secret", 500);
    }
    return NextResponse.json({
      mode: payload.mode,
      clientSecret: pi.client_secret,
      sponsorshipId,
      stripePublishableKey: getStripePublishableKey(),
      donorCurrency: rate.currency_code,
      donorAmount: payload.totalDonorAmount,
      amountBdtEquivalent: payload.totalBdt,
    });
  } catch (err) {
    // Stripe failures leave the pending sponsorship row behind. A
    // follow-up cron (existing pattern) reaps stale pendings; we
    // don't try to delete here because the row may already have a
    // partial Stripe ref attached.
    const message =
      err instanceof Error ? err.message : "Stripe request failed";
    console.error("[/api/donate/init] Stripe error:", message);
    return bad(message, 500);
  }
}

// Local minimal Stripe types to avoid pulling the full SDK type into
// the route's surface area. The route only touches a few fields.
type Stripe_Invoice = {
  payment_intent?: Stripe_PaymentIntent | string | null;
  confirmation_secret?: { client_secret?: string } | null;
};
type Stripe_PaymentIntent = {
  client_secret?: string | null;
};

function extractInvoiceClientSecret(
  inv:
    | (Stripe_Invoice & {
        confirmation_secret?: { client_secret?: string } | null;
        payment_intent?: Stripe_PaymentIntent | string | null;
      })
    | string
    | null,
): string | null {
  if (!inv || typeof inv === "string") return null;
  const newer = inv.confirmation_secret?.client_secret ?? null;
  if (newer) return newer;
  const pi = inv.payment_intent;
  if (!pi || typeof pi === "string") return null;
  return pi.client_secret ?? null;
}
