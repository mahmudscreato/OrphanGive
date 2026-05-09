import {
  createItem,
  readItem,
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

export type ModificationEntry = {
  from_amount: number;
  to_amount: number;
  at: string;
  reason?: string | null;
};

export type Sponsorship = {
  id: string;
  donor: string;
  child:
    | string
    | {
        id: string;
        display_name: string | null;
        Photo?: string | null;
        date_of_birth?: string | null;
        bd_district?: { name?: string | null } | null;
      };
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
  paused_at: string | null;
  modified_at: string | null;
  modification_history: ModificationEntry[] | null;
  // Duration + payment schedule (from sponsor flow refactor).
  // For monthly indefinite: duration_months=null, payment_schedule='monthly'.
  // For monthly fixed-term recurring: duration_months=N, payment_schedule='monthly'.
  // For monthly prepaid: duration_months=N, payment_schedule='monthly_prepaid',
  //                     prepaid_months_total=N, prepaid_months_remaining counts down.
  // For one-time: all duration fields null.
  duration_months: number | null;
  payment_schedule: "monthly" | "monthly_prepaid" | null;
  prepaid_months_total: number | null;
  prepaid_months_remaining: number | null;
  scheduled_end_date: string | null;
  // Set when a donor cancels during a prepaid period — the row stays
  // 'active' until the prepaid period ends, at which point the cron
  // flips status to 'cancelled'.
  cancellation_scheduled_at: string | null;
  // Coverage package / cause — donor's stated allocation intent at
  // sponsor-flow time. Charity admin may override in Directus admin
  // (hybrid model). See src/lib/cause.ts for the canonical enum.
  // Nullable for legacy rows that pre-date Session 14.5; display
  // helpers fall back to "Where most needed" via labelForCause().
  cause: string | null;
  // Public visibility — 'named' shows donor's first name on the
  // child's public page; 'anonymous' (default) keeps it hidden.
  // Editable post-hoc by the donor. Nullable for legacy rows;
  // see src/lib/visibility.ts for null → anonymous fallback.
  visibility: string | null;
  // Sponsor queue (Session 14.7). A row carries status='active'
  // for both currently-supporting AND queued-but-paid donors.
  // queue_position discriminates:
  //   0 (or null) = currently supporting the child
  //   1, 2, 3     = waiting; will activate when an earlier slot ends
  // queue_status is 'queued' iff queue_position>0; null otherwise.
  // Read-side filtering: every "currently supporting" query MUST
  // include `(queue_position IS NULL OR queue_position = 0)`.
  // See src/lib/queue.ts for the canonical helpers.
  queue_position: number | null;
  queued_starts_at: string | null;
  queued_ends_at: string | null;
  queue_status: string | null;
};

const FULL_FIELDS = [
  "id", "donor", "payment_mode", "amount_usd", "currency", "status",
  "stripe_subscription_id", "stripe_payment_intent_id", "stripe_customer_id",
  "started_at", "ended_at", "cancelled_at", "next_billing_date",
  "total_paid_usd", "payment_count", "date_created",
  "checkout_fingerprint", "cancellation_reason",
  "paused_at", "modified_at", "modification_history",
  "duration_months", "payment_schedule",
  "prepaid_months_total", "prepaid_months_remaining", "scheduled_end_date",
  "cancellation_scheduled_at",
  "cause",
  "visibility",
  "queue_position", "queued_starts_at", "queued_ends_at", "queue_status",
  "child.id", "child.display_name", "child.Photo",
  "child.date_of_birth", "child.bd_district.name",
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
  // New duration + schedule fields.
  duration_months?: number | null;
  payment_schedule?: "monthly" | "monthly_prepaid" | null;
  prepaid_months_total?: number | null;
  prepaid_months_remaining?: number | null;
  scheduled_end_date?: string | null;
  // Coverage package / cause — donor's stated allocation intent.
  // Caller is expected to validate via isValidCause() before reaching
  // here; we forward whatever string is supplied (so an admin override
  // path could pass any value the Directus dropdown allows).
  cause?: string | null;
  // Public visibility — 'named' or 'anonymous'. Caller validates via
  // isValidVisibility() before reaching here.
  visibility?: string | null;
  // Queue fields (Session 14.7). When the sponsor flow detected the
  // child already has an active monthly sponsor and the donor opted
  // in to queue join, the checkout path passes these through. The
  // sponsorship row is still created with status='pending_payment';
  // the webhook flips it to 'active' on payment success and the
  // queue helpers handle promotion to position=0 when its slot
  // opens. Omitted on a normal (non-queued) join.
  queue_position?: number | null;
  queued_starts_at?: string | null;
  queued_ends_at?: string | null;
  queue_status?: string | null;
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
    duration_months: opts.duration_months ?? null,
    payment_schedule: opts.payment_schedule ?? null,
    prepaid_months_total: opts.prepaid_months_total ?? null,
    prepaid_months_remaining: opts.prepaid_months_remaining ?? null,
    scheduled_end_date: opts.scheduled_end_date ?? null,
    cause: opts.cause ?? null,
    visibility: opts.visibility ?? null,
    queue_position: opts.queue_position ?? null,
    queued_starts_at: opts.queued_starts_at ?? null,
    queued_ends_at: opts.queued_ends_at ?? null,
    queue_status: opts.queue_status ?? null,
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

// ─── Single-row fetch + ownership ────────────────────────────────────────────
// Used by the detail page and the donor-action API routes. Returns null
// if the row doesn't exist OR isn't owned by `donorId` — callers should
// 404 in either case (don't reveal existence to non-owners).
export async function getSponsorshipForDonor(
  sponsorshipId: string,
  donorId: string,
): Promise<Sponsorship | null> {
  if (!UUID_RE.test(sponsorshipId) || !UUID_RE.test(donorId)) return null;
  try {
    const row = (await directusServer().request(
      readItem("sponsorship" as never, sponsorshipId as never, {
        fields: [...FULL_FIELDS],
      } as never),
    )) as unknown as Sponsorship | null;
    if (!row || row.donor !== donorId) return null;
    return row;
  } catch (err) {
    // 403/404 from Directus also lands here — treat as not-found.
    console.warn(
      "[sponsorship-data] getSponsorshipForDonor failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Payments for a sponsorship ─────────────────────────────────────────────
export type PaymentRow = {
  id: string;
  amount_usd: number;
  currency: string;
  status: string;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_method_type: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  date_created: string | null;
};

export async function getPaymentsForSponsorship(
  sponsorshipId: string,
): Promise<PaymentRow[]> {
  if (!UUID_RE.test(sponsorshipId)) return [];
  try {
    const rows = (await directusServer().request(
      readItems("payment" as never, {
        filter: { sponsorship: { _eq: sponsorshipId } },
        fields: [
          "id",
          "amount_usd",
          "currency",
          "status",
          "stripe_charge_id",
          "stripe_invoice_id",
          "stripe_payment_intent_id",
          "payment_method_type",
          "failure_reason",
          "paid_at",
          "date_created",
        ],
        sort: ["-paid_at"],
        limit: -1,
      } as never),
    )) as unknown as PaymentRow[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] getPaymentsForSponsorship failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Child updates timeline ─────────────────────────────────────────────────
export type ChildUpdate = {
  id: string;
  title: string | null;
  content: string | null;
  type: string | null;
  photo: string | null;
  published_at: string | null;
};

// ─── Child-lock lookups (Session 14.6) ───────────────────────────────────────
//
// Rule 1 — Monthly exclusivity: a child can have AT MOST ONE active
// monthly subscription at a time. The sponsor flow blocks `monthly`
// mode when one already exists; checkout/init re-checks before
// creating Stripe objects to defend against simultaneous-tab races.
//
// "Active monthly" means `status='active' AND payment_mode='monthly'`.
// `payment_schedule` doesn't matter — recurring (monthly), prepaid
// (monthly_prepaid), and fixed-term recurring all count. One-time
// gifts are NOT subject to this lock.

export type ActiveMonthlySponsor = {
  sponsorshipId: string;
  donorId: string;
  visibility: string | null;
  scheduledEndDate: string | null;
  cancellationScheduledAt: string | null;
  donorFirstName: string | null;
};

// Single-child lookup. Used by /sponsor/[childId] (server-side lock
// check) and /children/[id] (banner data). Returns the single active
// monthly sponsorship row for a child, or null if none. If multiple
// somehow exist (data integrity issue: two checkouts raced past the
// guard), logs loudly and returns the most recent.
//
// CURRENTLY-SUPPORTING SEMANTICS (Session 14.7):
// Filters `(queue_position IS NULL OR queue_position = 0)` so that
// queued rows (status='active' but waiting) are excluded — they're
// committed money, but they're not the donor whose name appears on
// the public page right now. Use src/lib/queue.ts → getQueueForChild
// when you need the full queue (active + queued).
export async function getActiveMonthlySponsorForChild(
  childId: string,
): Promise<ActiveMonthlySponsor | null> {
  if (!UUID_RE.test(childId)) return null;
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
            {
              _or: [
                { queue_position: { _null: true } },
                { queue_position: { _eq: 0 } },
              ],
            },
          ],
        },
        fields: [
          "id",
          // Ask for donor.id explicitly: requesting bare "donor"
          // alongside "donor.first_name" makes Directus expand the
          // relation, but the expanded object only contains the
          // sub-fields you list. Without "donor.id" the resulting
          // object has no id, the fallback yields donorId="", and
          // every same-donor exemption check incorrectly fires the
          // lock. Asking for both id + first_name keeps the helper's
          // existing extraction logic correct.
          "donor.id",
          "donor.first_name",
          "visibility",
          "scheduled_end_date",
          "cancellation_scheduled_at",
          "date_created",
        ],
        sort: ["-date_created"],
        limit: 5,
      } as never),
    )) as unknown as Array<{
      id: string;
      donor:
        | string
        | { id?: string; first_name?: string | null }
        | null;
      visibility?: string | null;
      scheduled_end_date?: string | null;
      cancellation_scheduled_at?: string | null;
      date_created?: string | null;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (rows.length > 1) {
      console.warn(
        `[sponsorship-data] getActiveMonthlySponsorForChild: ${rows.length} active monthly rows for child ${childId} — data-integrity issue. Returning most recent.`,
      );
    }
    const row = rows[0]!;
    const donorObj = typeof row.donor === "object" && row.donor !== null
      ? row.donor
      : null;
    const donorId =
      typeof row.donor === "string"
        ? row.donor
        : donorObj?.id ?? "";
    return {
      sponsorshipId: String(row.id),
      donorId: String(donorId),
      visibility: row.visibility ?? null,
      scheduledEndDate: row.scheduled_end_date ?? null,
      cancellationScheduledAt: row.cancellation_scheduled_at ?? null,
      donorFirstName: donorObj?.first_name ?? null,
    };
  } catch (err) {
    console.warn(
      "[sponsorship-data] getActiveMonthlySponsorForChild failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// Bulk lookup. Used by /children (the public list) to badge cards
// that already have a monthly sponsor. Returns the set of child ids
// (subset of the input) that currently have one. Empty input → empty
// set, single Directus round-trip.
//
// Same currently-supporting semantics as getActiveMonthlySponsorForChild:
// excludes queued rows (queue_position > 0) so a child whose only
// 'active' rows are queued reads as unsponsored on the badge.
export async function getMonthlySponsoredChildIds(
  childIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  const valid = childIds.filter((id) => UUID_RE.test(id));
  if (valid.length === 0) return new Set();
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _in: valid } },
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
            {
              _or: [
                { queue_position: { _null: true } },
                { queue_position: { _eq: 0 } },
              ],
            },
          ],
        },
        fields: ["child"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ child: string | { id: string } }>;
    const out = new Set<string>();
    for (const r of rows ?? []) {
      const id = typeof r.child === "string" ? r.child : r.child?.id;
      if (id) out.add(id);
    }
    return out;
  } catch (err) {
    console.warn(
      "[sponsorship-data] getMonthlySponsoredChildIds failed",
      err instanceof Error ? err.message : err,
    );
    return new Set();
  }
}

