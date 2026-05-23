// Session 61 — Admin sponsorships queue.
//
// Server component. Filter tabs: All / Active / Paused / Cancelled /
// Ended (= completed). Default = Active. Sort is newest-first via
// started_at desc.
//
// Composable filters (URL-encoded so admin can bookmark a view):
//   ?filter=active|paused|cancelled|completed|all
//   ?q=<text>      — substring match against id, donor email/name,
//                    child name (in-memory; runs after donor lookup)
//   ?page=N        — 1-indexed pagination, 50 per page
//
// Donor + child autocomplete pickers from the brief are deferred —
// the free-text search covers both name and email, and we can layer
// proper combobox UIs in a follow-up session if it's not enough.
// Documented as "search by anything" in the placeholder copy.

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  HeartHandshake,
  Search,
} from "lucide-react";
import {
  listAdminSponsorships,
  type AdminSponsorshipSummary,
  type SponsorshipListTypeFilter,
} from "@/lib/admin-sponsorships";
import type { SponsorshipStatus } from "@/lib/sponsorship-data";
import {
  formatDonorAmount,
  formatUsdEquivalent,
  shouldShowUsdEquivalent,
} from "@/lib/donor-currency-format";

export const dynamic = "force-dynamic";

const TABS: ReadonlyArray<{
  value: SponsorshipStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Ended" },
];

// Session 61.5 hotfix — type filter chips parallel to the status
// row. Distinct dimension (payment_mode vs status), so kept as a
// second row of chips rather than collapsing into the existing
// status set.
const TYPE_TABS: ReadonlyArray<{
  value: SponsorshipListTypeFilter;
  label: string;
}> = [
  { value: "all", label: "All types" },
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "prepaid", label: "Prepaid" },
];

function parseStatus(s: string | undefined): SponsorshipStatus | "all" {
  if (
    s === "all" ||
    s === "active" ||
    s === "paused" ||
    s === "cancelled" ||
    s === "completed" ||
    s === "pending_payment" ||
    s === "failed"
  ) {
    return s;
  }
  return "active";
}

function parseType(s: string | undefined): SponsorshipListTypeFilter {
  if (s === "one_time" || s === "monthly" || s === "prepaid" || s === "all") {
    return s;
  }
  return "all";
}

