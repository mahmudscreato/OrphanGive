// Cloudflare Turnstile — server-side token verification.
//
// Bot protection for the donor signup form (compensates for the removed
// human-approval step). Mirrors the graceful-degradation pattern used by
// sendEmail / the rate limiter: if TURNSTILE_SECRET_KEY is unset, this is
// a NO-OP — verification is skipped so local/dev and an un-configured
// prod still work. The captcha only activates once the founder sets keys.
//
// Env:
//   TURNSTILE_SECRET_KEY            (server-only secret — this module)
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (client widget — see TurnstileWidget)
//
// When configured, the gate is FAIL-CLOSED: a missing/invalid token, a
// non-success response, or even a siteverify outage rejects the signup
// (logged loudly so an outage is visible). Rate limits stay as a separate
// defence-in-depth layer.

import "server-only";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  /** True = let the signup proceed. */
  ok: boolean;
  /** True = captcha not configured; verification was skipped (no-op). */
  skipped: boolean;
  errorCodes?: string[];
}

/** Whether captcha verification is active (secret key present). */
export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/**
 * Verify a Turnstile token against Cloudflare. Returns `{ ok: true,
 * skipped: true }` when no secret is configured (graceful no-op).
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Graceful no-op: captcha not configured → skip entirely.
  if (!secret) return { ok: true, skipped: true };

  // Captcha IS configured → a token is required.
  if (!token || typeof token !== "string") {
    return { ok: false, skipped: false, errorCodes: ["missing-input-response"] };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[turnstile] siteverify HTTP ${res.status}`);
      return { ok: false, skipped: false, errorCodes: [`http-${res.status}`] };
    }
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; "error-codes"?: string[] }
      | null;
    const success = data?.success === true;
    if (!success) {
      console.warn("[turnstile] verification failed", data?.["error-codes"]);
    }
    return {
      ok: success,
      skipped: false,
      errorCodes: data?.["error-codes"],
    };
  } catch (err) {
    // Fail-closed when captcha is configured — never silently let a
    // verify outage open the gate. Logged so an outage is visible.
    console.error(
      "[turnstile] siteverify threw — rejecting (fail-closed)",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, skipped: false, errorCodes: ["internal-error"] };
  }
}
