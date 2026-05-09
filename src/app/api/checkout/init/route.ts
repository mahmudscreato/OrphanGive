import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteItem, readUser, updateUser } from "@directus/sdk";
import type Stripe from "stripe";
import { directusServer } from "@/lib/directus";
import { getCurrentDonor, getDonorState, type Donor } from "@/lib/donor-data";
import {
  hydrateCart,
  isChildAvailable,
  readCart,
  type HydratedCartItem,
} from "@/lib/cart-data";
import { calculateScheduledEndDate } from "@/lib/pricing";
import { getStripe, getStripePublishableKey } from "@/lib/stripe-client";
import {
  createPendingSponsorship,
  getRecentPendingForDonor,
  updateSponsorship,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import { computeNextQueueSlot, QUEUE_DEPTH_LIMIT } from "@/lib/queue";

export const runtime = "nodejs";

// Window during which a pending sponsorship is considered "fresh" enough
// to reuse on /checkout refresh. Older than this → re-issue.
const REUSE_WINDOW_MS = 30 * 60_000;

// ─── Fingerprint helpers ────────────────────────────────────────────────────
// Stable hash of cart contents. Same children + amounts + modes + duration +
// schedule → same hash, regardless of cart-add order. Changing any of those
// fields between attempts forces a fresh checkout (the previous pending
// sponsorships get cancelled with reason='abandoned' before new ones are
// created).
function fingerprintCart(items: ReadonlyArray<HydratedCartItem>): string {
  const normalized = items
    .map((i) => ({
      childId: i.childId,
      paymentMode: i.paymentMode,
      amountUsd: i.amountUsd,
      durationMonths: i.durationMonths ?? null,
      paymentSchedule: i.paymentSchedule ?? null,
      // Cause is part of the fingerprint so changing it between
      // checkout attempts forces a fresh sponsorship row (the old
      // pending row gets cancelled with reason='abandoned').
      cause: i.cause,
      // Visibility (Session 14.6) is also part of the fingerprint —
      // a donor toggling named ↔ anonymous mid-checkout should
      // produce a fresh row whose Stripe metadata reflects the new
      // choice. Otherwise the donor name on activation emails could
      // disagree with what's stored on the sponsorship row.
      visibility: i.visibility,
    }))
    .sort((a, b) => {
      if (a.childId !== b.childId) return a.childId < b.childId ? -1 : 1;
      if (a.paymentMode !== b.paymentMode) return a.paymentMode < b.paymentMode ? -1 : 1;
      if ((a.durationMonths ?? -1) !== (b.durationMonths ?? -1)) {
        return (a.durationMonths ?? -1) - (b.durationMonths ?? -1);
      }
      if ((a.paymentSchedule ?? "") !== (b.paymentSchedule ?? "")) {
        return (a.paymentSchedule ?? "") < (b.paymentSchedule ?? "") ? -1 : 1;
      }
      if (a.cause !== b.cause) return a.cause < b.cause ? -1 : 1;
      if (a.visibility !== b.visibility) return a.visibility < b.visibility ? -1 : 1;
      return a.amountUsd - b.amountUsd;
    });
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

// ─── Stripe Customer reuse ──────────────────────────────────────────────────
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
  const existingId = userRow?.og_stripe_customer_id ?? null;

  if (existingId) {
    try {
      const c = await stripe.customers.retrieve(existingId);
      if (!c.deleted) return existingId;
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

// ─── Reuse path: revive existing pending sponsorships ───────────────────────
// We dispatch by Stripe-object kind, not payment_mode: a row with a
// stripe_subscription_id is a Subscription (indefinite or fixed-term),
// a row with only stripe_payment_intent_id is a PaymentIntent (one-time
// or monthly_prepaid). Each PI can be shared across multiple sponsorship
// rows (one-time bundle), so we dedup PI lookups.
async function tryReusePendings(
  stripe: Stripe,
  pendings: Sponsorship[],
): Promise<{ clientSecrets: string[]; sponsorshipIds: string[] } | null> {
  const clientSecrets: string[] = [];
  const sponsorshipIds: string[] = [];
  const seenPI = new Set<string>();

  for (const s of pendings) {
    sponsorshipIds.push(s.id);

    if (s.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id, {
          expand: ["latest_invoice.confirmation_secret", "latest_invoice.payment_intent"],
        });
        if (sub.status !== "incomplete") return null;
        const inv = sub.latest_invoice as Stripe.Invoice | string | null;
        if (!inv || typeof inv === "string") return null;
        const cs = extractClientSecret(inv);
        if (!cs) return null;
        clientSecrets.push(cs);
      } catch {
        return null;
      }
    } else if (s.stripe_payment_intent_id) {
      const piId = s.stripe_payment_intent_id;
      if (seenPI.has(piId)) continue;
      seenPI.add(piId);
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const reusable =
          pi.status === "requires_payment_method" ||
          pi.status === "requires_confirmation" ||
          pi.status === "requires_action";
        if (!reusable) return null;
        if (!pi.client_secret) return null;
        clientSecrets.push(pi.client_secret);
      } catch {
        return null;
      }
    } else {
      // No Stripe ref at all — can't reuse.
      return null;
    }
  }

  return { clientSecrets, sponsorshipIds };
}

// Pull a usable client_secret out of a Stripe Invoice. Stripe moved this
// from `payment_intent.client_secret` (older API) to
// `confirmation_secret.client_secret` (Dahlia). Try new first, then old.
function extractClientSecret(inv: Stripe.Invoice): string | null {
  const newer =
    (inv as unknown as { confirmation_secret?: { client_secret?: string } })
      .confirmation_secret?.client_secret ?? null;
  if (newer) return newer;
  const piRef = (inv as unknown as {
    payment_intent?: Stripe.PaymentIntent | string | null;
  }).payment_intent;
  if (!piRef || typeof piRef === "string") return null;
  return piRef.client_secret ?? null;
}

// ─── Cancel path: kill stale pendings before creating new ones ──────────────
//
// Stale-checkout cleanup: when a donor's cart fingerprint changes
// (e.g. they added/removed items, or the schema added a new
// fingerprint contributor like `cause`), the previously-created
// Stripe objects are stale. We cancel them best-effort. NEVER
// cancel objects in a terminal state — succeeded PIs represent
// real payments, canceled subs/PIs are already gone. Always
// retrieve-then-check before cancel.
//
// Discovered the hard way in Session 14.5: adding `cause` to the
// cart fingerprint reclassified pre-14.5 in-flight checkouts as
// stale. Some of those PIs had already succeeded and tripped the
// `payment_intent_unexpected_state` error from Stripe.
//
// Same dispatch as the reuse path: subscription_id → cancel sub,
// payment_intent_id → cancel PI (deduped).

// PaymentIntents in any of these states accept a cancel call.
// Anything else (succeeded, canceled) is terminal — leave alone.
const CANCELLABLE_PI_STATES: ReadonlySet<string> = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
]);

