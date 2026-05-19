// Session 58 — Stripe currency conventions for the 7 launch currencies.
//
// Stripe expresses amounts in the smallest unit of each currency:
//   USD, GBP, EUR, AUD, CAD, SGD, INR  → minor unit = 1/100 (cents/pence)
//   BDT                                → minor unit = 1/100 (paisa)
//   JPY, KRW, VND, etc.                → no subunit (1 yen = 1 yen)
//
// All seven launch currencies are 2-decimal currencies, but this
// helper is written generically against Stripe's zero-decimal list
// so adding JPY later (a likely v2 currency for the diaspora) is a
// one-line change.
//
// Reference: https://stripe.com/docs/currencies#zero-decimal

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

/**
 * Convert a whole-unit donor amount (e.g. 18 for $18, 2500 for
 * ৳2,500) to Stripe's smallest-unit integer (e.g. 1800 cents,
 * 250000 paisa).
 *
 * Throws on non-finite / negative input so a bad amount fails loud
 * rather than charging the donor nothing.
 */
export function toStripeAmount(amount: number, currencyCode: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      `toStripeAmount: amount must be a non-negative finite number (got ${amount})`,
    );
  }
  const code = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

/**
 * Convert a Stripe smallest-unit integer back to whole units of the
 * donor's currency. Inverse of toStripeAmount.
 */
export function fromStripeAmount(stripeAmount: number, currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return stripeAmount;
  }
  return stripeAmount / 100;
}

export function isZeroDecimalCurrency(currencyCode: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase());
}

/**
 * Stripe wants currency codes lowercased on API requests. Centralize
 * the convention so we don't sprinkle .toLowerCase() at call sites.
 */
export function toStripeCurrency(currencyCode: string): string {
  return currencyCode.toLowerCase();
}
