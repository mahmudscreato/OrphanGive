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
import { getStripe, getStripePublishableKey } from "@/lib/stripe-client";
import {
  createPendingSponsorship,
  getRecentPendingForDonor,
  updateSponsorship,
  type Sponsorship,
} from "@/lib/sponsorship-data";

export const runtime = "nodejs";

// Window during which a pending sponsorship is considered "fresh" enough
// to reuse on /checkout refresh. Older than this → re-issue.
const REUSE_WINDOW_MS = 30 * 60_000;

// ─── Fingerprint helpers ────────────────────────────────────────────────────
// Stable hash of cart contents. Same children + amounts + modes → same hash,
// regardless of cart-add order.
function fingerprintCart(items: ReadonlyArray<HydratedCartItem>): string {
  const normalized = items
    .map((i) => ({
      childId: i.childId,
      paymentMode: i.paymentMode,
      amountUsd: i.amountUsd,
    }))
    .sort((a, b) => {
      if (a.childId !== b.childId) return a.childId < b.childId ? -1 : 1;
      if (a.paymentMode !== b.paymentMode) return a.paymentMode < b.paymentMode ? -1 : 1;
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
// Given a set of pending Sponsorship rows whose checkout_fingerprint matches
// the current cart, fetch their Stripe Subscription / PaymentIntent and
// pull a usable client_secret out. Returns null if any object can't be
// reused (e.g. expired, already paid, deleted) — caller falls through to
// the cancel-and-recreate path.
async function tryReusePendings(
  stripe: Stripe,
  pendings: Sponsorship[],
): Promise<{ clientSecrets: string[]; sponsorshipIds: string[] } | null> {
  const clientSecrets: string[] = [];
  const sponsorshipIds: string[] = [];
  // Dedup PI ids — multiple one_time sponsorships share one PaymentIntent.
  const seenPI = new Set<string>();

  for (const s of pendings) {
    sponsorshipIds.push(s.id);

    if (s.payment_mode === "monthly") {
      const subId = s.stripe_subscription_id;
      if (!subId) return null;
      try {
        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ["latest_invoice.confirmation_secret", "latest_invoice.payment_intent"],
        });
        // Only "incomplete" subscriptions are still awaiting first payment.
        if (sub.status !== "incomplete" && sub.status !== "incomplete_expired") {
          return null;
        }
        if (sub.status === "incomplete_expired") return null;
        const inv = sub.latest_invoice as Stripe.Invoice | string | null;
        if (!inv || typeof inv === "string") return null;
        const cs = extractClientSecret(inv);
        if (!cs) return null;
        clientSecrets.push(cs);
      } catch {
        return null;
      }
    } else {
      // one_time
      const piId = s.stripe_payment_intent_id;
      if (!piId) return null;
      if (seenPI.has(piId)) continue;
      seenPI.add(piId);
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        // Reusable PI states: still awaiting a payment method or action.
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
// Best-effort: for each sponsorship row, cancel its Stripe Subscription /
// PaymentIntent and mark the row 'cancelled'. PIs are deduped because
// multiple one_time rows share one PI.
async function cancelPendings(
  stripe: Stripe,
  pendings: Sponsorship[],
): Promise<void> {
  const cancelledPIs = new Set<string>();
  for (const s of pendings) {
    if (s.payment_mode === "monthly" && s.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(s.stripe_subscription_id);
      } catch (e) {
        console.warn(
          `[checkout/init] cancel sub ${s.stripe_subscription_id} failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    if (s.payment_mode === "one_time" && s.stripe_payment_intent_id) {
      const piId = s.stripe_payment_intent_id;
      if (!cancelledPIs.has(piId)) {
        cancelledPIs.add(piId);
        try {
          await stripe.paymentIntents.cancel(piId);
        } catch (e) {
          console.warn(
            `[checkout/init] cancel pi ${piId} failed:`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
    try {
      await updateSponsorship(s.id, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "abandoned",
      });
    } catch (e) {
      console.warn(
        `[checkout/init] mark cancelled ${s.id} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

// ─── POST handler ───────────────────────────────────────────────────────────
export async function POST() {
  // Auth
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

  // Cart
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
  const hydrated = await hydrateCart(cart);

  // Stripe configured?
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
    // Order matters: client expects clientSecrets in monthly-first, then
    // one-time order — same as the create path. Sort accordingly.
    matching.sort((a, b) => {
      if (a.payment_mode === b.payment_mode) {
        return (a.date_created ?? "").localeCompare(b.date_created ?? "");
      }
      return a.payment_mode === "monthly" ? -1 : 1;
    });
    const reused = await tryReusePendings(stripe, matching);
    if (reused) {
      // We're returning existing sponsorships unchanged; they keep
      // their fingerprint. Only stale pendings need cancellation.
      if (stale.length > 0) await cancelPendings(stripe, stale);
      return NextResponse.json({
        clientSecrets: reused.clientSecrets,
        sponsorshipIds: reused.sponsorshipIds,
        stripePublishableKey: publishableKey,
        monthlyTotal: hydrated.monthlyTotal,
        oneTimeTotal: hydrated.oneTimeTotal,
        reused: true,
      });
    }
    // Fingerprint matched but Stripe objects expired. Treat as stale.
    stale.push(...matching);
  }

  // Cancel anything stale before creating fresh objects.
  if (stale.length > 0) await cancelPendings(stripe, stale);

  // ─── Create fresh ───────────────────────────────────────────────────
  return await createFreshCheckout({
    donor,
    hydrated,
    fingerprint,
    publishableKey,
    stripe,
  });
}

async function createFreshCheckout(opts: {
  donor: Donor;
  hydrated: Awaited<ReturnType<typeof hydrateCart>>;
  fingerprint: string;
  publishableKey: string;
  stripe: Stripe;
}) {
  const { donor, hydrated, fingerprint, publishableKey, stripe } = opts;

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

    const monthlyItems = hydrated.items.filter((i) => i.paymentMode === "monthly");
    const oneTimeItems = hydrated.items.filter((i) => i.paymentMode === "one_time");

    const clientSecrets: string[] = [];
    const sponsorshipIds: string[] = [];

    // Monthly: one Subscription per item.
    for (const item of monthlyItems) {
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
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.confirmation_secret", "latest_invoice.payment_intent"],
        metadata: {
          donor_id: donor.id,
          child_id: item.childId,
          sponsorship_pending: "true",
        },
      });
      created.subscriptionIds.push(sub.id);

      const { id: sponsorshipId } = await createPendingSponsorship({
        donor: donor.id,
        child: item.childId,
        payment_mode: "monthly",
        amount_usd: item.amountUsd,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        checkout_fingerprint: fingerprint,
      });
      created.sponsorshipIds.push(sponsorshipId);
      sponsorshipIds.push(sponsorshipId);

      const inv = sub.latest_invoice as Stripe.Invoice | string | null;
      if (inv && typeof inv !== "string") {
        const cs = extractClientSecret(inv);
        if (cs) clientSecrets.push(cs);
      }
    }

    // One-time: single PaymentIntent for the sum.
    if (oneTimeItems.length > 0) {
      const sumCents = oneTimeItems.reduce(
        (acc, it) => acc + Math.round(it.amountUsd * 100),
        0,
      );
      const pi = await stripe.paymentIntents.create({
        amount: sumCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: {
          donor_id: donor.id,
          payment_mode: "one_time",
          child_ids: oneTimeItems.map((i) => i.childId).join(","),
          one_time_sponsorship_count: String(oneTimeItems.length),
        },
      });
      created.paymentIntentIds.push(pi.id);

      for (const item of oneTimeItems) {
        const { id: sponsorshipId } = await createPendingSponsorship({
          donor: donor.id,
          child: item.childId,
          payment_mode: "one_time",
          amount_usd: item.amountUsd,
          stripe_payment_intent_id: pi.id,
          stripe_customer_id: customerId,
          checkout_fingerprint: fingerprint,
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
      monthlyTotal: hydrated.monthlyTotal,
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
