// Session 58.8.1 — donor-currency formatter for admin views.
//
// Renders a sponsorship's donor-facing amount the same way the
// public site does: symbol-prefixed, locale-formatted, no decimals
// when the amount is a whole number, two decimals otherwise.
//
// The 8 launch currencies have stable Unicode symbols that match
// what currency_rate.symbol stores (kept hardcoded here so admin
// pages don't have to read currency_rate.symbol per row — admin
// lists render dozens of rows and one Directus row-per-row would
// be a noticeable round-trip cost). If a 9th currency is added,
// extend the map. Unknown codes fall back to ISO suffix.

const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  INR: "₹",
};

function isWhole(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
}

function localeAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return isWhole(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

/**
 * Format an amount in the donor's chosen currency.
 * Returns symbol-prefixed when we know the symbol (e.g. "৳2,000",
 * "$18", "£14"), ISO-suffixed otherwise ("2,000 XYZ").
 */
export function formatDonorAmount(
  amount: number | string | null | undefined,
  code: string | null | undefined,
): string {
  const n =
    typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? 0));
  const safeN = Number.isFinite(n) ? n : 0;
  const numStr = localeAmount(safeN);
  if (!code) return `${numStr} USD`;
  const sym = CURRENCY_SYMBOLS[code.toUpperCase()];
  return sym ? `${sym}${numStr}` : `${numStr} ${code.toUpperCase()}`;
}

/** Convenience: "$18 USD" (always with ISO suffix). For the "(≈ …)"
 *  reconciliation hint shown next to donor-currency amounts. */
export function formatUsdEquivalent(
  amount: number | string | null | undefined,
): string {
  const n =
    typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? 0));
  const safeN = Number.isFinite(n) ? n : 0;
  return `$${localeAmount(safeN)} USD`;
}

/**
 * Whether to render the "(≈ $X USD)" reconciliation hint alongside a
 * donor-currency amount. Suppressed when the donor IS in USD — the
 * suffix would just repeat the primary amount, e.g. "$18 (≈ $18 USD)".
 */
export function shouldShowUsdEquivalent(
  donorCurrencyCode: string | null | undefined,
): boolean {
  if (!donorCurrencyCode) return false;
  return donorCurrencyCode.toUpperCase() !== "USD";
}