// Subscription Stripe statuses where the donor has paid and the sub
// is running. We do NOT cancel these in cleanup — the donor's
// payment is real and the subscription will keep charging. We just
// reconcile our row to status='active'.
const PAID_SUB_STATES: ReadonlySet<string> = new Set(["active", "trialing"]);

// Subscription statuses where the sub is already gone. No cancel
// call needed (Stripe would reject) — just mark the row cancelled.
const TERMINAL_SUB_STATES: ReadonlySet<string> = new Set([
  "canceled",
  "incomplete_expired",
]);

// The Directus field shape we patch onto a stale sponsorship row.
// `status` is the only required key; the others are conditional
// based on which Stripe object owned this row.
type RowPatch = {
  status: "active" | "completed" | "cancelled";
  cancelled_at?: string;
  cancellation_reason?: string;
  stripe_payment_intent_id?: null;
  stripe_subscription_id?: null;
};

// Resolves a stale PaymentIntent against Stripe and returns the
// Directus patch to apply to every sponsorship row that referenced
// this PI. Behaviour is the THREE-branch reconciliation locked in
// during 14.5 hardening:
//
//   succeeded   → donor paid; finalize row as 'completed' so it
//                 stays as a payment record, clear the PI
//                 reference so it doesn't hold the unique slot.
//   canceled    → already gone; mark row cancelled, clear ref.
//   cancellable → cancel the PI now, mark row cancelled, clear ref.
//   not found   → PI vanished from Stripe; mark row cancelled with
//                 a forensic reason, clear ref.
//   anything else (defensive) → log loudly, mark cancelled, clear ref.
async function reconcilePaymentIntent(
  stripe: Stripe,
  piId: string,
): Promise<RowPatch> {
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(piId);
  } catch (e) {
    console.warn(
      `[checkout/init] PI ${piId} not found in Stripe; clearing orphaned reference`,
      e instanceof Error ? e.message : e,
    );
    return {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "orphaned_pi_not_found",
      stripe_payment_intent_id: null,
    };
  }

  if (pi.status === "succeeded") {
    console.warn(
      `[checkout/init] PI ${piId} already succeeded; finalizing row as completed`,
    );
    return {
      status: "completed",
      cancellation_reason: "orphaned_succeeded_pre_finalization",
      stripe_payment_intent_id: null,
    };
  }

  if (pi.status === "canceled") {
    console.warn(
      `[checkout/init] PI ${piId} already canceled in Stripe; clearing reference`,
    );
    return {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "abandoned",
      stripe_payment_intent_id: null,
    };
  }

  if (CANCELLABLE_PI_STATES.has(pi.status)) {
    try {
      await stripe.paymentIntents.cancel(piId);
    } catch (e) {
      console.warn(
        `[checkout/init] cancel pi ${piId} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
    return {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "abandoned",
      stripe_payment_intent_id: null,
    };
  }

  console.error(
    `[checkout/init] PI ${piId} in unexpected state ${pi.status}; clearing reference defensively`,
  );
  return {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancellation_reason: "unexpected_pi_state",
    stripe_payment_intent_id: null,
  };
}

// Same three-branch reconciliation for subscriptions. "Paid" states
// (active / trialing) leave the sub running in Stripe and finalize
// our row as 'active'. Terminal states (canceled / incomplete_expired)
// skip the cancel call. Anything else cancels in Stripe.
async function reconcileSubscription(
  stripe: Stripe,
  subId: string,
): Promise<RowPatch> {
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subId);
  } catch (e) {
    console.warn(
      `[checkout/init] sub ${subId} not found in Stripe; clearing orphaned reference`,
      e instanceof Error ? e.message : e,
    );
    return {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "orphaned_sub_not_found",
      stripe_subscription_id: null,
    };
  }

  if (PAID_SUB_STATES.has(sub.status)) {
    console.warn(
      `[checkout/init] sub ${subId} is ${sub.status} (donor paid); finalizing row as active`,
    );
    return {
      status: "active",
      cancellation_reason: "orphaned_active_pre_finalization",
      stripe_subscription_id: null,
    };
  }

  if (TERMINAL_SUB_STATES.has(sub.status)) {
    console.warn(
      `[checkout/init] sub ${subId} already ${sub.status}; clearing reference`,
    );
    return {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "abandoned",
      stripe_subscription_id: null,
    };
  }

  try {
    await stripe.subscriptions.cancel(subId);
  } catch (e) {
    console.warn(
      `[checkout/init] cancel sub ${subId} failed:`,
      e instanceof Error ? e.message : e,
    );
  }
  return {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancellation_reason: "abandoned",
    stripe_subscription_id: null,
  };
}

async function cancelPendings(
  stripe: Stripe,
  pendings: Sponsorship[],
): Promise<void> {
  // One-time bundles share a PI across N rows. Cache the PI outcome
  // so we only hit Stripe once per distinct PI; every row that
  // references the PI gets the same patch applied to its row.
  const piPatchCache = new Map<string, RowPatch>();

  for (const s of pendings) {
    let patch: RowPatch = {
      // Default for the rare row that has neither a sub_id nor a
      // PI id (shouldn't happen with current creation paths, but
      // be defensive — mark cancelled rather than leave dangling).
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "abandoned",
    };

    if (s.stripe_subscription_id) {
      patch = {
        ...patch,
        ...(await reconcileSubscription(stripe, s.stripe_subscription_id)),
      };
    }

    if (s.stripe_payment_intent_id) {
      const piId = s.stripe_payment_intent_id;
      let piPatch = piPatchCache.get(piId);
      if (!piPatch) {
        piPatch = await reconcilePaymentIntent(stripe, piId);
        piPatchCache.set(piId, piPatch);
      }
      patch = { ...patch, ...piPatch };
    }

    try {
      await updateSponsorship(s.id, patch);
    } catch (e) {
      console.warn(
        `[checkout/init] reconcile row ${s.id} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

// ─── Cart-item bucketing ────────────────────────────────────────────────────
type ItemBuckets = {
  // Recurring monthly subscriptions (indefinite or fixed-term).
  recurringSubItems: HydratedCartItem[];
  // Single-charge prepaid bundles — one PI per item.
  prepaidItems: HydratedCartItem[];
  // One-time gifts — bundled into one shared PI.
  oneTimeItems: HydratedCartItem[];
};

function bucketItems(items: ReadonlyArray<HydratedCartItem>): ItemBuckets {
  const buckets: ItemBuckets = {
    recurringSubItems: [],
    prepaidItems: [],
    oneTimeItems: [],
  };
  for (const it of items) {
    if (it.paymentMode === "one_time") {
      buckets.oneTimeItems.push(it);
    } else if (it.paymentSchedule === "monthly_prepaid") {
      buckets.prepaidItems.push(it);
    } else {
      // monthly recurring (indefinite or fixed-term-with-cancel_at)
      buckets.recurringSubItems.push(it);
    }
  }
  return buckets;
}

// ─── POST handler ───────────────────────────────────────────────────────────
export async function POST() {
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDonorState(donor) !== "approved") {
    return NextResponse.json(
      { error: "Account is not approved for payments yet." },
      { status: 403 },
    );
  }

  const cart = await readCart();
  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }
  for (const item of cart.items) {
    if (!(await isChildAvailable(item.childId))) {
      return NextResponse.json(
        { error: "One of the children in your cart is no longer available. Please review your cart." },
        { status: 400 },
      );
    }
  }

  // ── Queue race guard (Session 14.7, replaces 14.6 child-lock) ───────
  // Each monthly cart item resolves to a queue slot:
  //   position = 0  → no active sponsor; this donor becomes active
  //   position = 1..QUEUE_DEPTH_LIMIT → queued (pay upfront, activates later)
  //   position > QUEUE_DEPTH_LIMIT    → queue is full; reject the checkout
  //
  // The /sponsor page renders state based on a snapshot of the queue
  // depth, but two donors racing through simultaneously (or this
  // donor pausing between sponsor-flow and checkout) can lead to
  // the slot filling before this point. Re-check here as the
  // canonical gate. The slot we compute is also threaded into sub +
  // PI creation so the row carries queue_position / queued_starts_at
  // / queued_ends_at and Stripe gets trial_end on the sub.
  type QueueAssignment = {
    position: number;
    startsAt: Date | null;
    endsAt: Date | null;
  };
  const queueByChild = new Map<string, QueueAssignment>();
  for (const item of cart.items) {
    if (item.paymentMode !== "monthly") continue;
    const slot = await computeNextQueueSlot(item.childId);
    if (slot.position > QUEUE_DEPTH_LIMIT) {
      return NextResponse.json(
        {
          error: "queue_full",
          message:
            "This child's sponsor queue filled while you were checking out. Please remove this item or send a one-time gift instead.",
          childIds: [item.childId],
        },
        { status: 409 },
      );
    }
    // Compute this donor's end date from their committed duration.
    // Indefinite subs (durationMonths=null) leave endsAt null.
    let endsAt: Date | null = null;
    const duration = item.durationMonths ?? null;
    if (slot.startsAt && duration && duration > 0) {
      endsAt = addMonthsCal(slot.startsAt, duration);
    }
    queueByChild.set(item.childId, {
      position: slot.position,
      startsAt: slot.startsAt,
      endsAt,
    });
  }

  const hydrated = await hydrateCart(cart);

  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured on the server. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (and STRIPE_SECRET_KEY) to .env.local.",
      },
      { status: 500 },
    );
  }
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe init failed." },
      { status: 500 },
    );
  }

  const fingerprint = fingerprintCart(hydrated.items);

  // ─── Idempotency: try to reuse recent pendings ──────────────────────
  const recentPendings = await getRecentPendingForDonor(donor.id, REUSE_WINDOW_MS);
  const matching = recentPendings.filter(
    (s) => s.checkout_fingerprint === fingerprint,
  );
  const stale = recentPendings.filter(
    (s) => s.checkout_fingerprint !== fingerprint,
  );

  if (matching.length > 0) {
    // Order: subs first, then prepaid PIs, then one-time PI. Matches the
    // creation order so client iterates clientSecrets in a predictable
    // sequence.
    matching.sort((a, b) => {
      const ak = sortKey(a);
      const bk = sortKey(b);
      if (ak !== bk) return ak - bk;
      return (a.date_created ?? "").localeCompare(b.date_created ?? "");
    });
    const reused = await tryReusePendings(stripe, matching);
    if (reused) {
      if (stale.length > 0) await cancelPendings(stripe, stale);
      return NextResponse.json({
        clientSecrets: reused.clientSecrets,
        sponsorshipIds: reused.sponsorshipIds,
        stripePublishableKey: publishableKey,
        monthlyTotal: hydrated.monthlyRecurringTotal,
        oneTimeTotal: hydrated.oneTimeTotal,
        reused: true,
      });
    }
    stale.push(...matching);
  }

  if (stale.length > 0) await cancelPendings(stripe, stale);

  return await createFreshCheckout({
    donor,
    hydrated,
    fingerprint,
    publishableKey,
    stripe,
    queueByChild,
  });
}

