// Session 65 — Admin Donors list.
//
// Server component. Filter pills (approval status + country +
// has-active-sponsorship), search box (name / email / phone), sort
// selector, and a paginated table of donors.
//
// URL state shape (all optional, all parsed via parseSearchParams):
//   ?approval=pending|approved|rejected|not_started|all
//   ?country=BD|US|…|all
//   ?has=yes|no|all
//   ?q=<search>
//   ?sort=last_access_desc|date_created_desc|lifetime_giving_desc
//   ?page=<n>
//
// All filter changes round-trip through the URL so the back button
// works + the page is shareable to another admin.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  listAdminDonors,
  type AdminDonorSummary,
  type DonorApprovalStatus,
  type DonorListSort,
} from "@/lib/admin-donors";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";

// Donor admin-approval was removed (getDonorState maps active→approved), so
// the "Pending" and "Not started" approval buckets are defunct — there is
// nothing to approve. Only "Rejected" (a real moderation block) and "All"
// remain useful. ("Approved" kept as a legacy subset — see report note.)
// The parseApproval helper still accepts the dropped values from the URL,
// so old bookmarks degrade gracefully rather than error.
const APPROVAL_TABS: ReadonlyArray<{
  value: DonorApprovalStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const SORT_OPTIONS: ReadonlyArray<{ value: DonorListSort; label: string }> = [
  { value: "last_access_desc", label: "Most recently active" },
  { value: "date_created_desc", label: "Newest signups" },
  { value: "lifetime_giving_desc", label: "Highest lifetime giving" },
];

function parseApproval(s: string | undefined): DonorApprovalStatus | "all" {
  if (
    s === "all" ||
    s === "pending" ||
    s === "approved" ||
    s === "rejected" ||
    s === "not_started"
  ) {
    return s;
  }
  return "all";
}

function parseHasActive(s: string | undefined): "yes" | "no" | "all" {
  return s === "yes" || s === "no" ? s : "all";
}

function parseSort(s: string | undefined): DonorListSort {
  if (
    s === "last_access_desc" ||
    s === "date_created_desc" ||
    s === "lifetime_giving_desc"
  ) {
    return s;
  }
  return "last_access_desc";
}

function parsePage(s: string | undefined): number {
  if (!s) return 1;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function buildHref(
  base: {
    approval: DonorApprovalStatus | "all";
    country: string;
    has: "yes" | "no" | "all";
    q: string;
    sort: DonorListSort;
    page: number;
  },
  overrides: Partial<{
    approval: DonorApprovalStatus | "all";
    country: string;
    has: "yes" | "no" | "all";
    q: string;
    sort: DonorListSort;
    page: number;
  }>,
): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (merged.approval !== "all") params.set("approval", merged.approval);
  if (merged.country !== "all" && merged.country.length > 0)
    params.set("country", merged.country);
  if (merged.has !== "all") params.set("has", merged.has);
  if (merged.q.trim().length > 0) params.set("q", merged.q.trim());
  if (merged.sort !== "last_access_desc") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/admin/donors?${qs}` : "/admin/donors";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatMoneyUsd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function AdminDonorsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    approval?: string;
    country?: string;
    has?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const approval = parseApproval(sp.approval);
  const country = sp.country?.trim() || "all";
  const has = parseHasActive(sp.has);
  const sort = parseSort(sp.sort);
  const search = (sp.q ?? "").trim();
  const page = parsePage(sp.page);

  const result = await listAdminDonors({
    approval,
    country,
    hasActiveSponsorship: has,
    search,
    sort,
    page,
    pageSize: 50,
  });

  const base = { approval, country, has, q: search, sort, page };

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Donors"
        subtitle="Every account that has signed up to sponsor a child. Approve new donors, suspend troublemakers, and trace lifetime giving."
      />

      {/* Filter row 1: approval pills */}
      <nav
        className="mb-4 flex flex-wrap gap-2"
        aria-label="Donor approval status filter"
      >
        {APPROVAL_TABS.map((tab) => {
          const isActive = approval === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref(base, { approval: tab.value, page: 1 })}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-tangerine text-white"
                  : "bg-white border border-stone-200 text-ink-soft hover:border-tangerine-soft hover:text-tangerine-deeper"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Filter row 2: search + country + has-active + sort. All form-
          driven so a single Apply press round-trips a single URL. */}
      <form
        action="/admin/donors"
        method="GET"
        className="mb-5 grid grid-cols-1 md:grid-cols-12 gap-3"
      >
        {/* Preserve current approval as a hidden input so changing
            another filter doesn't drop the active tab. */}
        {approval !== "all" ? (
          <input type="hidden" name="approval" value={approval} />
        ) : null}

        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search name, email, or phone…"
          className="md:col-span-5 rounded-xl border border-ink/[0.12] bg-white px-4 py-2.5 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Search donors"
        />

        <select
          name="country"
          defaultValue={country}
          className="md:col-span-3 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Country filter"
        >
          <option value="all">All countries</option>
          {result.available_countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          name="has"
          defaultValue={has}
          className="md:col-span-2 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Has active sponsorship filter"
        >
          <option value="all">Any sponsorship</option>
          <option value="yes">Has active</option>
          <option value="no">No active</option>
        </select>

        <select
          name="sort"
          defaultValue={sort}
          className="md:col-span-2 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="md:col-span-12 flex justify-end gap-2">
          {(search.length > 0 ||
            country !== "all" ||
            has !== "all" ||
            sort !== "last_access_desc") ? (
            <Link
              href={buildHref(
                {
                  approval,
                  country: "all",
                  has: "all",
                  q: "",
                  sort: "last_access_desc",
                  page: 1,
                },
                {},
              )}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              Clear filters
            </Link>
          ) : null}
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 rounded-full bg-ink text-white font-medium text-[13.5px] hover:bg-ink-soft transition-colors"
          >
            Apply
          </button>
        </div>
      </form>

      {/* Count summary */}
      <p className="mb-4 text-[13px] text-ink-soft">
        Showing {result.donors.length} of {result.total} donor
        {result.total === 1 ? "" : "s"}
        {result.donors.length < result.total
          ? ` (page ${result.page} of ${Math.max(1, Math.ceil(result.total / result.pageSize))})`
          : null}
      </p>

      {result.donors.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Desktop: table; mobile: stacked cards. Tailwind hidden+block
              toggles cover both layouts from one server render. */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="min-w-full text-[13.5px]">
              <thead className="bg-stone-50 text-ink-soft font-medium">
                <tr>
                  <th className="text-left px-4 py-2.5">Donor</th>
                  <th className="text-left px-4 py-2.5">Country</th>
                  <th className="text-left px-4 py-2.5">Approval</th>
                  <th className="text-left px-4 py-2.5">Signed up</th>
                  <th className="text-left px-4 py-2.5">Last active</th>
                  <th className="text-right px-4 py-2.5">Active</th>
                  <th className="text-right px-4 py-2.5">Lifetime</th>
                  <th className="text-right px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {result.donors.map((d) => (
                  <DonorRowTable key={d.id} donor={d} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden space-y-2">
            {result.donors.map((d) => (
              <DonorRowCard key={d.id} donor={d} />
            ))}
          </ul>
        </>
      )}

      {/* Pagination */}
      {result.total > result.pageSize ? (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between"
        >
          {result.page > 1 ? (
            <Link
              href={buildHref(base, { page: result.page - 1 })}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-ink-soft">
            Page {result.page} of{" "}
            {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </span>
          {result.page * result.pageSize < result.total ? (
            <Link
              href={buildHref(base, { page: result.page + 1 })}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function DonorRowTable({ donor }: { donor: AdminDonorSummary }) {
  return (
    <tr className="border-t border-stone-200 hover:bg-stone-50/60 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/admin/donors/${donor.id}`}
          className="text-ink font-medium hover:text-tangerine-deeper transition-colors"
        >
          {donor.display_name}
        </Link>
        <div className="text-[12px] text-ink-soft mt-0.5 truncate max-w-[280px]">
          {donor.email}
        </div>
      </td>
      <td className="px-4 py-3 text-ink-soft">
        {donor.country_name ?? donor.country_code ?? "—"}
      </td>
      <td className="px-4 py-3">
        <ApprovalPill status={donor.approval_status} />
        {donor.account_status === "suspended" ? (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FCE9E9] text-[#A02020]">
            {donor.deactivated_at ? "Deactivated" : "Suspended"}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-ink-soft">
        {formatRelative(donor.date_created)}
      </td>
      <td className="px-4 py-3 text-ink-soft">
        {formatRelative(donor.last_access)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">
        {donor.active_sponsorship_count ?? "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">
        {formatMoneyUsd(donor.lifetime_giving_usd)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/donors/${donor.id}`}
          className="inline-flex items-center text-ink-soft hover:text-tangerine-deeper transition-colors"
          aria-label="Open donor detail"
        >
          <ChevronRight className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function DonorRowCard({ donor }: { donor: AdminDonorSummary }) {
  return (
    <li>
      <Link
        href={`/admin/donors/${donor.id}`}
        className="group block rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 transition-colors hover:border-tangerine-soft"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-[17px] text-ink leading-snug truncate">
                {donor.display_name}
              </p>
              <ApprovalPill status={donor.approval_status} />
              {donor.account_status === "suspended" ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FCE9E9] text-[#A02020]">
                  {donor.deactivated_at ? "Deactivated" : "Suspended"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed truncate">
              {donor.email}
            </p>
            <p className="mt-1 text-[12px] text-ink-soft leading-relaxed">
              {donor.country_name ?? donor.country_code ?? "Unknown country"} ·{" "}
              {donor.active_sponsorship_count ?? "—"} active ·{" "}
              {formatMoneyUsd(donor.lifetime_giving_usd)} lifetime
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}

function ApprovalPill({ status }: { status: DonorApprovalStatus }) {
  const styles: Record<
    DonorApprovalStatus,
    { bg: string; text: string; label: string }
  > = {
    // Approval gate removed — 'pending' / 'not_started' donors can already
    // sponsor once OTP-verified, so a neutral "Not required" (not amber
    // "Pending") avoids reading as "awaiting your review".
    pending: { bg: "bg-stone-100", text: "text-stone-700", label: "Not required" },
    approved: {
      bg: "bg-moss-soft",
      text: "text-moss-deep",
      label: "Approved",
    },
    rejected: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Rejected",
    },
    not_started: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Not required",
    },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
      <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
        No donors match.
      </p>
      <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
        Try widening the filters, or clear the search box to see the full list.
      </p>
    </div>
  );
}
