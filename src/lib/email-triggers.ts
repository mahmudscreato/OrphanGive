// Inline email triggers (Session 14.5b).
//
// These helpers fire status-transition emails directly from the
// route that performs the triggering action — replacing the legacy
// "Directus Flow → app webhook → /api/internal/email/*" path that
// proved unreliable in dev (Flows can't reach localhost) and added
// a failure surface in production (Flow disabled / misconfigured /
// silently dropped).
//
// Implementation choice: rather than duplicating the body of each
// /api/internal/email/* route (donor lookup, dedup check, template
// render, sendEmail call), these helpers self-fetch the existing
// route with `INTERNAL_API_TOKEN`. That keeps a single source of
// truth for the per-template logic + dedup. The internal routes
// themselves are unchanged — they still serve as the canonical
// implementation, and Directus Flows pointed at them continue to
// work during the migration window.
//
// Dedup is owned by each internal route (welcome dedupes on
// donor.welcome_email_sent_at within a 6h window; monthly receipt
// dedupes on payment-row idempotency upstream — `createPaymentIfMissing`
// returning false means the payment was already recorded so the
// receipt has already fired). When this helper fires inline AND a
// Directus Flow also fires for the same trigger, the second arrival
// hits the dedup and short-circuits.
//
// All triggers are best-effort: a network hiccup, mail-server
// glitch, or 500 from the internal route should NOT unwind the
// webhook handler's row update. Errors are logged with a
// `[email-triggers]` prefix and swallowed.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

async function callInternalEmailRoute(
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    console.warn(
      `[email-triggers] INTERNAL_API_TOKEN not set; skipping ${path}`,
    );
    return;
  }
  try {
    const r = await fetch(`${SITE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.warn(
        `[email-triggers] ${path} returned ${r.status}: ${txt.slice(0, 300)}`,
      );
      return;
    }
    // Routes return either { success: true, messageId } on send or
    // { skipped: true, reason } when dedup short-circuits. Both
    // outcomes are fine; only log the latter at debug volume.
    const json = (await r.json().catch(() => ({}))) as {
      skipped?: boolean;
      reason?: string;
      messageId?: string;
    };
    if (json.skipped) {
      console.log(
        `[email-triggers] ${path} skipped (${json.reason ?? "dedup"})`,
      );
    }
  } catch (err) {
    console.warn(
      `[email-triggers] ${path} threw:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// Welcome email — fires once per donor when their first
// sponsorship of a checkout transitions to status='active'. The
// route handles the multi-sponsorship-summary case (donor with
// N sponsorships in one checkout gets ONE welcome listing all N).
//
// Caller responsibility: only invoke when the row is FRESHLY active
// (was status='pending_payment' before this webhook). The route's
// own dedup is donor-level (6h window) — it doesn't know whether
// the row was just activated or has been active for a while. The
// webhook handler should gate on `!sponsorship.started_at` so we
// don't accidentally re-fire welcome on every recurring invoice.
export async function fireWelcomeEmail(
  sponsorshipIds: string[],
): Promise<void> {
  if (!Array.isArray(sponsorshipIds) || sponsorshipIds.length === 0) return;
  await callInternalEmailRoute("/api/internal/email/sponsorship-welcome", {
    sponsorshipIds,
  });
}

// Monthly receipt — fires per payment row for recurring sub
// invoices. Caller should only invoke when `createPaymentIfMissing`
// returned true (i.e. THIS event is the first time we recorded the
// payment). On replay, the second invocation finds an existing
// payment row and returns false; receipt is suppressed naturally.
export async function fireMonthlyReceiptEmail(
  paymentId: string,
): Promise<void> {
  if (!paymentId) return;
  await callInternalEmailRoute("/api/internal/email/monthly-receipt", {
    paymentId,
  });
}
