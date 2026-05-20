// Session 58 — geo-based currency detection + cookie cache.
//
// Flow:
//   1. Cookie `og_currency` set → use it (donor picked, or we already
//      detected on a previous request).
//   2. No cookie → fetch country from ipapi.co using the request IP,
//      map country → currency code.
//   3. Detection fails (ipapi unreachable, unknown country, etc.) →
//      fall back to USD.
//   4. Always validate the result is in the active currency set;
//      otherwise fall back to USD.
//
// Cookie is set with a 30-day expiry. Donor-side override (currency
// picker) writes the cookie directly via a Server Action.
//
// All ipapi.co calls are best-effort. We never throw — the donation
// page must render even if ipapi is down or rate-limited.

import "server-only";
import { cookies, headers } from "next/headers";
import {
  listActiveCurrencies,
  getCurrencyByCode,
  type CurrencyRate,
} from "./currency-rates";
import { getStripeCustomerLockedCurrency } from "./stripe-client";

export const CURRENCY_COOKIE = "og_currency";
const COOKIE_MAX_AGE_DAYS = 30;
const COOKIE_MAX_AGE_SEC = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
const DEFAULT_CURRENCY = "USD";

// Country → currency mapping. Kept narrow on purpose — only the
// 7 currencies we actually accept. Anything else falls through to
// USD (the global default for donations from outside our supported
// regions).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  BD: "BDT",
  US: "USD",
  GB: "GBP",
  SG: "SGD",
  IN: "INR",
  AU: "AUD",
  CA: "CAD",
  // EU member states → EUR. Not exhaustive but covers the donors
  // we're likely to see; missing countries fall through to USD.
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  PT: "EUR",
  GR: "EUR",
  LU: "EUR",
  MT: "EUR",
  CY: "EUR",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  HR: "EUR",
};

/**
 * Best-effort IP detection from request headers. Falls back to a
 * generic IP literal if the headers don't carry the originating IP.
 *
 * In production with Vercel / Cloudflare in front, `x-forwarded-for`
 * or `cf-connecting-ip` will be set. In dev (no proxy) we end up
 * with the loopback and ipapi will return BD/whatever-the-vpn-shows;
 * still useful for testing.
 */
async function getIpFromHeaders(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  const xri = h.get("x-real-ip");
  if (xri) return xri;
  return null;
}

