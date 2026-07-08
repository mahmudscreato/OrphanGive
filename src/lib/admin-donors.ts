// Session 65 — Admin Donors data layer.
//
// Read-only side of the admin donors view: list with filters + sort +
// pagination, single-donor detail with aggregated sponsorship +
// lifetime-giving metrics, and the pending-approval count for the
// sidebar badge.
//
// Mutations live in `admin-donor-actions.ts` — same separation as
// admin-proposals-list.ts (reads) vs admin-proposals.ts (writes).
//
// Schema reality (donor-data.ts is the source of truth for the
// directus_users surface admin can read):
//
//   directus_users (donor-relevant columns):
//     id                          uuid PK
//     email                       string
//     first_name, last_name       string | null
//     status                      'draft' | 'active' | 'suspended' | …
//     og_country                  ISO 3166-1 alpha-2 string | null
//     og_phone                    raw string | null  (NEVER formatted)
//     og_admin_approval_status    'pending' | 'approved' | 'rejected' | …
//     og_admin_approved_at        ISO timestamp | null
//     og_agreed_to_terms_at       ISO timestamp | null
//     last_access                 ISO timestamp | null
//     date_created                ISO timestamp | null (Directus auto-fill)
//     og_profile_photo_url        Cloudinary secure_url | null
//     og_stripe_customer_id       string | null
//
// Suspend mechanism: directus_users.status='suspended'. Existing
// guards in /api/cart/add + the proxy already block suspended donors
// from new sponsorships and redirect them to /signin?error=suspended.
// Suspending a donor does NOT modify their existing sponsorships —
// they stay active until admin or the donor explicitly cancels them
// in the sponsorship surface. That's an intentional separation: the
// account lock is independent of the per-sponsorship lifecycle.
//
// Permissions: this module uses directusServer() (admin token) so it
// can read directus_users + sponsorship freely.
//
// Privacy: don't log donor PII (email, phone, address) in
// console.warn / console.error. The wrapper functions follow the
// admin-proposals-list.ts pattern and only log the operation name.

import "server-only";

