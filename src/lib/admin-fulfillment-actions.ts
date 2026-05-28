// Donation Lifecycle sub-phase 3 — admin fulfillment exception writes.
//
// One concept: admin sets / clears the fulfillment_exception column
// (+ matching `_at`, `fulfillment_reason`, `fulfillment_donor_visible_reason`).
// That's it — NO money paths, NO Stripe calls. The resolver in
// src/lib/fulfillment-status.ts already renders whatever this writes.
//
// IMPORTANT — refund safety:
//   - This module does NOT write `fulfillment_exception='refunded'`.
//   - Refunded is reserved for the system-side write triggered by the
//     existing Stripe charge.refunded webhook (handleChargeRefunded in
//     src/app/api/webhooks/stripe/route.ts). Admin can mark
//     'refund_requested' here (a column write only — NO money moves)
//     to signal "donor asked, refund in progress." The actual
//     'refunded' state lands when Stripe confirms the refund event.
//
// Privacy: fulfillment_reason is PRIVATE (admin-only). Audit metadata
// captures the state transition + whether a donor_visible_reason was
// provided, NEVER the reason text itself. The text lives on the
// sponsorship row; admin surfaces read it via the resolver's internal
// view; donor surfaces never touch it (compile-time enforced by
// FulfillmentDonorView).

import "server-only";

import { readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";
import type { AuditAction } from "./di-audit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class FulfillmentNotFoundError extends Error {
  readonly code = "sponsorship_not_found" as const;
  constructor(message = "Sponsorship not found") {
    super(message);
    this.name = "FulfillmentNotFoundError";
  }
}

export class FulfillmentInvalidInputError extends Error {
  readonly code = "invalid_input" as const;
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "FulfillmentInvalidInputError";
  }
}

// Admin-set exception values. 'refunded' is deliberately excluded —
// system-set only (see module header).
export type AdminSettableException =
  | "on_hold"
  | "disputed"
  | "refund_requested";

export interface SetFulfillmentExceptionInput {
  sponsorshipId: string;
  exception: AdminSettableException;
  privateReason: string;
  donorVisibleReason: string | null;
  adminUserId: string;
}

export interface ClearFulfillmentExceptionInput {
  sponsorshipId: string;
  adminUserId: string;
}

interface SponsorshipPeek {
  id: string;
  donor: string | null;
  child: string | null;
  fulfillment_exception: string | null;
}

async function fetchSponsorshipPeek(
  sponsorshipId: string,
): Promise<SponsorshipPeek | null> {
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { id: { _eq: sponsorshipId } },
        fields: ["id", "donor", "child", "fulfillment_exception"],
        limit: 1,
      } as never),
    )) as unknown as SponsorshipPeek[] | undefined;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch (err) {
    console.warn(
      "[admin-fulfillment-actions] sponsorship peek failed",
      { sponsorshipId, err: err instanceof Error ? err.message : err },
    );
    return null;
  }
}

function actionForException(e: AdminSettableException): AuditAction {
  switch (e) {
    case "on_hold":
      return "admin_set_fulfillment_on_hold";
    case "disputed":
      return "admin_set_fulfillment_disputed";
    case "refund_requested":
      return "admin_set_fulfillment_refund_requested";
  }
}

function validatePrivateReason(s: string): string {
  const t = s.trim();
  if (t.length < 5) {
    throw new FulfillmentInvalidInputError(
      "privateReason",
      "must be at least 5 characters",
    );
  }
  if (t.length > 1000) {
    throw new FulfillmentInvalidInputError(
      "privateReason",
      "max 1000 characters",
    );
  }
  return t;
}

function validateDonorVisible(s: string | null): string | null {
  if (s === null) return null;
  const t = s.trim();
  if (t.length === 0) return null;
  if (t.length > 500) {
    throw new FulfillmentInvalidInputError(
      "donorVisibleReason",
      "max 500 characters",
    );
  }
  return t;
}

/**
 * Set the fulfillment_exception column on a sponsorship. Writes:
 *   - fulfillment_exception
 *   - fulfillment_exception_at = now
 *   - fulfillment_reason (PRIVATE)
 *   - fulfillment_donor_visible_reason (curated; null is allowed —
 *     donor will see the generic copy from the resolver's table)
 *
 * Audits the transition. Audit metadata is IDs + enums + boolean —
 * NEVER the reason text.
 */