function parsePage(s: string | undefined): number {
  const n = Number.parseInt(s ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}

// Session 61.1 hotfix — accept string|null|undefined alongside number
// as defence in depth. The proper fix coerces at the boundary in
// admin-sponsorships.ts (Postgres numeric(10,2) returns as string
// over Directus REST), but this guard means a future caller passing
// a raw Directus value can't blow this up again.
function formatMoney(
  amount: number | string | null | undefined,
  currency: string,
): string {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency || "USD"}`;
}

function buildHref(opts: {
  status: SponsorshipStatus | "all";
  type: SponsorshipListTypeFilter;
  q: string | null;
  page: number;
}): string {
  const params = new URLSearchParams();
  params.set("filter", opts.status);
  // Session 61.5 hotfix — type filter param. Omitted when "all" so
  // the bare URL stays clean for the default view.
  if (opts.type !== "all") params.set("type", opts.type);
  if (opts.q) params.set("q", opts.q);
  if (opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return `/admin/sponsorships${qs ? `?${qs}` : ""}`;
}

export default async function AdminSponsorshipsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    type?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeStatus = parseStatus(sp.filter);
  const activeType = parseType(sp.type);
  const activeQuery = sp.q?.trim() || null;
  const activePage = parsePage(sp.page);

  const { rows, total, page, pageSize, totalPages } =
    await listAdminSponsorships({
      status: activeStatus,
      type: activeType,
      search: activeQuery,
      page: activePage,
      pageSize: 50,
    });

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Sponsorships
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Manage live commitments — pause, resume, cancel, or refund.
          Use the search to find by sponsorship ID, donor name/email, or
          child name.
        </p>
      </header>

      {/* Status tabs */}
      <nav
        className="mb-3 flex flex-wrap gap-2"
        aria-label="Sponsorship status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeStatus === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref({
                status: tab.value,
                type: activeType,
                q: activeQuery,
                page: 1,
              })}
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

      {/* Session 61.5 hotfix — type filter row. Distinct dimension
          from status (payment_mode vs lifecycle state), so kept as
          a second row. Slightly softer styling (mist bg vs solid
          tangerine when active) so the eye reads status as the
          primary filter. */}
      <nav
        className="mb-3 flex flex-wrap gap-2"
        aria-label="Sponsorship type filter"
      >
        {TYPE_TABS.map((tab) => {
          const isActive = activeType === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref({
                status: activeStatus,
                type: tab.value,
                q: activeQuery,
                page: 1,
              })}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                isActive
                  ? "bg-tangerine-mist text-tangerine-deeper border border-tangerine-soft"
                  : "bg-white border border-stone-200 text-ink-soft hover:border-tangerine-soft hover:text-tangerine-deeper"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Search form */}
      <form
        method="get"
        className="mb-5 flex items-center gap-2 text-[13px]"
      >
        <input type="hidden" name="filter" value={activeStatus} />
        {/* Session 61.5 hotfix — preserve the active type filter
            across search submits. Omitted from the form when "all"
            so the URL stays clean for the default view. */}
        {activeType !== "all" ? (
          <input type="hidden" name="type" value={activeType} />
        ) : null}
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={activeQuery ?? ""}
            placeholder="Search id, donor name/email, or child name…"
            className="w-full pl-9 pr-3 py-2 rounded-full border border-stone-300 bg-white text-[13px] text-ink placeholder:text-ink-soft hover:border-tangerine-soft focus:outline-none focus:border-tangerine focus:ring-1 focus:ring-tangerine-soft transition-colors"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center px-3 py-1.5 rounded-full bg-stone-800 text-white text-[12px] font-medium hover:bg-stone-700 transition-colors"
        >
          Apply
        </button>
        {activeQuery ? (
          <Link
            href={buildHref({
              status: activeStatus,
              type: activeType,
              q: null,
              page: 1,
            })}
            className="text-[12px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          filter={activeStatus}
          hasQuery={!!activeQuery}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((s) => (
              <SponsorshipRow key={s.id} s={s} />
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap text-[12.5px] text-ink-soft">
            <span>
              Showing {showingFrom}–{showingTo} of {total}
            </span>
            {totalPages > 1 ? (
              <div className="inline-flex items-center gap-2">
                <Link
                  href={buildHref({
                    status: activeStatus,
                    type: activeType,
                    q: activeQuery,
                    page: Math.max(1, page - 1),
                  })}
                  aria-disabled={page <= 1}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] ${
                    page <= 1
                      ? "pointer-events-none opacity-40 border-stone-200"
                      : "border-stone-300 hover:border-tangerine-soft hover:text-tangerine-deeper"
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  Prev
                </Link>
                <span className="font-mono text-[11.5px]">
                  Page {page} / {totalPages}
                </span>
                <Link
                  href={buildHref({
                    status: activeStatus,
                    type: activeType,
                    q: activeQuery,
                    page: Math.min(totalPages, page + 1),
                  })}
                  aria-disabled={page >= totalPages}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] ${
                    page >= totalPages
                      ? "pointer-events-none opacity-40 border-stone-200"
                      : "border-stone-300 hover:border-tangerine-soft hover:text-tangerine-deeper"
                  }`}
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // Inline sub-components (kept in-file because they're not reused
  // anywhere else and the page is the canonical caller).
}