import { readItems, readUser, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { COUNTRY_BY_CODE } from "./countries";
// SECURITY: every donor query MUST be scoped to donor roles so non-donor
// users (admins, Super Admin, DIs, and the service accounts) can never be
// listed, counted, or opened/suspended through the donor admin surface.
import { DONOR_ROLE_FILTER } from "./directus-roles";

// ─── Public types ───────────────────────────────────────────────────

export type DonorApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "not_started";

export type DonorAccountStatus =
  | "draft"
  | "active"
  | "suspended"
  | "pending_email_verification"
  | "unknown";

export interface AdminDonorSummary {
  id: string;
  // Resolved "FirstName LastName" or email when names are empty;
  // "Anonymous" when display_preference flag is set (not currently
  // wired on directus_users — we read first_name/last_name only).
  display_name: string;
  email: string;
  // ISO 3166-1 alpha-2 (e.g. "BD"); resolved name lives in
  // `country_name` for the UI.
  country_code: string | null;
  country_name: string | null;
  phone: string | null;
  approval_status: DonorApprovalStatus;
  account_status: DonorAccountStatus;
  // ISO timestamps.
  date_created: string | null;
  last_access: string | null;
  // Aggregates — null when we couldn't compute (e.g. Directus failed).
  // The list view treats null as "—" rather than "0" so we don't
  // imply false certainty.
  active_sponsorship_count: number | null;
  // Lifetime giving in USD major units (Stripe ships USD; the
  // sponsorship column is `amount_usd` per sponsorship-data.ts). UI
  // is responsible for currency formatting; data layer ships raw.
  lifetime_giving_usd: number | null;
}

export interface AdminDonorListPage {
  donors: AdminDonorSummary[];
  total: number;
  page: number;
  pageSize: number;
  // Distinct country codes present across the unfiltered population —
  // used by the country filter dropdown so admin only sees countries
  // that actually have donors. Sorted alphabetically by name.
  available_countries: Array<{ code: string; name: string }>;
}

export type DonorListSort =
  | "last_access_desc"
  | "date_created_desc"
  | "lifetime_giving_desc";

export interface ListAdminDonorsOpts {
  page?: number; // 1-indexed
  pageSize?: number; // default 50
  // 'all' opts out of any approval filter.
  approval?: DonorApprovalStatus | "all";
  country?: string | "all"; // ISO code or "all"
  hasActiveSponsorship?: "yes" | "no" | "all";
  // Trimmed free-text; matches against email, first_name, last_name,
  // og_phone. Empty string disables the search clause.
  search?: string;
  sort?: DonorListSort;
}

export interface AdminDonorSponsorship {
  id: string;
  child_id: string | null;
  child_name: string | null;
  payment_mode: "monthly" | "one_time" | string;
  amount_usd: number;
  currency: string;
  // Session 58.9 — donor-currency snapshot (new-flow rows). Both
  // null on legacy rows; the render uses the donor-currency value
  // when present and falls back to amount_usd otherwise.
  donor_currency_code: string | null;
  donor_currency_amount: number | null;
  // Session 58.9 — campaign signal. cause_tag is non-null on
  // one-time gifts (Buy a Cycle, etc.); donation_package is set for
  // any new-flow row regardless of type. Used to label campaign
  // donations rather than rendering "Unnamed child".
  cause_tag: string | null;
  donation_package_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
  total_paid_usd: number;
  payment_count: number;
  date_created: string | null;
}

export interface AdminDonorPaymentSummary {
  lifetime_giving_usd: number;
  total_charge_count: number; // sum of payment_count across sponsorships
  active_sponsorship_count: number;
  avg_monthly_usd: number | null; // null when no active monthly subs
  last_payment_iso: string | null; // best-effort: max(started_at) of charged rows
}

export interface AdminDonorDetail {
  // Identity + state
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  approval_status: DonorApprovalStatus;
  account_status: DonorAccountStatus;
  approval_decided_at: string | null;
  agreed_to_terms_at: string | null;
  date_created: string | null;
  last_access: string | null;
  // Contact
  country_code: string | null;
  country_name: string | null;
  phone: string | null;
  // Photo for the avatar tile
  profile_photo_url: string | null;
  // Stripe linkage (used by the dashboard link-out + future refund flows)
  stripe_customer_id: string | null;
  // Aggregates + sponsorship list
  sponsorships: AdminDonorSponsorship[];
  payments: AdminDonorPaymentSummary;
}

// ─── Internal types ─────────────────────────────────────────────────

type DonorRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  og_country: string | null;
  og_phone: string | null;
  og_admin_approval_status: string | null;
  og_admin_approved_at: string | null;
  og_agreed_to_terms_at: string | null;
  date_created: string | null;
  last_access: string | null;
  og_profile_photo_url: string | null;
  og_stripe_customer_id: string | null;
};

type SponsorshipRow = {
  id: string;
  donor: string | null;
  child:
    | string
    | { id?: string | null; display_name?: string | null }
    | null;
  payment_mode: string | null;
  amount_usd: number | string | null;
  currency: string | null;
  // Session 58.9 — new-flow snapshot fields. Nullable on legacy rows.
  donor_currency_code?: string | null;
  donor_currency_amount?: number | string | null;
  cause_tag?: string | null;
  donation_package?: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
  total_paid_usd: number | string | null;
  payment_count: number | string | null;
  date_created: string | null;
};

// Session 65-66-61.2 hotfix — `date_created` removed.
//
// On this Directus install, the admin token returns HTTP 403 for
// directus_users.date_created (the field either isn't on the
// schema or isn't in the donor read policy). Including it in
// `fields[]` made the WHOLE list query 403 → empty array → the
// page rendered "Showing 0 of 0 donors" while the sidebar badge
// (which only reads `id`) showed the real count of pending
// approvals. Verified via direct REST probe — see commit message.
//
// Downstream: AdminDonorSummary.date_created falls back to null;
// the "Signed up" column renders "—" until the column is granted
// to the admin policy (or a Directus schema fix surfaces it). The
// rest of the row still renders.
//
// Same drop applies to date_updated (also 403) — never asked for
// here, noting for parity with admin-children's fix.
const DONOR_FIELDS: ReadonlyArray<keyof DonorRow> = [
  "id",
  "email",
  "first_name",
  "last_name",
  "status",
  "og_country",
  "og_phone",
  "og_admin_approval_status",
  "og_admin_approved_at",
  "og_agreed_to_terms_at",
  "last_access",
  "og_profile_photo_url",
  "og_stripe_customer_id",
];

