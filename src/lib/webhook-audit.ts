// Phase 0 follow-up — Stripe webhook audit helper.
//
// Closes the "deferred" item from docs/admin-os/01-phase0-diagnostic.md
// §C: webhook events did not write audit rows because audit_log.actor
// is m2o directus_users NOT NULL and the webhook has no user. The
// resolution (locked decision): seed a SYSTEM directus user
// (migrations/phase-0/002-seed-system-user.mjs) and attribute every
// webhook + cron audit event to it.
//
// This module is the thin wrapper around recordAuditEvent that:
//   1. Pre-fills actorRole: "system".
//   2. Pre-fills actorUserId from process.env.SYSTEM_USER_ID.
//   3. Skips silently + logs once when SYSTEM_USER_ID is unset, so
//      the webhook never blocks payment processing on missing
//      audit infrastructure.
//   4. Does NOT thread NextRequest (the webhook's "client" is
//      Stripe's webhook IP, which isn't meaningful for donor
//      accountability — IP/UA are explicitly omitted).
//
// Privacy: callers pass metadata with IDs + USD amounts only.
// No Tier-3 child fields. The audit-log redactAuditPayload pass
// (src/lib/di-audit.ts:251) runs on every row regardless, so a
// future contributor accidentally passing a Tier-3 field name in
// metadata would still get redacted if that field name is in
// AUDIT_REDACTED_FIELDS — but the right place to keep this clean
// is at the call site.

import "server-only";

import { recordAuditEvent, type AuditAction } from "./di-audit";

// Track whether we've logged the missing-env warning once. Avoids
// spamming the logs when a high-volume webhook fires without the
// env set (which would otherwise emit one warn per call).
let WARNED_MISSING_ENV = false;

/**
 * Action values valid for webhook audit. Narrows the AuditAction
 * union to the 6 webhook_* members so callers can't accidentally
 * pass a non-system action.
 */
export type WebhookAuditAction = Extract<AuditAction, `webhook_${string}`>;

export interface WebhookAuditInput {
  action: WebhookAuditAction;
  /** Sponsorship the event relates to. Always set when there's a
   *  resolvable sponsorship; null only when a webhook event arrived
   *  without us being able to map it. */
  sponsorshipId: string | null;
  /** IDs + USD amounts only. NO Tier-3 child fields. */
  metadata?: Record<string, unknown>;
}

/**
 * Record a webhook-originated audit event. Best-effort: never
 * throws, never blocks the webhook handler.
 */
export async function recordWebhookAuditEvent(
  input: WebhookAuditInput,
): Promise<void> {
  const systemUserId = process.env.SYSTEM_USER_ID;
  if (!systemUserId) {
    if (!WARNED_MISSING_ENV) {
      WARNED_MISSING_ENV = true;
      console.warn(
        "[webhook-audit] SYSTEM_USER_ID not configured — skipping all webhook audit writes. " +
          "Run migrations/phase-0/002-seed-system-user.mjs and set SYSTEM_USER_ID in .env.local.",
      );
    }
    return;
  }

  await recordAuditEvent({
    actorUserId: systemUserId,
    actorRole: "system",
    action: input.action,
    collection: "sponsorship",
    recordId: input.sponsorshipId ?? undefined,
    metadata: input.metadata,
    // Deliberately no `request` — webhook's "client" is Stripe's
    // IP, which isn't meaningful for donor accountability.
  });
}