async function fetchCountryFromIpapi(ip: string | null): Promise<string | null> {
  try {
    // Use the per-IP endpoint when we have one; otherwise the
    // implicit-IP endpoint (still works on the server but resolves
    // to the server's own IP — useful as a fallback).
    const url = ip
      ? `https://ipapi.co/${encodeURIComponent(ip)}/country/`
      : "https://ipapi.co/country/";
    const res = await fetch(url, {
      // Short timeout — donation page render can't block on this.
      signal: AbortSignal.timeout(2000),
      // Don't cache per-request, but allow Next's fetch cache to
      // dedupe within a single render.
      cache: "no-store",
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // ipapi returns a 2-letter country code on success, or an error
    // body like "error" on rate-limit. Validate shape.
    if (/^[A-Z]{2}$/.test(text)) return text;
    return null;
  } catch {
    return null;
  }
}

function countryToCurrencyCode(country: string | null): string {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? DEFAULT_CURRENCY;
}

/**
 * Resolve the donor's currency for this request.
 *
 * Returns a guaranteed-active currency_rate row. Reads cookie if
 * present; otherwise detects + sets cookie; falls back to USD on
 * any failure.
 *
 * Note: this is a Server Component / Route Handler function — it
 * mutates cookies via next/headers, which Next 16 only allows in
 * Server Actions and Route Handlers. From a Server Component you
 * can READ a cookie, but writing requires a Server Action.
 *
 * Strategy: this function only WRITES the cookie when called from a
 * mutating context (it tries, swallows the error if the context is
 * read-only). Read-only callers from Server Components get the
 * resolved currency without persisting the cookie — they're not
 * worse off because the next mutating request will write it.
 */
export async function resolveDonorCurrency() {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(CURRENCY_COOKIE)?.value;

  if (fromCookie) {
    const rate = await getCurrencyByCode(fromCookie);
    if (rate) return rate;
    // Cookie holds an inactive / unknown currency — drop it and
    // re-detect below.
  }

  const ip = await getIpFromHeaders();
  const country = await fetchCountryFromIpapi(ip);
  let code = countryToCurrencyCode(country);

  // Validate against the active set; if our mapping points at a
  // currency that's been disabled, fall back to USD then to BDT
  // (BDT is always present per seed).
  let rate = await getCurrencyByCode(code);
  if (!rate) {
    rate = await getCurrencyByCode(DEFAULT_CURRENCY);
    code = DEFAULT_CURRENCY;
  }
  if (!rate) {
    const actives = await listActiveCurrencies();
    rate = actives[0] || null;
  }
  if (!rate) {
    // Truly catastrophic — no active currencies. Synthesize a USD
    // record with the env preview rate so the page still renders.
    const envRate = Number.parseFloat(
      process.env.NEXT_PUBLIC_USD_TO_BDT_RATE || "110",
    );
    return {
      id: "fallback-usd",
      currency_code: "USD",
      display_name: "US Dollar",
      symbol: "$",
      bdt_per_unit: Number.isFinite(envRate) ? envRate : 110,
      is_active: true,
      date_updated: null,
    };
  }

  // Try to persist; swallow failure if we're in a read-only context.
  try {
    cookieStore.set({
      name: CURRENCY_COOKIE,
      value: rate.currency_code,
      maxAge: COOKIE_MAX_AGE_SEC,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // donor-facing override needs to read it from client
    });
  } catch {
    /* Server Component read-only — fine, cookie writes can wait */
  }

  return rate;
}

/**
 * Session 58.3.2 — lock-aware resolver.
 *
 * Donor-currency resolution with Stripe currency-lock semantics:
 *   1. If the signed-in donor has an existing Stripe customer with a
 *      `currency` set (they've already transacted), pre-lock to that
 *      currency regardless of cookie or geo. This is what keeps the
 *      "cannot combine currencies on a single customer" Stripe error
 *      from ever surfacing.
 *   2. Otherwise, fall back to the normal cookie/geo/USD path.
 *
 * Returns the resolved CurrencyRate plus a `locked: boolean` flag
 * the page passes to the CurrencyPicker so it can disable the
 * dropdown + show a tooltip.
 */
export async function resolveDonorCurrencyWithLock(
  donor: { og_stripe_customer_id?: string | null } | null,
): Promise<{ rate: CurrencyRate; locked: boolean }> {
  if (donor?.og_stripe_customer_id) {
    const lockedCode = await getStripeCustomerLockedCurrency(
      donor.og_stripe_customer_id,
    );
    if (lockedCode) {
      const rate = await getCurrencyByCode(lockedCode);
      if (rate) return { rate, locked: true };
      // Locked to an inactive/unknown currency — fall through to geo.
      // The 409 in /api/donate/init will catch any mismatch attempts.
    }
  }
  const rate = await resolveDonorCurrency();
  return { rate, locked: false };
}

/**
 * Set the currency cookie explicitly (called from the picker's
 * Server Action when the donor overrides detection).
 *
 * Validates that the currency is active before persisting; if it
 * isn't, this is a silent no-op so URL-injected garbage can't
 * corrupt the cookie.
 */
export async function setDonorCurrency(code: string): Promise<void> {
  const rate = await getCurrencyByCode(code);
  if (!rate) return;
  const cookieStore = await cookies();
  cookieStore.set({
    name: CURRENCY_COOKIE,
    value: rate.currency_code,
    maxAge: COOKIE_MAX_AGE_SEC,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });
}
