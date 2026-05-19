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

// Self-fetch via in-process loopback. The internal-email routes are
// hosted by THIS Node process, so going out to NEXT_PUBLIC_SITE_URL
// (e.g. https://orphangive.org) would round-trip:
//   container → DNS → public IP → reverse proxy → container
// That dependency chain means a single hiccup at any layer (DNS
// inside container, SSL cert sniffing, proxy ACL) can silently
// break inline email triggers — exactly what Session 15b1.1 Bug 3
// surfaced in production. Hitting `http://localhost:${PORT}` keeps
// the call inside the container's loopback interface; no external
// network involved.
//
// Override via INTERNAL_FETCH_URL if a deployment really wants to
// exit the process (e.g. multi-instance setups where the email
// route lives on a different node). Single-instance default is
// localhost.
const SELF_PORT = process.env.PORT ?? "3000";
const SELF_URL =
  process.env.INTERNAL_FETCH_URL?.replace(/\/$/, "") ??
  `http://localhost:${SELF_PORT}`;

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
    const r = await fetch(`${SELF_URL}${path}`, {
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

// Campaign donation thank-you (Session 58.2-overnight Task 2) —
// fires once per campaign one-time gift (sponsorship.child === null)
// when the PI succeeds. Distinct from fireWelcomeEmail because the
// welcome template personalizes around a child and crashes on null.
//
// Caller responsibility: only invoke for sponsorship rows with
// child === null and status that just transitioned to 'completed'.
// The route itself refuses (400) if the row has a child set, as a
// defensive cross-check against caller bugs.
export async function fireCampaignThankYouEmail(
  sponsorshipId: string,
): Promise<void> {
  if (!sponsorshipId) return;
  await callInternalEmailRoute("/api/internal/email/campaign-thank-you", {
    sponsorshipId,
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

// Refund confirmation — fires from the charge.refunded webhook
// handler (Session 15b1.1 Bug 4 migration). Reuses the existing
// SponsorshipCancelledEmail template via /api/internal/email/sponsorship-cancelled
// with a refund-specific subject; the template body covers both
// "your sponsorship has ended" and "your refund has been processed"
// adequately for v1. A dedicated RefundConfirmation template can
// be split out later if the copy needs to diverge.
//
// Caller passes the sponsorship id of the refunded row plus the
// refunded amount in USD (for the email body). Best-effort: a
// failure here doesn't unwind the row updates the webhook handler
// already made.
export async function fireRefundEmail(opts: {
  sponsorshipId: string;
  refundedAmountUsd: number;
}): Promise<void> {
  if (!opts.sponsorshipId) return;
  await callInternalEmailRoute(
    "/api/internal/email/sponsorship-cancelled",
    {
      sponsorshipId: opts.sponsorshipId,
      reason: "refunded",
      refundedAmountUsd: opts.refundedAmountUsd,
    },
  );
}