// ─── Partition helpers ───────────────────────────────────────────────────────
//
// Locked in 13.5c Part C revision #2: the dashboard sectioning is
// relationship-based, not status-based. A one-time gift's row is
// status='active' in the DB (the gift was successfully made and isn't
// scheduled to recur), but it's not an ongoing sponsorship — there's no
// future commitment. Treat one-times as "past gifts" alongside
// completed subscriptions; "Currently sponsoring" surfaces only ongoing
// monthly relationships.
//
// These three predicates partition the donor's displayable sponsorships
// (active, completed, cancelled — pending is a separate transient
// bucket) into three exclusive groups. Both the home preview and
// /dashboard/sponsorships use them so the sectioning can never drift.

// Session 14.7: queued rows carry status='active' but they're not yet
// supporting the child. Use isQueuedSponsorship to bucket them into
// the dashboard's "Upcoming sponsorships" surface; isOngoingSponsorship
// excludes them so they don't double-render in "Currently sponsoring".
function isQueued(s: Sponsorship): boolean {
  return (s.queue_position ?? 0) > 0;
}

export function isOngoingSponsorship(s: Sponsorship): boolean {
  return (
    s.status === "active" &&
    s.payment_mode === "monthly" &&
    !isQueued(s)
  );
}

export function isQueuedSponsorship(s: Sponsorship): boolean {
  return s.status === "active" && isQueued(s);
}