const SPONSORSHIP_FIELDS = [
  "id",
  "donor",
  "child.id",
  "child.display_name",
  "payment_mode",
  "amount_usd",
  "currency",
  // Session 58.9 — donor-currency snapshot + campaign signals.
  // All nullable on legacy rows; the donor-detail page falls back
  // to amount_usd / "Unnamed child" when these are absent.
  "donor_currency_code",
  "donor_currency_amount",
  "cause_tag",
  "donation_package",
  "status",
  "started_at",
  "ended_at",
  "cancelled_at",
  "total_paid_usd",
  "payment_count",
  "date_created",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

function normaliseApproval(s: string | null | undefined): DonorApprovalStatus {
  switch (s) {
    case "pending":
    case "approved":
    case "rejected":
      return s;
    // 'not_started' is the schema's default value for donors who
    // signed up before the approval gate shipped (the field can also
    // be null / empty on legacy rows). Collapse both to 'not_started'
    // so the filter pill behaves predictably.
    case "not_started":
    case "":
    case null:
    case undefined:
      return "not_started";
    default:
      return "not_started";
  }
}

function normaliseAccountStatus(
  s: string | null | undefined,
): DonorAccountStatus {
  if (s === "active" || s === "suspended" || s === "draft") return s;
  if (s === "pending_email_verification") return s;
  return "unknown";
}

function toNumber(n: number | string | null | undefined): number {
  if (n === null || n === undefined) return 0;
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayNameOf(row: DonorRow): string {
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  const full = [first, last].filter((s) => s.length > 0).join(" ");
  return full || row.email?.trim() || "(no name on file)";
}

function summarise(row: DonorRow): AdminDonorSummary {
  const code = (row.og_country ?? "").trim() || null;
  const country = code ? COUNTRY_BY_CODE[code] : undefined;
  return {
    id: row.id,
    display_name: displayNameOf(row),
    email: row.email?.trim() ?? "",
    country_code: code,
    country_name: country?.name ?? null,
    phone: row.og_phone?.trim() || null,
    approval_status: normaliseApproval(row.og_admin_approval_status),
    account_status: normaliseAccountStatus(row.status),
    // Session 65-66-61.2 hotfix — `row.date_created` is now
    // undefined at runtime because the field was dropped from
    // DONOR_FIELDS (403 on this Directus install). Coerce to null
    // so the AdminDonorSummary's `string | null` type holds.
    date_created: row.date_created ?? null,
    last_access: row.last_access,
    // Filled in by the caller when aggregates were fetched; default
    // null so the row is still renderable when aggregation is skipped.
    active_sponsorship_count: null,
    lifetime_giving_usd: null,
  };
}

// ─── Approval-bucket count for sidebar badge ────────────────────────

/**
 * Count donors waiting on first-time admin approval. Used by the
 * AdminSidebar to render the "Donors" tab's pending badge. Failure
 * returns 0 so the UI keeps rendering instead of blowing up.
 */
export async function countPendingDonorApprovals(): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readUsers({
        filter: {
          _and: [DONOR_ROLE_FILTER, { og_admin_approval_status: { _eq: "pending" } }],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[admin-donors] countPendingDonorApprovals failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// ─── List ───────────────────────────────────────────────────────────

/**
 * Paged donor list with filters + sort. Aggregates active sponsorship
 * count + lifetime giving for the rows in the current page only — we
 * fan out N queries (one batch per page), so a 50-row page is at most
 * one extra Directus round-trip total. (The sponsorship collection
 * doesn't support GROUP BY in REST, so client-side aggregation is the
 * pragmatic choice.)
 *
 * The donor list is fetched WITHOUT the aggregate filter `hasActiveSponsorship`
 * applied at the Directus layer (Directus's REST filter language
 * can't express "has a row in collection X"). When that filter is
 * 'yes' or 'no', we fetch a wider donor window (capped at 500) and
 * post-filter using the aggregate counts. UI surfaces a "showing X
 * of Y matching" line via `total`.
 */
export async function listAdminDonors(
  opts: ListAdminDonorsOpts = {},
): Promise<AdminDonorListPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 50));
  const approval = opts.approval ?? "all";
  const country = opts.country ?? "all";
  const hasActive = opts.hasActiveSponsorship ?? "all";
  const sort = opts.sort ?? "last_access_desc";
  const search = (opts.search ?? "").trim();

  // ── Build Directus filter ──
  const filters: Record<string, unknown>[] = [];
  if (approval !== "all") {
    if (approval === "not_started") {
      // not_started rows have either the literal 'not_started' value
      // OR an empty/null value (legacy). Match both.
      filters.push({
        _or: [
          { og_admin_approval_status: { _eq: "not_started" } },
          { og_admin_approval_status: { _null: true } },
          { og_admin_approval_status: { _eq: "" } },
        ],
      });
    } else {
      filters.push({ og_admin_approval_status: { _eq: approval } });
    }
  }
  if (country !== "all") {
    filters.push({ og_country: { _eq: country } });
  }
  if (search.length > 0) {
    filters.push({
      _or: [
        { email: { _icontains: search } },
        { first_name: { _icontains: search } },
        { last_name: { _icontains: search } },
        { og_phone: { _icontains: search } },
      ],
    });
  }

  // ── Sort ──
  //
  // Session 65-66-61.2 hotfix — `date_created` removed from every
  // sort clause for the same reason it's removed from `fields[]`
  // above. Directus rejects sort-on-unreadable-field with a 403
  // too (verified). The "date_created_desc" sort option is kept on
  // the user-visible API for forward compat (no caller passes it
  // today besides the dropdown that may sort by it), but with the
  // column unavailable it degrades to the same proxy sort as
  // last_access_desc.
  const sortClause = ((): string[] => {
    switch (sort) {
      case "date_created_desc":
      case "lifetime_giving_desc":
      case "last_access_desc":
      default:
        return ["-last_access"];
    }
  })();

  // When the post-filter `hasActiveSponsorship` is on, we widen the
  // raw fetch so the page can survive the post-filter discarding
  // some rows. Cap protects against runaway memory in pathological
  // installs.
  const rawFetchLimit =
    hasActive === "all" ? page * pageSize + pageSize : 500;

  // ── Donors: one Directus round-trip ──
  let rows: DonorRow[] = [];
  try {
    const result = (await directusServer().request(
      readUsers({
        // SECURITY: role scope is ALWAYS applied (first in the _and), so
        // the list can never surface a non-donor user regardless of the
        // other filters.
        filter: { _and: [DONOR_ROLE_FILTER, ...filters] },
        fields: [...DONOR_FIELDS],
        sort: sortClause,
        limit: rawFetchLimit,
      } as never),
    )) as unknown as DonorRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-donors] listAdminDonors raw fetch failed",
      err instanceof Error ? err.message : err,
    );
    rows = [];
  }

  if (rows.length === 0) {
    return {
      donors: [],
      total: 0,
      page,
      pageSize,
      available_countries: await fetchAvailableCountries(),
    };
  }

  // ── Aggregate active sponsorship counts + lifetime giving ──
  const aggregates = await loadDonorAggregates(rows.map((r) => r.id));

  // ── Build summaries, apply hasActiveSponsorship post-filter ──
  let summaries: AdminDonorSummary[] = rows.map((row) => {
    const s = summarise(row);
    const agg = aggregates.get(row.id);
    return {
      ...s,
      active_sponsorship_count: agg?.activeCount ?? 0,
      lifetime_giving_usd: agg?.lifetimeUsd ?? 0,
    };
  });
  if (hasActive === "yes") {
    summaries = summaries.filter((s) => (s.active_sponsorship_count ?? 0) > 0);
  } else if (hasActive === "no") {
    summaries = summaries.filter(
      (s) => (s.active_sponsorship_count ?? 0) === 0,
    );
  }

  // ── Lifetime-giving sort happens after aggregates land ──
  if (sort === "lifetime_giving_desc") {
    summaries.sort(
      (a, b) =>
        (b.lifetime_giving_usd ?? 0) - (a.lifetime_giving_usd ?? 0),
    );
  }

  // ── Paginate ──
  const total = summaries.length;
  const start = (page - 1) * pageSize;
  const slice = summaries.slice(start, start + pageSize);

  return {
    donors: slice,
    total,
    page,
    pageSize,
    available_countries: await fetchAvailableCountries(),
  };
}