function SponsorshipRow({ s }: { s: AdminSponsorshipSummary }) {
  const isQueued = (s.queue_position ?? 0) > 0;
  return (
    <li>
      <Link
        href={`/admin/sponsorships/${s.id}`}
        className="group block rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="flex items-start gap-3">
          <ChildThumb photoUuid={s.child_photo_uuid} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-[16px] text-ink leading-snug truncate">
                {s.child_label}
              </p>
              <StatusPill status={s.status} />
              {/* Session 61.5 hotfix — type pill alongside status so
                  admin can see at a glance whether this row is
                  one-time / monthly / prepaid without parsing the
                  meta line below. Uses payment_label which already
                  encodes the "Prepaid (N mo left)" detail. */}
              <TypePill label={s.payment_label} />
              {isQueued ? (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-sky/30 text-sky-deep"
                  title={`Queue position ${s.queue_position}`}
                >
                  Queue #{s.queue_position}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
              <HeartHandshake
                className="inline w-3 h-3 mr-1 stroke-[1.75]"
                aria-hidden="true"
              />
              {s.donor_label}
              {s.donor_email ? (
                <span className="text-slate-soft"> · {s.donor_email}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-soft inline-flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <CreditCard
                  className="w-3 h-3 stroke-[1.75]"
                  aria-hidden="true"
                />
                {/* Session 58.7 → 58.8.1 — render the donor's actual
                    currency with the proper symbol (৳, $, £, …) +
                    locale-aware thousands separators. USD-equivalent
                    suffix is suppressed when the donor's currency IS
                    USD (avoids the redundant "$18 (≈ $18 USD)"). */}
                {s.donor_currency_code &&
                s.donor_currency_amount != null ? (
                  <>
                    {formatDonorAmount(
                      s.donor_currency_amount,
                      s.donor_currency_code,
                    )}
                    {shouldShowUsdEquivalent(s.donor_currency_code) ? (
                      <span className="text-stone-400">
                        {" "}(≈ {formatUsdEquivalent(s.amount_usd)})
                      </span>
                    ) : null}
                  </>
                ) : (
                  formatMoney(s.amount_usd, s.currency)
                )}{" "}
                · {s.payment_label}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock
                  className="w-3 h-3 stroke-[1.75]"
                  aria-hidden="true"
                />
                started {formatRelative(s.started_at)}
              </span>
              <span>
                {s.payment_count} payment{s.payment_count === 1 ? "" : "s"} ·
                total {formatMoney(s.total_paid_usd, s.currency)}
              </span>
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

function ChildThumb({ photoUuid }: { photoUuid: string | null }) {
  if (!photoUuid) {
    return (
      <div
        className="shrink-0 w-11 h-11 rounded-xl bg-tangerine-mist text-tangerine-deeper inline-flex items-center justify-center font-display text-[13px]"
        aria-hidden="true"
      >
        ?
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/api/assets/${photoUuid}?width=80&height=80&fit=cover&quality=70`}
      alt=""
      width={44}
      height={44}
      className="shrink-0 w-11 h-11 rounded-xl object-cover bg-stone-100"
    />
  );
}

// Session 61.5 hotfix — small neutral pill for payment type. Uses
// the resolved `payment_label` from admin-sponsorships (already
// encodes the "Prepaid (N mo left)" + "Monthly" + "One-time"
// vocabulary) so the row's existing label string drives it. Soft
// styling so it reads as secondary to StatusPill.
function TypePill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-700"
      title={`Payment type: ${label}`}
    >
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: SponsorshipStatus }) {
  const styles: Record<
    SponsorshipStatus,
    { bg: string; text: string; label: string }
  > = {
    pending_payment: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Pending",
    },
    active: {
      bg: "bg-moss-soft",
      text: "text-moss-deep",
      label: "Active",
    },
    paused: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Paused",
    },
    cancelled: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Cancelled",
    },
    completed: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Ended",
    },
    failed: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Failed",
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

function EmptyState({
  filter,
  hasQuery,
}: {
  filter: SponsorshipStatus | "all";
  hasQuery: boolean;
}) {
  const copyBase: Record<string, { title: string; body: string }> = {
    all: {
      title: "No sponsorships yet.",
      body: "Once donors begin sponsoring children, they'll appear here.",
    },
    active: {
      title: "No active sponsorships.",
      body: "When sponsorships activate, they'll show up here.",
    },
    paused: {
      title: "No paused sponsorships.",
      body: "Sponsorships you pause (or donors self-pause) will appear here.",
    },
    cancelled: {
      title: "No cancelled sponsorships.",
      body: "Cancellations land here so you can audit them later.",
    },
    completed: {
      title: "No ended sponsorships.",
      body: "Fixed-term sponsorships that ran their course appear here.",
    },
  };
  const base = copyBase[filter] ?? copyBase.all!;
  const body = hasQuery
    ? `${base.body} (Try clearing your search to widen the view.)`
    : base.body;
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
      <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
        {base.title}
      </p>
      <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
        {body}
      </p>
    </div>
  );
}