export function isPastGiftOrSponsorship(s: Sponsorship): boolean {
  return (
    (s.status === "active" && s.payment_mode === "one_time") ||
    s.status === "completed"
  );
}

export function isCancelledSponsorship(s: Sponsorship): boolean {
  return s.status === "cancelled";
}

// ─── Sort comparators ────────────────────────────────────────────────────────
//
// `sortSponsorshipsByPriority` is used for the "Currently sponsoring" view
// (dashboard home preview + /dashboard/sponsorships first section). The
// rule, locked in 13.5c Part C: prepaid sponsorships first (donor pre-paid
// for a fixed window — they're the most committed), then ongoing recurring
// subscriptions, then one-time gifts. Within each tier, newest first.
//
// `sortSponsorshipsByEnded` powers "Previously supported": the most-
// recently-ended row at the top, regardless of how it ended (completed /
// cancelled). Falls back to date_created for safety.
function priorityScore(s: Sponsorship): number {
  // Monthly recurring is the primary commitment shape; indefinite rows
  // have payment_schedule=null in this codebase (only fixed-term sets
  // payment_schedule='monthly'), so we key off payment_mode='monthly'
  // and only special-case the prepaid sub-shape. Earlier this branch
  // required `payment_schedule === 'monthly'`, which mis-scored
  // indefinite recurring rows to the unknown sentinel and let them
  // sort AFTER one-time gifts (Part C revision diagnosis).
  if (s.payment_mode === "monthly") {
    return s.payment_schedule === "monthly_prepaid" ? 1 : 2;
  }
  if (s.payment_mode === "one_time") return 3;
  return 99; // genuine unknown — sink to bottom rather than throwing
}

