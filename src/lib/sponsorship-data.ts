import {
  createItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";

export type SponsorshipStatus =
  | "pending_payment"
  | "active"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export type Sponsorship = {
  id: string;
  donor: string;
  child:
    | string
    | { id: string; display_name: string | null; Photo?: string | null };
  payment_mode: "monthly" | "one_time";
  amount_usd: number;
  currency: string;
  status: SponsorshipStatus;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
  next_billing_date: string | null;
  total_paid_usd: number;
  payment_count: number;
  date_created: string | null;
  checkout_fingerprint: string | null;
  cancellation_reason: string | null;
};

const FULL_FIELDS = [
  "id", "donor", "payment_mode", "amount_usd", "currency", "status",
  "stripe_subscription_id", "stripe_payment_intent_id", "stripe_customer_id",
  "started_at", "ended_at", "cancelled_at", "next_billing_date",
  "total_paid_usd", "payment_count", "date_created",
  "checkout_fingerprint", "cancellation_reason",
  "child.id", "child.display_name", "child.Photo",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDonorSponsorships(
  donorId: string,
  opts: { limit?: number; statuses?: SponsorshipStatus[] } = {},
): Promise<Sponsorship[]> {
  if (!UUID_RE.test(donorId)) return [];
  const filter: Record<string, unknown> = {
    _and: [{ donor: { _eq: donorId } }],
  };
  if (opts.statuses && opts.statuses.length) {
    (filter._and as Array<Record<string, unknown>>).push({
      status: { _in: opts.statuses },
    });
  }
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter,
        fields: [...FULL_FIELDS],
        sort: ["-date_created"],
        limit: opts.limit ?? -1,
      } as never),
    )) as unknown as Sponsorship[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] getDonorSponsorships failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function findSponsorshipsByStripeRef(
  ref: { subscriptionId?: string; paymentIntentId?: string },
): Promise<Sponsorship[]> {
  const clause: Array<Record<string, unknown>> = [];
  if (ref.subscriptionId) {
    clause.push({ stripe_subscription_id: { _eq: ref.subscriptionId } });
  }
  if (ref.paymentIntentId) {
    clause.push({ stripe_payment_intent_id: { _eq: ref.paymentIntentId } });
  }
  if (clause.length === 0) return [];
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { _or: clause },
        fields: [...FULL_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] findSponsorshipsByStripeRef failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function createPendingSponsorship(opts: {
  donor: string;
  child: string;
  payment_mode: "monthly" | "one_time";
  amount_usd: number;
  stripe_subscription_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_customer_id?: string | null;
  checkout_fingerprint?: string | null;
}): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    donor: opts.donor,
    child: opts.child,
    payment_mode: opts.payment_mode,
    amount_usd: opts.amount_usd,
    currency: "USD",
    status: "pending_payment",
    stripe_subscription_id: opts.stripe_subscription_id ?? null,
    stripe_payment_intent_id: opts.stripe_payment_intent_id ?? null,
    stripe_customer_id: opts.stripe_customer_id ?? null,
    checkout_fingerprint: opts.checkout_fingerprint ?? null,
  };
  const created = (await directusServer().request(
    createItem("sponsorship" as never, payload as never),
  )) as unknown as { id: string };
  return { id: created.id };
}

// All pending_payment sponsorships for a donor created within the cutoff
// window. Used by /api/checkout/init to decide whether to reuse existing
// pending rows or cancel them and start fresh.
export async function getRecentPendingForDonor(
  donorId: string,
  cutoffMs: number,
): Promise<Sponsorship[]> {
  if (!UUID_RE.test(donorId)) return [];
  const cutoffIso = new Date(Date.now() - cutoffMs).toISOString();
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { status: { _eq: "pending_payment" } },
            { date_created: { _gte: cutoffIso } },
          ],
        },
        fields: [...FULL_FIELDS],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] getRecentPendingForDonor failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// Zombie hunt: pending_payment sponsorships older than `olderThanMs`.
