// Session 61 — Admin-side sponsorship reads + Stripe charge lookups.
//
// Distinct from the donor's sponsorship-data.ts because:
//   1. No donor scope filter — admin sees every sponsorship across
//      every donor.
//   2. List path resolves donor name + email + child name + child
//      photo in batched lookups so the queue list is one trip per
//      collection regardless of row count.
//   3. Stripe charge listing for the refund flow.
//
// Mutations stay out of this module — they live in thin admin
// endpoints under /api/admin/sponsorships/[id]/* and reuse the
// existing Stripe + updateSponsorship plumbing.

import "server-only";

import { readItem, readItems, readUsers } from "@directus/sdk";
import type Stripe from "stripe";
import { directusServer } from "./directus";
import { getStripe } from "./stripe-client";
import type {
  Sponsorship,
  SponsorshipStatus,
} from "./sponsorship-data";

// ─── Public types ───────────────────────────────────────────────────

export type SponsorshipListFilter = SponsorshipStatus | "all";

export interface AdminSponsorshipSummary {
  id: string;
  status: SponsorshipStatus;
  // Display-name fallback "Anonymous" when visibility !== 'named' OR
  // we couldn't resolve the donor row.
  donor_label: string;
  donor_email: string | null;
  donor_id: string | null;
  child_label: string;
  child_id: string | null;
  child_photo_uuid: string | null;
  child_status: string | null;
  // Payment shape — one of "monthly" | "one_time" | "monthly_prepaid"
  // (the last is a payment_schedule on a monthly row).
  payment_label: string;
  amount_usd: number;
  currency: string;
  started_at: string | null;
  // Best available "last payment" timestamp — prefers updated count
  // from payment.paid_at via the totals; falls back to started_at.
  last_payment_at: string | null;
  total_paid_usd: number;
  payment_count: number;
  // Queue position (0 / null = currently supporting; 1+ = queued).
  queue_position: number | null;
}

export interface AdminSponsorshipDetail {
  id: string;
  // Full underlying row so the detail page can render every column
  // without us having to re-list every field here.
  raw: Sponsorship;
  donor_label: string;
  donor_email: string | null;
  donor_id: string | null;
  donor_first_name: string | null;
  donor_last_name: string | null;
  donor_country: string | null;
  donor_signup_at: string | null;
  donor_total_sponsorships: number;
  child_label: string;
  child_id: string | null;
  child_photo_uuid: string | null;
  child_status: string | null;
  child_district: string | null;
  payment_label: string;
}

// ─── Internal row shape ─────────────────────────────────────────────

type SponsorshipRowFlat = {
  id: string;
  donor: string | null;
  child:
    | string
    | {
        id: string;
        display_name?: string | null;
        Photo?: string | null;
        status?: string | null;
        bd_district?: { name?: string | null } | null;
      }
    | null;
  status: string | null;
  payment_mode: string | null;
  payment_schedule: string | null;
  amount_usd: number | null;
  currency: string | null;
  started_at: string | null;
  next_billing_date: string | null;
  total_paid_usd: number | null;
  payment_count: number | null;
  date_created: string | null;
  visibility: string | null;
  queue_position: number | null;
} & Partial<Record<string, unknown>>;

const LIST_FIELDS = [
  "id",
  "donor",
  "status",
  "payment_mode",
  "payment_schedule",
  "amount_usd",
  "currency",
  "started_at",
  "next_billing_date",
  "total_paid_usd",
  "payment_count",
  "date_created",
  "visibility",
  "queue_position",
  "child.id",
  "child.display_name",
  "child.Photo",
  "child.status",
  "child.bd_district.name",
] as const;

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  // Detail page needs the whole donor-data shape for the action
  // buttons + Stripe IDs.
  "stripe_subscription_id",
  "stripe_payment_intent_id",
  "stripe_customer_id",
  "ended_at",
  "cancelled_at",
  "paused_at",
  "modified_at",
  "modification_history",
  "cancellation_reason",
  "cancellation_scheduled_at",
  "duration_months",
  "prepaid_months_total",
  "prepaid_months_remaining",
  "scheduled_end_date",
  "cause",
  "checkout_fingerprint",
  "queued_starts_at",
  "queued_ends_at",
  "queue_status",
  "shift_decision_required",
  "shift_decision_required_at",
  "shift_decision",
  "shift_decision_at",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

