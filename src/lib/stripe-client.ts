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
