import Stripe from "stripe";

// Lazy-init the Stripe SDK so missing env vars don't crash at module load
// (e.g. during Next.js's static analysis or tsc). Routes that need Stripe
// throw a clear 500 when called without keys configured.

let cachedClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local before using Stripe-backed routes.",
    );
  }
  cachedClient = new Stripe(key, {
    // Pin a known-stable API version. Bump intentionally when you migrate
    // (Stripe's SDK reminds you when a newer one is available).
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
    appInfo: {
      name: "OrphanGive",
      url: "https://orphangive.org",
    },
  });
  return cachedClient;
}

export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

export function getStripeWebhookSecret(): string {
  const v = process.env.STRIPE_WEBHOOK_SECRET;
  if (!v) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. Required for /api/webhooks/stripe.",
    );
  }
  return v;
}

// USD → BDT preview rate. Indicative only, used in checkout copy. Not
// charged in BDT (Stripe charges in USD).
export function getUsdToBdtRate(): number {
  const v = process.env.NEXT_PUBLIC_USD_TO_BDT_RATE;
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 109; // sensible default
}

// Session 58.3.2 — Stripe forbids a single Customer holding objects
// in multiple currencies ("You cannot combine currencies on a single
// customer"). Once a donor transacts, Stripe stamps the customer's
// `currency` field; all future PIs/subs/invoices must match it.
//
// This helper reads `customer.currency` so we can:
//   - Pre-lock the /sponsor + /donate currency picker at page load
//     (preventing the collision before it happens)
//   - Return a 409 from /api/donate/init as a safety net if a
//     race-condition got past the page-load lock
//
// Session 58.5 — defensive: customer.currency alone is NOT a
// reliable signal of "donor has transacted". Stripe can stamp it as
// a side effect of creating an incomplete Subscription, so a donor
// who clicked through the flow once but never completed payment
// ends up with currency set + zero successful charges → false
// positive lock.
//
// The fix: verify the customer has at least one SUCCESSFUL charge
// before treating their currency as a real lock signal. One extra
// Stripe call per page load (only for donors with a customer +
// currency set), but it correctly disambiguates "real donor" from
// "abandoned-flow donor".
//
// Returns UPPERCASE 3-letter ISO (e.g. "USD") only when the donor
// truly has a real-money transaction history. Returns null for:
//   - no customer id
//   - deleted / missing customer
//   - customer with no currency set yet
//   - customer with currency set but ZERO successful charges
//     (the false-positive case)
//   - any network / SDK error (safe default: not locked)
export async function getStripeCustomerLockedCurrency(
  stripeCustomerId: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  try {
    const stripe = getStripe();
    const c = await stripe.customers.retrieve(stripeCustomerId);
    if (c.deleted) return null;
    const raw = (c as { currency?: string | null }).currency ?? null;
    if (!raw) return null;

    // Verify there's an actual successful charge before locking.
    // Pull a small window (10) — if none of the most recent charges
    // succeeded, the customer hasn't truly transacted. limit=10 is
    // enough to cover edge cases (e.g. last few charges failed but
    // an earlier one succeeded). Single API call regardless.
    const charges = await stripe.charges.list({
      customer: stripeCustomerId,
      limit: 10,
    });
    const hasSucceeded = charges.data.some(
      (ch) => ch.status === "succeeded",
    );
    if (!hasSucceeded) return null;

    return raw.toUpperCase();
  } catch {
    return null;
  }
}