// 30.44-day month convention shared with src/lib/queue.ts and
// src/lib/pricing.ts. Used in the queue race-guard above to compute
// each donor's queued_ends_at from their queued_starts_at + duration.
const DAYS_PER_MONTH = 30.44;
function addMonthsCal(base: Date, months: number): Date {
  const ms = months * DAYS_PER_MONTH * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ms);
}

// 0 = subscription (recurring), 1 = prepaid PI, 2 = one-time PI bundle.
function sortKey(s: Sponsorship): number {
  if (s.stripe_subscription_id) return 0;
  if (s.payment_schedule === "monthly_prepaid") return 1;
  return 2;
}

// ─── Create fresh ───────────────────────────────────────────────────────────
async function createFreshCheckout(opts: {
  donor: Donor;
  hydrated: Awaited<ReturnType<typeof hydrateCart>>;
  fingerprint: string;
  publishableKey: string;
  stripe: Stripe;
  // Session 14.7 — per-child queue assignments computed by the
  // race-guard above. Keys are childIds present in the cart's
  // monthly items. position=0 means this donor takes the active
  // slot (no queue); position>0 means queue join (recurring subs
  // get trial_end pinned to startsAt; prepaid PIs charge today
  // and the row carries queued_*).
  queueByChild: Map<
    string,
    { position: number; startsAt: Date | null; endsAt: Date | null }
  >;
}) {
  const { donor, hydrated, fingerprint, publishableKey, stripe, queueByChild } =
    opts;

  const created: {
    subscriptionIds: string[];
    paymentIntentIds: string[];
    sponsorshipIds: string[];
  } = { subscriptionIds: [], paymentIntentIds: [], sponsorshipIds: [] };

  try {
    const customerId = await ensureStripeCustomer({
      id: donor.id,
      email: donor.email,
      first_name: donor.first_name,
      last_name: donor.last_name,
      og_country: donor.og_country,
    });

    const buckets = bucketItems(hydrated.items);
    const clientSecrets: string[] = [];
    const sponsorshipIds: string[] = [];

    // ── (1) Recurring subscriptions: indefinite OR fixed-term-with-cancel_at
    for (const item of buckets.recurringSubItems) {
      const product = await stripe.products.create({
        name: `Sponsorship: ${item.display_name ?? "Child"}`,
        metadata: { child_id: item.childId, donor_id: donor.id },
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(item.amountUsd * 100),
        currency: "usd",
        recurring: { interval: "month" },
      });

      // Queue context (Session 14.7). When position>0, we pin
      // trial_end to the donor's queued_starts_at — Stripe holds the
      // sub in 'trialing' state with no charge until that date, then
      // fires the first invoice. cancel_at (for fixed-term) shifts
      // accordingly to queued_ends_at.
      const slot = queueByChild.get(item.childId);
      const isQueued = Boolean(slot && slot.position > 0);
      const trialEndSec =
        isQueued && slot!.startsAt
          ? Math.floor(slot!.startsAt.getTime() / 1000)
          : undefined;

      // For fixed-term: tell Stripe to auto-cancel at end of N months.
      // For an active (non-queued) sub: end = today + duration.
      // For a queued sub: end = queued_starts_at + duration. The queue
      // race-guard above pre-computed queued_ends_at into slot.endsAt.
      const isFixedTerm = item.durationMonths != null;
      let cancelAt: number | undefined;
      if (isFixedTerm) {
        if (isQueued && slot!.endsAt) {
          cancelAt = Math.floor(slot!.endsAt.getTime() / 1000);
        } else if (!isQueued) {
          cancelAt = Math.floor(
            calculateScheduledEndDate(item.durationMonths!)!.getTime() / 1000,
          );
        }
      }

      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        // For queued subs (trial_end set), Stripe doesn't generate a
        // latest_invoice until trial ends — instead it creates a
        // pending_setup_intent that the donor confirms today to save
        // their card. Expand both so we can pick the right one.
        expand: [
          "latest_invoice.confirmation_secret",
          "latest_invoice.payment_intent",
          "pending_setup_intent",
        ],
        ...(cancelAt ? { cancel_at: cancelAt } : {}),
        ...(trialEndSec ? { trial_end: trialEndSec } : {}),
        metadata: {
          donor_id: donor.id,
          child_id: item.childId,
          sponsorship_pending: "true",
          cause: item.cause,
          visibility: item.visibility,
          ...(isFixedTerm
            ? { duration_months: String(item.durationMonths) }
            : {}),
          ...(isQueued ? { queue_position: String(slot!.position) } : {}),
        },
      });
      created.subscriptionIds.push(sub.id);

      // For active subs, scheduled_end_date is set today (today + duration).
      // For queued subs, we leave scheduled_end_date null — that field
      // describes the CURRENT supporting period, which doesn't exist
      // yet. Instead, queued_starts_at + queued_ends_at carry the
      // future-window. promoteQueue copies queued_ends_at → scheduled_end_date
      // when this row promotes to position=0.
      const scheduledEnd =
        !isQueued && item.durationMonths != null
          ? calculateScheduledEndDate(item.durationMonths)?.toISOString() ?? null
          : null;

      const { id: sponsorshipId } = await createPendingSponsorship({
        donor: donor.id,
        child: item.childId,
        payment_mode: "monthly",
        amount_usd: item.amountUsd,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        checkout_fingerprint: fingerprint,
        duration_months: item.durationMonths ?? null,
        payment_schedule: "monthly",
        scheduled_end_date: scheduledEnd,
        cause: item.cause,
        visibility: item.visibility,
        ...(isQueued
          ? {
              queue_position: slot!.position,
              queue_status: "queued",
              queued_starts_at: slot!.startsAt
                ? slot!.startsAt.toISOString()
                : null,
              queued_ends_at: slot!.endsAt
                ? slot!.endsAt.toISOString()
                : null,
            }
          : {}),
      });
      created.sponsorshipIds.push(sponsorshipId);
      sponsorshipIds.push(sponsorshipId);

      // Pick the right clientSecret for this sub:
      //   - Active (non-queued): confirm the first invoice's
      //     PaymentIntent (existing behaviour). client_secret has
      //     the `pi_…_secret_…` shape.
      //   - Queued (trialing): confirm the SetupIntent that Stripe
      //     auto-generated on the sub. client_secret has the
      //     `seti_…_secret_…` shape. The client-side StripePaymentSection
      //     dispatches confirm{Card}Setup vs confirm{Card}Payment by
      //     prefix.
      if (isQueued) {
        const psi = sub.pending_setup_intent as
          | Stripe.SetupIntent
          | string
          | null;
        const cs =
          psi && typeof psi !== "string" ? psi.client_secret ?? null : null;
        if (cs) clientSecrets.push(cs);
      } else {
        const inv = sub.latest_invoice as Stripe.Invoice | string | null;
        if (inv && typeof inv !== "string") {
          const cs = extractClientSecret(inv);
          if (cs) clientSecrets.push(cs);
        }
      }
    }

    // ── (2) Prepaid bundles: one PaymentIntent per item, no Subscription
    // We persist the PER-MONTH rate in amount_usd (so the dashboard can
    // show "$25/mo prepaid for 6 months"), but the PI charges
    // amount × months upfront. When the PI succeeds, the webhook marks
    // the single sponsorship row active.
    for (const item of buckets.prepaidItems) {
      const months = item.durationMonths!;
      const totalCents = Math.round(item.amountUsd * months * 100);

      // Queue context for prepaid items: position>0 means the donor
      // pays full upfront NOW (PI fires immediately) but the support
      // window is the queued_starts_at..queued_ends_at range, not
      // today..today+months. scheduled_end_date stays null until
      // promoteQueue copies queued_ends_at over.
      const slotPrep = queueByChild.get(item.childId);
      const isQueuedPrep = Boolean(slotPrep && slotPrep.position > 0);
      const scheduledEnd = !isQueuedPrep
        ? calculateScheduledEndDate(months)?.toISOString() ?? null
        : null;

      // Create the sponsorship row first so we can stamp its id into the
      // PaymentIntent metadata — the webhook uses that to find the row
      // without needing to look up by PI id (cheaper and unambiguous).
      // We create with a placeholder PI id that we'll patch after.
      const { id: sponsorshipId } = await createPendingSponsorship({
        donor: donor.id,
        child: item.childId,
        payment_mode: "monthly", // schema enum stays 'monthly'
        amount_usd: item.amountUsd, // per-month rate, NOT the total
        stripe_payment_intent_id: null, // patched after PI created
        stripe_customer_id: customerId,
        checkout_fingerprint: fingerprint,
        duration_months: months,
        payment_schedule: "monthly_prepaid",
        prepaid_months_total: months,
        prepaid_months_remaining: months,
        scheduled_end_date: scheduledEnd,
        cause: item.cause,
        visibility: item.visibility,
        ...(isQueuedPrep
          ? {
              queue_position: slotPrep!.position,
              queue_status: "queued",
              queued_starts_at: slotPrep!.startsAt
                ? slotPrep!.startsAt.toISOString()
                : null,
              queued_ends_at: slotPrep!.endsAt
                ? slotPrep!.endsAt.toISOString()
                : null,
            }
          : {}),
      });
      created.sponsorshipIds.push(sponsorshipId);
      sponsorshipIds.push(sponsorshipId);

      const pi = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        // Saves the donor's card to their Stripe Customer as a reusable
        // payment method. Required for /api/sponsorship/[id]/extend to
        // be able to charge off-session for prepaid extensions later.
        setup_future_usage: "off_session",
        metadata: {
          donor_id: donor.id,
          payment_mode: "monthly_prepaid",
          child_id: item.childId,
          sponsorship_id: sponsorshipId,
          duration_months: String(months),
          monthly_amount_usd: String(item.amountUsd),
          cause: item.cause,
          visibility: item.visibility,
        },
      });
      created.paymentIntentIds.push(pi.id);

      // Patch the sponsorship row with its PI id.
      await updateSponsorship(sponsorshipId, {
        stripe_payment_intent_id: pi.id,
      });

      if (pi.client_secret) clientSecrets.push(pi.client_secret);
    }

    // ── (3) One-time gifts: single PaymentIntent for the sum
    if (buckets.oneTimeItems.length > 0) {
      const sumCents = buckets.oneTimeItems.reduce(
        (acc, it) => acc + Math.round(it.amountUsd * 100),
        0,
      );
      const pi = await stripe.paymentIntents.create({
        amount: sumCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        // Save the card on this customer for future off-session charges
        // (e.g. extension flow). Same rationale as the prepaid PI above.
        setup_future_usage: "off_session",
        metadata: {
          donor_id: donor.id,
          payment_mode: "one_time",
          child_ids: buckets.oneTimeItems.map((i) => i.childId).join(","),
          one_time_sponsorship_count: String(buckets.oneTimeItems.length),
          // Comma-separated parallel to child_ids — items[i].cause
          // belongs to items[i].childId. Per-row cause is also written
          // to each sponsorship row below.
          causes: buckets.oneTimeItems.map((i) => i.cause).join(","),
          // Same parallel-array pattern for visibility (Session 14.6).
          // items[i].visibility belongs to items[i].childId.
          visibilities: buckets.oneTimeItems.map((i) => i.visibility).join(","),
        },
      });
      created.paymentIntentIds.push(pi.id);

      for (const item of buckets.oneTimeItems) {
        const { id: sponsorshipId } = await createPendingSponsorship({
          donor: donor.id,
          child: item.childId,
          payment_mode: "one_time",
          amount_usd: item.amountUsd,
          stripe_payment_intent_id: pi.id,
          stripe_customer_id: customerId,
          checkout_fingerprint: fingerprint,
          cause: item.cause,
          visibility: item.visibility,
          // No duration / schedule fields for one-time.
        });
        created.sponsorshipIds.push(sponsorshipId);
        sponsorshipIds.push(sponsorshipId);
      }

      if (pi.client_secret) clientSecrets.push(pi.client_secret);
    }

    return NextResponse.json({
      clientSecrets,
      sponsorshipIds,
      stripePublishableKey: publishableKey,
      monthlyTotal: hydrated.monthlyRecurringTotal,
      oneTimeTotal: hydrated.oneTimeTotal,
      reused: false,
    });
  } catch (err) {
    console.error("[checkout/init] failed, rolling back:", err);
    await Promise.all([
      ...created.subscriptionIds.map((id) =>
        getStripe().subscriptions.cancel(id).catch((e) =>
          console.warn(`rollback sub ${id}:`, e),
        ),
      ),
      ...created.paymentIntentIds.map((id) =>
        getStripe().paymentIntents.cancel(id).catch((e) =>
          console.warn(`rollback pi ${id}:`, e),
        ),
      ),
    ]);
    for (const sid of created.sponsorshipIds) {
      try {
        await directusServer().request(
          deleteItem("sponsorship" as never, sid as never),
        );
      } catch {
        /* non-fatal */
      }
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout init failed." },
      { status: 500 },
    );
  }
}
