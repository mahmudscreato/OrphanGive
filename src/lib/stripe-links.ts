// Session 69 — Stripe Dashboard deep-link builders.
//
// Admin views surface Stripe IDs in places like the sponsorship
// detail and donor detail pages — refunds, failed-charge triage,
// and customer-record lookups all start with admin clicking
// through to Stripe directly. These helpers build the right URL
// for the right Stripe object, automatically switching between
// the test and live dashboards based on STRIPE_SECRET_KEY.
//
// Why mode detection lives here (not on the consumer):
//   1. One source of truth — every link in the admin surface picks
//      up test vs. live from the same place. Drift would be silent
//      and dangerous (admin clicks a test-mode customer id on a
//      live dashboard URL → "customer not found" or, worse, opens
//      a stale prod customer that happens to share an id prefix).
//   2. The detection is server-only — we read process.env.
//      STRIPE_SECRET_KEY which is NOT prefixed NEXT_PUBLIC_, so it
//      never leaks to the client bundle. The link builders are
//      called server-side during admin page render; the resulting
//      URL string is what reaches the client.
//
// Safety: every builder guards against bad input. An empty / null /
// undefined id returns null rather than producing a malformed URL
// that would 404 on Stripe. Callers should treat the return as
// nullable: `const url = stripeCustomerUrl(donor.stripe_customer_id);
// if (url) <a href={url}>…</a>` — see <StripeLink/> in
// src/components/admin/StripeLink.tsx for the canonical render
// pattern.
//
// Note on /payments vs /charges:
//   Stripe's web dashboard collapses payments + charges into a
//   single /payments/{id} route that accepts EITHER a `ch_…` or
//   `pi_…` id (with `pi_…` taking you to the payment-intent view).
//   We keep separate helpers for clarity but both produce the same
//   path. Refunds get their own /refunds/{id} URL in the dashboard.

export type StripeMode = "test" | "live";

/**
 * Inspect STRIPE_SECRET_KEY to determine which dashboard to link to.
 * Returns `"test"` whenever the key starts with `sk_test_` OR when
 * the key is missing — missing key is treated as "test" by design,
 * because shipping live-Stripe URLs without a live key configured
 * would silently misroute admins to the live dashboard.
 */
export function stripeMode(): StripeMode {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_")) return "live";
  return "test";
}

/**
 * Base URL for the Stripe dashboard, with the test-mode `/test`
 * prefix when applicable. Exported for callers that need to build
 * one-off URLs not covered by the named helpers (e.g. links to
 * specific dashboard views like /events/{id} for webhook debugging).
 */
export function stripeBaseUrl(): string {
  return stripeMode() === "live"
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";
}

// ─── Named URL builders ────────────────────────────────────────────
//
// Each returns `string | null` so callers can render conditionally
// without juggling separate "has this id" checks.

/** Stripe customer detail page. Accepts `cus_…` ids. */
export function stripeCustomerUrl(
  customerId: string | null | undefined,
): string | null {
  if (!isPresent(customerId)) return null;
  return `${stripeBaseUrl()}/customers/${encodeURIComponent(customerId)}`;
}

/** Subscription detail page. Accepts `sub_…` ids. */
export function stripeSubscriptionUrl(
  subscriptionId: string | null | undefined,
): string | null {
  if (!isPresent(subscriptionId)) return null;
  return `${stripeBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`;
}

/**
 * Payment detail page — accepts charge ids (`ch_…`). The dashboard
 * accepts payment-intent ids (`pi_…`) on the same path; see
 * stripePaymentIntentUrl for a distinct entry point.
 */
export function stripeChargeUrl(
  chargeId: string | null | undefined,
): string | null {
  if (!isPresent(chargeId)) return null;
  return `${stripeBaseUrl()}/payments/${encodeURIComponent(chargeId)}`;
}

/** Payment intent page. Accepts `pi_…` ids. */
export function stripePaymentIntentUrl(
  paymentIntentId: string | null | undefined,
): string | null {
  if (!isPresent(paymentIntentId)) return null;
  return `${stripeBaseUrl()}/payments/${encodeURIComponent(paymentIntentId)}`;
}

/** Refund detail page. Accepts `re_…` ids. */
export function stripeRefundUrl(
  refundId: string | null | undefined,
): string | null {
  if (!isPresent(refundId)) return null;
  return `${stripeBaseUrl()}/refunds/${encodeURIComponent(refundId)}`;
}

// ─── ID-shape sanity check ─────────────────────────────────────────
//
// Stripe ids are prefix + underscore + alphanumeric. We don't
// validate the prefix matches the helper (e.g. we don't reject
// `pi_…` passed to stripeSubscriptionUrl) because:
//   (a) the dashboard's /payments and /subscriptions routes 404
//       gracefully on the wrong shape, so admin sees a clear error
//   (b) historical migration paths could ship ids that don't match
//       the current prefix convention — better to render the link
//       and let Stripe say "not found" than silently drop it.
//
// Likely-wrong-mode warning: a `sk_live_` admin clicking a link
// for an id that was created in test mode will hit a Stripe 404
// in the live dashboard. We can't detect this from the id alone
// (test and live ids look identical), so the safest behaviour is
// to honour the key-derived mode and let Stripe handle the miss.
// Documented in the ship report.

function isPresent(id: string | null | undefined): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length === 0) return false;
  // Reject obvious garbage. Stripe ids are well over 8 chars in
  // every shape we care about; <8 means a bug upstream.
  if (trimmed.length < 8) return false;
  return true;
}