// Session 61.1 hotfix — Directus REST returns Postgres NUMERIC /
// DECIMAL columns (amount_usd, total_paid_usd) as STRINGS to preserve
// precision, despite our TS types declaring them `number`. Passing a
// string straight through to `.toFixed()` downstream blew up with
// "(amount ?? 0).toFixed is not a function" because `??` only handles
// null/undefined, so "15.00" survived unchanged and String.prototype
// has no .toFixed. Coerce at the boundary so the rest of the code
// sees real numbers — the formatMoney functions in the pages have
// also been hardened as defence-in-depth, but THIS is the proper fix.
//
// Same boundary applies to integer columns like payment_count: TS
// says `number`, runtime says string for some pg drivers, and a
// comparison like `payment_count === 1` would silently fail.
function toMoney(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toIntCount(v: unknown): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Coerce monetary fields inside the modification_history JSON blob.
// Each entry's from_amount / to_amount come back as strings for the
// same NUMERIC-column reason. The detail page renders these via
// formatMoney(m.from_amount, ...) so they'd hit the same crash.
function coerceModificationHistory(
  raw: unknown,
): Array<{ from_amount: number; to_amount: number; at: string; reason?: string | null }> | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      from_amount: toMoney(e.from_amount),
      to_amount: toMoney(e.to_amount),
      at: typeof e.at === "string" ? e.at : "",
      reason: typeof e.reason === "string" ? e.reason : null,
    };
  });
}

function isStatus(s: string | null): s is SponsorshipStatus {
  return (
    s === "pending_payment" ||
    s === "active" ||
    s === "paused" ||
    s === "cancelled" ||
    s === "completed" ||
    s === "failed"
  );
}

function paymentLabel(
  payment_mode: string | null,
  payment_schedule: string | null,
  prepaidRemaining?: number | null,
): string {
  if (payment_mode === "one_time") return "One-time";
  if (payment_schedule === "monthly_prepaid") {
    return prepaidRemaining !== undefined && prepaidRemaining !== null
      ? `Prepaid (${prepaidRemaining} mo left)`
      : "Prepaid";
  }
  return "Monthly";
}

function unwrapChildId(c: SponsorshipRowFlat["child"]): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  return c.id ?? null;
}

type DonorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  date_created: string | null;
  country: string | null;
};