export function sortSponsorshipsByPriority<T extends Sponsorship>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const pa = priorityScore(a);
    const pb = priorityScore(b);
    if (pa !== pb) return pa - pb;
    const da = a.date_created ?? "";
    const db = b.date_created ?? "";
    // Newest first; localeCompare handles ISO strings correctly.
    return db.localeCompare(da);
  });
}

function endTimestamp(s: Sponsorship): number {
  // Ordered fallback: ended_at (set by the cron when prepaid/fixed-term
  // wraps up), cancelled_at (donor-initiated cancel), scheduled_end_date
  // (still future-dated when status flipped via cron), date_created
  // (last-resort tie-break).
  const iso =
    s.ended_at ?? s.cancelled_at ?? s.scheduled_end_date ?? s.date_created;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function sortSponsorshipsByEnded<T extends Sponsorship>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => endTimestamp(b) - endTimestamp(a));
}

export async function getApprovedChildUpdates(
  childId: string,
  limit = 20,
): Promise<ChildUpdate[]> {
  if (!UUID_RE.test(childId)) return [];
  const nowIso = new Date().toISOString();
  try {
    const rows = (await directusServer().request(
      readItems("child_update" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "approved" } },
            { published_at: { _lte: nowIso } },
          ],
        },
        fields: ["id", "title", "content", "type", "photo", "published_at"],
        sort: ["-published_at"],
        limit,
      } as never),
    )) as unknown as ChildUpdate[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[sponsorship-data] getApprovedChildUpdates failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