export async function setFulfillmentException(
  input: SetFulfillmentExceptionInput,
  req?: Request,
): Promise<{ sponsorshipId: string; exception: AdminSettableException }> {
  if (!UUID_RE.test(input.sponsorshipId)) {
    throw new FulfillmentNotFoundError("invalid sponsorship id");
  }
  if (!UUID_RE.test(input.adminUserId)) {
    throw new FulfillmentInvalidInputError("adminUserId", "must be a uuid");
  }
  if (
    input.exception !== "on_hold" &&
    input.exception !== "disputed" &&
    input.exception !== "refund_requested"
  ) {
    throw new FulfillmentInvalidInputError(
      "exception",
      "must be on_hold | disputed | refund_requested",
    );
  }
  const privateReason = validatePrivateReason(input.privateReason);
  const donorVisibleReason = validateDonorVisible(input.donorVisibleReason);

  const peek = await fetchSponsorshipPeek(input.sponsorshipId);
  if (!peek) throw new FulfillmentNotFoundError();
  const priorException = peek.fulfillment_exception ?? null;

  await directusServer().request(
    updateItem("sponsorship" as never, input.sponsorshipId as never, {
      fulfillment_exception: input.exception,
      fulfillment_exception_at: new Date().toISOString(),
      fulfillment_reason: privateReason,
      fulfillment_donor_visible_reason: donorVisibleReason,
    } as never),
  );

  await recordAuditEvent({
    actorUserId: input.adminUserId,
    actorRole: "admin",
    action: actionForException(input.exception),
    collection: "sponsorship",
    recordId: input.sponsorshipId,
    // METADATA contract: IDs + enums + boolean. NEVER the private
    // reason text. NEVER the curated donor_visible_reason verbatim —
    // we only capture WHETHER one was provided, so a forensic
    // reviewer can correlate against the sponsorship row's columns
    // without the audit log doubling as a leak surface.
    metadata: {
      sponsorshipId: input.sponsorshipId,
      donor: peek.donor,
      ...(peek.child ? { childId: peek.child } : {}),
      exception: input.exception,
      prior_exception: priorException,
      donor_visible_reason_provided: donorVisibleReason !== null,
    },
    request: req,
  });

  return {
    sponsorshipId: input.sponsorshipId,
    exception: input.exception,
  };
}

/**
 * Clear the fulfillment exception on a sponsorship. Nulls all four
 * fulfillment_* columns. After this, the resolver falls through to
 * the payment-axis / spine derivation (the donor sees whatever phase
 * the spine actually represents).
 *
 * Refunded exceptions cannot be cleared via this path — the column
 * is system-set by the Stripe webhook and is effectively terminal.
 * Attempting to clear from 'refunded' throws.
 */
export async function clearFulfillmentException(
  input: ClearFulfillmentExceptionInput,
  req?: Request,
): Promise<{ sponsorshipId: string; clearedFrom: string | null }> {
  if (!UUID_RE.test(input.sponsorshipId)) {
    throw new FulfillmentNotFoundError("invalid sponsorship id");
  }
  if (!UUID_RE.test(input.adminUserId)) {
    throw new FulfillmentInvalidInputError("adminUserId", "must be a uuid");
  }
  const peek = await fetchSponsorshipPeek(input.sponsorshipId);
  if (!peek) throw new FulfillmentNotFoundError();
  const priorException = peek.fulfillment_exception ?? null;

  if (priorException === "refunded") {
    throw new FulfillmentInvalidInputError(
      "exception",
      "cannot clear 'refunded' — it is system-set by Stripe and is terminal",
    );
  }
  if (priorException === null) {
    // Idempotent — nothing to clear.
    return { sponsorshipId: input.sponsorshipId, clearedFrom: null };
  }

  await directusServer().request(
    updateItem("sponsorship" as never, input.sponsorshipId as never, {
      fulfillment_exception: null,
      fulfillment_exception_at: null,
      fulfillment_reason: null,
      fulfillment_donor_visible_reason: null,
    } as never),
  );

  await recordAuditEvent({
    actorUserId: input.adminUserId,
    actorRole: "admin",
    action: "admin_cleared_fulfillment_exception",
    collection: "sponsorship",
    recordId: input.sponsorshipId,
    metadata: {
      sponsorshipId: input.sponsorshipId,
      donor: peek.donor,
      ...(peek.child ? { childId: peek.child } : {}),
      prior_exception: priorException,
    },
    request: req,
  });

  return { sponsorshipId: input.sponsorshipId, clearedFrom: priorException };
}