async function resolveDonors(
  donorIds: string[],
): Promise<Map<string, DonorRow>> {
  const out = new Map<string, DonorRow>();
  if (donorIds.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readUsers({
        filter: { id: { _in: donorIds } },
        fields: [
          "id",
          "first_name",
          "last_name",
          "email",
          "date_created",
          "country",
        ],
        limit: -1,
      } as never),
    )) as unknown as DonorRow[] | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) out.set(r.id, r);
    }
  } catch (err) {
    console.warn(
      "[admin-sponsorships] resolveDonors failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

function donorLabelFor(
  donor: DonorRow | undefined,
  visibility: string | null,
): string {
  if (!donor) return "Anonymous";
  // Admin always sees the donor's real name; the visibility flag
  // only affects donor-facing display on /children/[id]. But we
  // surface the "Anonymous" tag in the label so admin understands
  // what the public sees vs what we know.
  const name =
    [donor.first_name, donor.last_name]
      .filter((s) => s && s.trim().length > 0)
      .join(" ")
      .trim() || donor.email;
  return visibility === "named" ? name : `${name} (anon)`;
}

// ─── Public API: list ───────────────────────────────────────────────

/**
 * List sponsorships for the admin queue. Composable filters:
 *   - status   : SponsorshipStatus | "all"  (default 'active')
 *   - childId  : narrow to one child
 *   - donorId  : narrow to one donor
 *   - search   : matches sponsorship id, donor email, child name
 *                (case-insensitive substring; in-memory)
 * Sort: started_at desc (newest first); pending_payment rows after
 * all active rows in the 'all' bucket.
 *
 * Returns paginated { rows, total } via slice in memory — at the
 * scale of OG's sponsorship table (~hundreds active, low thousands
 * over time), this is the simplest correct approach. If the table
 * grows past 10k rows, switch to a Directus filter for childId /
 * donorId server-side and keep the search client-side.
 */
export async function listAdminSponsorships(opts?: {
  status?: SponsorshipListFilter;
  childId?: string | null;
  donorId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: AdminSponsorshipSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const status = opts?.status ?? "active";
  const childId = opts?.childId ?? null;
  const donorId = opts?.donorId ?? null;
  const search = (opts?.search ?? "").trim().toLowerCase();
  const pageSize = Math.max(1, Math.min(opts?.pageSize ?? 50, 200));
  const page = Math.max(1, opts?.page ?? 1);

  // Compose the Directus filter. Status + childId + donorId are
  // cheap server-side. Search is in-memory.
  const andClauses: Record<string, unknown>[] = [];
  if (status !== "all") andClauses.push({ status: { _eq: status } });
  if (childId) andClauses.push({ child: { _eq: childId } });
  if (donorId) andClauses.push({ donor: { _eq: donorId } });
  const filter =
    andClauses.length === 0 ? undefined : { _and: andClauses };

  let rows: SponsorshipRowFlat[] = [];
  try {
    const result = (await directusServer().request(
      readItems("sponsorship" as never, {
        ...(filter ? { filter } : {}),
        fields: [...LIST_FIELDS],
        // Newest-first: started_at desc; rows without started_at
        // (pending_payment) fall to the end naturally.
        sort: ["-started_at", "-date_created"],
        limit: -1,
      } as never),
    )) as unknown as SponsorshipRowFlat[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-sponsorships] listAdminSponsorships failed",
      err instanceof Error ? err.message : err,
    );
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  // Batched donor lookup. Child rows were already inlined via the
  // child.* field syntax above (Directus expands the M2O when
  // requested with dot-notation).
  const donorIds = Array.from(
    new Set(rows.map((r) => r.donor).filter((x): x is string => !!x)),
  );
  const donorByid = await resolveDonors(donorIds);

  // Build summaries.
  const summaries: AdminSponsorshipSummary[] = rows.map((r) => {
    const donor = r.donor ? donorByid.get(r.donor) : undefined;
    const childId = unwrapChildId(r.child);
    const childObj =
      r.child && typeof r.child !== "string" ? r.child : null;
    return {
      id: r.id,
      status: isStatus(r.status) ? r.status : "pending_payment",
      donor_label: donorLabelFor(donor, r.visibility),
      donor_email: donor?.email ?? null,
      donor_id: r.donor,
      child_label: childObj?.display_name ?? "Unknown child",
      child_id: childId,
      child_photo_uuid: childObj?.Photo ?? null,
      child_status: childObj?.status ?? null,
      payment_label: paymentLabel(
        r.payment_mode,
        r.payment_schedule,
        (r as { prepaid_months_remaining?: number | null })
          .prepaid_months_remaining,
      ),
      // Session 61.1 hotfix — Directus REST returns numeric(10,2)
      // columns as strings. toMoney / toIntCount coerce at the
      // boundary so downstream `.toFixed()` + numeric comparisons
      // work.
      amount_usd: toMoney(r.amount_usd),
      currency: r.currency ?? "USD",
      started_at: r.started_at,
      // Without a per-payment cron we don't track last_payment_at on
      // the sponsorship row; use next_billing_date as a coarse proxy
      // (next charge → most recent charge was 30 days ago). For one-
      // time / prepaid, started_at IS the last payment time.
      last_payment_at: r.started_at ?? r.date_created,
      total_paid_usd: toMoney(r.total_paid_usd),
      payment_count: toIntCount(r.payment_count),
      queue_position: r.queue_position,
    };
  });

  // In-memory search filter applied AFTER the donor lookup so we
  // can match donor email / child name (server-side filtering would
  // need a denormalised column).
  const filtered = search
    ? summaries.filter((s) => {
        return (
          s.id.toLowerCase().includes(search) ||
          s.donor_label.toLowerCase().includes(search) ||
          (s.donor_email ?? "").toLowerCase().includes(search) ||
          s.child_label.toLowerCase().includes(search)
        );
      })
    : summaries;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

// ─── Public API: detail ─────────────────────────────────────────────

export async function getAdminSponsorshipDetail(
  sponsorshipId: string,
): Promise<AdminSponsorshipDetail | null> {
  if (!sponsorshipId) return null;
  let row: SponsorshipRowFlat | null = null;
  try {
    const result = (await directusServer().request(
      readItem("sponsorship" as never, sponsorshipId as never, {
        fields: [...DETAIL_FIELDS],
      } as never),
    )) as unknown as SponsorshipRowFlat | null;
    row = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) return null;
    console.warn(
      "[admin-sponsorships] getAdminSponsorshipDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  const donor = row.donor
    ? (await resolveDonors([row.donor])).get(row.donor)
    : undefined;

  // Count this donor's total sponsorships (across all statuses).
  let donorTotalSponsorships = 0;
  if (row.donor) {
    try {
      const otherRows = (await directusServer().request(
        readItems("sponsorship" as never, {
          filter: { donor: { _eq: row.donor } },
          fields: ["id"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string }> | undefined;
      donorTotalSponsorships = Array.isArray(otherRows) ? otherRows.length : 0;
    } catch {
      // Non-fatal — count just stays at 0.
    }
  }

  const childObj =
    row.child && typeof row.child !== "string" ? row.child : null;
  const childId = unwrapChildId(row.child);
  const districtName =
    childObj?.bd_district && typeof childObj.bd_district === "object"
      ? childObj.bd_district.name ?? null
      : null;

  // Session 61.1 hotfix — coerce the monetary + count fields on the
  // raw row before exposing it via `raw`. The detail page reads
  // `detail.raw.amount_usd`, `detail.raw.total_paid_usd`, and walks
  // `detail.raw.modification_history` to render `formatMoney(...)`
  // for each entry's from_amount / to_amount. All three are
  // Postgres numeric(10,2) → string-typed at runtime.
  const coercedRaw = {
    ...(row as unknown as Sponsorship),
    amount_usd: toMoney(
      (row as unknown as { amount_usd?: unknown }).amount_usd,
    ),
    total_paid_usd: toMoney(
      (row as unknown as { total_paid_usd?: unknown }).total_paid_usd,
    ),
    payment_count: toIntCount(
      (row as unknown as { payment_count?: unknown }).payment_count,
    ),
    modification_history: coerceModificationHistory(
      (row as unknown as { modification_history?: unknown })
        .modification_history,
    ),
  } as Sponsorship;

  return {
    id: row.id,
    raw: coercedRaw,
    donor_label: donorLabelFor(donor, row.visibility),
    donor_email: donor?.email ?? null,
    donor_id: row.donor,
    donor_first_name: donor?.first_name ?? null,
    donor_last_name: donor?.last_name ?? null,
    donor_country: donor?.country ?? null,
    donor_signup_at: donor?.date_created ?? null,
    donor_total_sponsorships: donorTotalSponsorships,
    child_label: childObj?.display_name ?? "Unknown child",
    child_id: childId,
    child_photo_uuid: childObj?.Photo ?? null,
    child_status: childObj?.status ?? null,
    child_district: districtName,
    payment_label: paymentLabel(
      row.payment_mode,
      row.payment_schedule,
      (row as { prepaid_months_remaining?: number | null })
        .prepaid_months_remaining,
    ),
  };
}

// ─── Public API: Stripe charges for refund flow ─────────────────────

export interface AdminStripeCharge {
  id: string;
  amount_usd: number;
  currency: string;
  created: number;
  // ISO string for rendering
  created_iso: string;
  paid: boolean;
  refunded: boolean;
  amount_refunded_usd: number;
  status: string;
  description: string | null;
  payment_intent_id: string | null;
  receipt_url: string | null;
}

/**
 * Fetch the last N charges for a sponsorship's Stripe customer,
 * narrowed by metadata where possible. Returns at most 5 to keep
 * the admin refund picker focused on recent activity.
 *
 * Strategy:
 *   - If we know the Stripe Customer ID, list charges for that
 *     customer (most accurate, covers both PaymentIntent and
 *     legacy charge paths).
 *   - Else fall back to listing charges for the PaymentIntent
 *     (one-time / prepaid path).
 *
 * Best-effort: any Stripe error returns an empty list and a logged
 * warning rather than throwing — the admin refund button itself
 * gates on this list being non-empty.
 */
export async function listChargesForSponsorship(
  sponsorshipId: string,
  opts: {
    customerId?: string | null;
    paymentIntentId?: string | null;
    limit?: number;
  },
): Promise<AdminStripeCharge[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 50));
  const stripe = getStripe();

  let charges: Stripe.Charge[] = [];
  try {
    if (opts.customerId) {
      const res = await stripe.charges.list({
        customer: opts.customerId,
        limit,
      });
      charges = res.data;
    } else if (opts.paymentIntentId) {
      const res = await stripe.charges.list({
        payment_intent: opts.paymentIntentId,
        limit,
      });
      charges = res.data;
    } else {
      // Nothing to query on. Return empty so the admin UI surfaces
      // "no charges available to refund".
      return [];
    }
  } catch (err) {
    console.warn(
      `[admin-sponsorships] listChargesForSponsorship failed for ${sponsorshipId}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return charges.map((c) => ({
    id: c.id,
    amount_usd: typeof c.amount === "number" ? c.amount / 100 : 0,
    currency: (c.currency ?? "usd").toUpperCase(),
    created: c.created,
    created_iso: new Date(c.created * 1000).toISOString(),
    paid: !!c.paid,
    refunded: !!c.refunded,
    amount_refunded_usd:
      typeof c.amount_refunded === "number" ? c.amount_refunded / 100 : 0,
    status: c.status ?? "unknown",
    description: c.description ?? null,
    payment_intent_id:
      typeof c.payment_intent === "string" ? c.payment_intent : null,
    receipt_url: c.receipt_url ?? null,
  }));
}

// ─── Public API: count for nav badge ────────────────────────────────

/**
 * Count active sponsorships (currently supporting — excludes queued
 * rows). Used by the admin nav to surface the "live commitments"
 * number alongside the other queue badges.
 */
export async function countActiveSponsorships(): Promise<number | null> {
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            // queue_position null OR 0 = currently supporting
            {
              _or: [
                { queue_position: { _null: true } },
                { queue_position: { _eq: 0 } },
              ],
            },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[admin-sponsorships] countActiveSponsorships failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Internal ───────────────────────────────────────────────────────

function looksLikeNotFound(err: unknown): boolean {
  if (!err) return false;
  const errors = (err as { errors?: Array<{ extensions?: { code?: string } }> })
    .errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const code = e?.extensions?.code;
      if (code === "FORBIDDEN" || code === "ROUTE_NOT_FOUND") return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("FORBIDDEN") ||
    msg.includes("permission to access") ||
    msg.includes("not found")
  );
}
