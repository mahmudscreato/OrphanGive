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
// Returns UPPERCASE 3-letter ISO (e.g. "USD") or null when the
// customer has no currency yet (brand-new donors) or the customer
// id doesn't resolve (deleted / wrong env / network error). All
// failures swallow to null — the picker just won't be locked, which
// is the safe default.
export async function getStripeCustomerLockedCurrency(
  stripeCustomerId: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  try {
    const c = await getStripe().customers.retrieve(stripeCustomerId);
    if (c.deleted) return null;
    const raw = (c as { currency?: string | null }).currency ?? null;
    return raw ? raw.toUpperCase() : null;
  } catch {
    return null;
  }
}
