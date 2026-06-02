// Analytics consent — first-party, opt-in (deny-by-default) state.
//
// GDPR/PECR opt-in model: Google Analytics must NOT run until the visitor
// explicitly clicks "Accept". The choice is stored in a first-party cookie
// (deliberately NOT HttpOnly — it has to be readable client-side, by both the
// ConsentBanner and the Analytics component, BEFORE the gtag script is ever
// injected). The cookie carries no personal data — just the literal string
// "granted" or "denied".
//
// Why a cookie and not localStorage alone: it must persist across visits AND
// be synchronously checkable on the first client render, so analytics is gated
// before any network call to googletagmanager.com. The app never needs this
// value server-side; everything here is browser-only and guards on `document`.

export const CONSENT_COOKIE = "og_analytics_consent";

export type ConsentValue = "granted" | "denied";

// Custom DOM event so the banner / the /cookies controls can tell a mounted
// <Analytics> that the choice changed — this lets "Accept" start analytics
// immediately without forcing a full page reload.
export const CONSENT_EVENT = "og:analytics-consent-change";

// Surfaces analytics + the consent banner must never appear on (staff / auth
// surfaces; their paths can carry ids and they aren't funnel pages). Shared by
// Analytics and ConsentBanner so the two stay in lockstep.
export const ANALYTICS_EXCLUDED_PREFIXES = ["/admin", "/di", "/dashboard"];

// One year. PECR/ICO guidance treats ~6–12 months as a reasonable lifespan for
// a consent record before re-asking.
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** True when analytics + the banner must be suppressed for this path. */
export function isAnalyticsExcludedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  return ANALYTICS_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Read the stored choice. Returns null when the visitor hasn't chosen yet. */
export function readConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice(CONSENT_COOKIE.length + 1));
  return value === "granted" || value === "denied" ? value : null;
}

/** Persist the choice as a first-party cookie and notify any listeners. */
export function writeConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  // Secure only over https so localhost (http) can still set the cookie.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  notifyConsentChange();
}

/**
 * Forget the choice entirely (used by "withdraw" on /cookies). On the next
 * load the gate sees no consent → GA does not load, and the banner re-appears
 * so the visitor can make a fresh choice.
 */
export function clearConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  notifyConsentChange();
}

function notifyConsentChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