// One scan over directus_users.og_country, deduped + resolved. Cheap
// enough at admin scale (a few thousand donors); cache one level up
// if it ever hurts. Fails silently → empty array → filter dropdown
// shows just "All countries".
async function fetchAvailableCountries(): Promise<
  Array<{ code: string; name: string }>
> {
  try {
    const rows = (await directusServer().request(
      readUsers({
        fields: ["og_country"],
        filter: {
          og_country: { _nnull: true },
        },
        limit: -1,
      } as never),
    )) as unknown as Array<{ og_country: string | null }> | undefined;
    if (!Array.isArray(rows)) return [];
    const codes = new Set<string>();
    for (const r of rows) {
      const code = (r.og_country ?? "").trim();
      if (code.length === 0) continue;
      if (!COUNTRY_BY_CODE[code]) continue;
      codes.add(code);
    }
    return Array.from(codes)
      .map((code) => ({ code, name: COUNTRY_BY_CODE[code]!.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn(
      "[admin-donors] fetchAvailableCountries failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// Aggregate active sponsorship count + lifetime giving for many
// donors in a single sponsorship read. Returns a map keyed by donor
// id. Donors with zero rows are NOT present in the map (callers
// should default to {0, 0}).
async function loadDonorAggregates(
  donorIds: string[],
): Promise<Map<string, { activeCount: number; lifetimeUsd: number }>> {
  const out = new Map<string, { activeCount: number; lifetimeUsd: number }>();
  if (donorIds.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { donor: { _in: donorIds } },
        // Minimal field set — counts + sums only.
        fields: ["donor", "status", "amount_usd", "total_paid_usd"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      donor: string | null;
      status: string | null;
      amount_usd: number | string | null;
      total_paid_usd: number | string | null;
    }> | undefined;
    if (!Array.isArray(rows)) return out;
    for (const r of rows) {
      if (!r.donor) continue;
      const entry = out.get(r.donor) ?? { activeCount: 0, lifetimeUsd: 0 };
      // Active count: rows with status='active'. Queue-position
      // semantics (queue_position>0 = waiting, =0/null = current)
      // intentionally NOT filtered here — admin's "active sponsorship
      // count" includes queued-but-paid donors so the donor record
      // reflects every commitment, current or pending activation.
      if (r.status === "active") entry.activeCount += 1;
      // Lifetime giving: sum of total_paid_usd across ALL statuses.
      // Cancelled / completed sponsorships still contributed money.
      entry.lifetimeUsd += toNumber(r.total_paid_usd);
      out.set(r.donor, entry);
    }
  } catch (err) {
    console.warn(
      "[admin-donors] loadDonorAggregates failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

// ─── Detail ─────────────────────────────────────────────────────────

/**
 * Single-donor read for the admin detail page. Returns null when the
 * donor doesn't exist OR Directus rejects the read (4xx). We use
 * readUser via the admin token so the donor access policy doesn't
 * gate us.
 *
 * Aggregates: pulls the donor's full sponsorship list once and
 * computes the payment summary in-memory. The detail page renders
 * BOTH the per-sponsorship table AND the aggregate panel, so a
 * single read is the right cost.
 */
export async function getAdminDonorDetail(
  donorId: string,
): Promise<AdminDonorDetail | null> {
  if (!donorId) return null;

  let donorRow: DonorRow | null = null;
  try {
    const result = (await directusServer().request(
      readUser(donorId, { fields: [...DONOR_FIELDS] } as never),
    )) as unknown as DonorRow | null | undefined;
    donorRow = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) return null;
    console.warn(
      "[admin-donors] getAdminDonorDetail user read failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!donorRow) return null;

  // Sponsorships — one read for the per-donor table.
  let sponsorshipRows: SponsorshipRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { donor: { _eq: donorId } },
        fields: [...SPONSORSHIP_FIELDS],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as SponsorshipRow[] | undefined;
    if (Array.isArray(result)) sponsorshipRows = result;
  } catch (err) {
    console.warn(
      "[admin-donors] getAdminDonorDetail sponsorship read failed",
      err instanceof Error ? err.message : err,
    );
  }

  const sponsorships: AdminDonorSponsorship[] = sponsorshipRows.map((r) => {
    const childObj = typeof r.child === "object" && r.child !== null ? r.child : null;
    const childId = childObj?.id ?? (typeof r.child === "string" ? r.child : null);
    const childName = childObj?.display_name ?? null;
    return {
      id: r.id,
      child_id: childId ?? null,
      child_name: childName,
      payment_mode: r.payment_mode ?? "monthly",
      amount_usd: toNumber(r.amount_usd),
      currency: r.currency ?? "USD",
      // Session 58.9 — donor-currency + campaign context.
      donor_currency_code: r.donor_currency_code ?? null,
      donor_currency_amount:
        r.donor_currency_amount == null
          ? null
          : toNumber(r.donor_currency_amount),
      cause_tag: r.cause_tag ?? null,
      donation_package_id: r.donation_package ?? null,
      status: r.status ?? "pending_payment",
      started_at: r.started_at,
      ended_at: r.ended_at,
      cancelled_at: r.cancelled_at,
      total_paid_usd: toNumber(r.total_paid_usd),
      payment_count: Math.round(toNumber(r.payment_count)),
      date_created: r.date_created,
    };
  });

  // Compute payment summary in one pass.
  let lifetime = 0;
  let chargeCount = 0;
  let activeCount = 0;
  let monthlyActiveTotal = 0;
  let monthlyActiveN = 0;
  let lastPaymentIso: string | null = null;
  for (const s of sponsorships) {
    lifetime += s.total_paid_usd;
    chargeCount += s.payment_count;
    if (s.status === "active") {
      activeCount += 1;
      if (s.payment_mode === "monthly") {
        monthlyActiveTotal += s.amount_usd;
        monthlyActiveN += 1;
      }
    }
    if (s.payment_count > 0 && s.started_at) {
      // Best-effort "last payment date" approximation. We don't have
      // sponsorship_charge access here yet; the started_at of the
      // latest paid sponsorship is the closest proxy, which is what
      // shows up in the existing donor dashboard.
      if (!lastPaymentIso || s.started_at > lastPaymentIso) {
        lastPaymentIso = s.started_at;
      }
    }
  }

  const summary = summarise(donorRow);

  return {
    id: donorRow.id,
    email: donorRow.email?.trim() ?? "",
    first_name: donorRow.first_name?.trim() || null,
    last_name: donorRow.last_name?.trim() || null,
    display_name: summary.display_name,
    approval_status: summary.approval_status,
    account_status: summary.account_status,
    approval_decided_at: donorRow.og_admin_approved_at,
    agreed_to_terms_at: donorRow.og_agreed_to_terms_at,
    // Session 65-66-61.2 hotfix — see summarise() for the same fix.
    date_created: donorRow.date_created ?? null,
    last_access: donorRow.last_access,
    country_code: summary.country_code,
    country_name: summary.country_name,
    phone: summary.phone,
    profile_photo_url: donorRow.og_profile_photo_url,
    stripe_customer_id: donorRow.og_stripe_customer_id,
    sponsorships,
    payments: {
      lifetime_giving_usd: lifetime,
      total_charge_count: chargeCount,
      active_sponsorship_count: activeCount,
      avg_monthly_usd: monthlyActiveN > 0 ? monthlyActiveTotal / monthlyActiveN : null,
      last_payment_iso: lastPaymentIso,
    },
  };
}

// ─── Failure-mode helpers ───────────────────────────────────────────

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