// Used by the cleanup script to cancel orphaned Stripe objects.
export async function getStalePendingSponsorships(
  olderThanMs: number,
): Promise<Sponsorship[]> {
  const cutoffIso = new Date(Date.now() - olderThanMs).toISOString();
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "pending_payment" } },
            { date_created: { _lt: cutoffIso } },
          ],
        },
        fields: [...FULL_FIELDS],
        sort: ["date_created"],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] getStalePendingSponsorships failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function updateSponsorship(
  id: string,
  patch: Partial<Sponsorship>,
): Promise<void> {
  await directusServer().request(
    updateItem("sponsorship" as never, id as never, patch as never),
  );
}

// Idempotent payment-row creation: refuses to insert duplicates keyed
// by stripe_payment_intent_id+stripe_invoice_id. Returns true if a new
// row was created, false if it already existed.
export async function createPaymentIfMissing(opts: {
  sponsorshipId: string;
  amount_usd: number;
  status: "succeeded" | "failed" | "refunded" | "pending";
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_invoice_id?: string | null;
  payment_method_type?: string | null;
  failure_reason?: string | null;
  paid_at: string;
}): Promise<boolean> {
  // Look for an existing row on this sponsorship that matches EITHER
  // the PI id or the invoice id. Either-match is important because the
  // same paid invoice can arrive via two different Stripe event names
  // (invoice.payment_succeeded, invoice.paid, invoice_payment.paid) and
  // we don't want to double-insert. Each event carries its own event id
  // so the per-event dedup can't catch this.
  const matchClauses: Array<Record<string, unknown>> = [];
  if (opts.stripe_payment_intent_id) {
    matchClauses.push({
      stripe_payment_intent_id: { _eq: opts.stripe_payment_intent_id },
    });
  }
  if (opts.stripe_invoice_id) {
    matchClauses.push({
      stripe_invoice_id: { _eq: opts.stripe_invoice_id },
    });
  }
  const filter: Record<string, unknown> =
    matchClauses.length > 0
      ? {
          _and: [
            { sponsorship: { _eq: opts.sponsorshipId } },
            { _or: matchClauses },
          ],
        }
      : { sponsorship: { _eq: opts.sponsorshipId } };
  try {
    const rows = (await directusServer().request(
      readItems("payment" as never, {
        filter, fields: ["id"], limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    if (Array.isArray(rows) && rows.length > 0) return false;
  } catch {
    // Read failure is non-fatal — we'd rather create a duplicate than miss.
  }
  await directusServer().request(
    createItem("payment" as never, {
      sponsorship: opts.sponsorshipId,
      amount_usd: opts.amount_usd,
      currency: "USD",
      status: opts.status,
      stripe_payment_intent_id: opts.stripe_payment_intent_id ?? null,
      stripe_charge_id: opts.stripe_charge_id ?? null,
      stripe_invoice_id: opts.stripe_invoice_id ?? null,
      payment_method_type: opts.payment_method_type ?? null,
      failure_reason: opts.failure_reason ?? null,
      paid_at: opts.paid_at,
    } as never),
  );
  return true;
}

// Idempotency for the webhook handler.
export async function isStripeEventProcessed(
  eventId: string,
): Promise<boolean> {
  try {
    const rows = (await directusServer().request(
      readItems("stripe_event_processed" as never, {
        filter: { stripe_event_id: { _eq: eventId } },
        fields: ["id"], limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function markStripeEventProcessed(
  eventId: string,
  eventType: string,
): Promise<void> {
  try {
    await directusServer().request(
      createItem("stripe_event_processed" as never, {
        stripe_event_id: eventId,
        event_type: eventType,
        processed_at: new Date().toISOString(),
      } as never),
    );
  } catch (err) {
    // If the unique constraint fired we're racing against another
    // delivery — that's fine, the other delivery will mark.
    console.warn(
      "[sponsorship-data] markStripeEventProcessed failed (likely race, non-fatal)",
      err instanceof Error ? err.message : err,
    );
  }
}
