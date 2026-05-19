// Session 51 — Admin proposals queue.
// Session 60 — extended with division + proposal-type filters,
// urgency-first sort + pill, pagination (20 per page), and
// urgent-row visual treatment.
//
// Server component. Filter tabs: All / Pending / Approved / Rejected.
// Default = Pending. Pending sort is "urgency-first, then FIFO";
// other tabs sort newest-first.
//
// Filters that compose with the status tab (read from searchParams):
//   ?filter=pending|approved|rejected|all     status (existing)
//   ?type=create|update|all                   proposal_type (new)
//   ?division=<bd_division.code>              division (new)
//   ?page=N                                   pagination (new, 1-indexed)
//
// Each row shows enough context for triage: child name, proposal
// type pill, submitter name, time-since-submitted, the count of
// changed fields, and (when urgent) a red 'Urgent' pill. Rows
// route to /admin/proposals/[id] for the diff + actions view.

import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Clock, FileEdit, Plus } from "lucide-react";
import {
  listAdminProposalsPage,
  listProposalDivisions,
  type AdminProposalSummary,
  type ProposalStatus,
  type ProposalType,
} from "@/lib/admin-proposals-list";
import { getBdDivisions } from "@/lib/di-children";

export const dynamic = "force-dynamic";

const TABS: ReadonlyArray<{
  value: ProposalStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TYPE_OPTIONS: ReadonlyArray<{
  value: ProposalType | "all";
  label: string;
}> = [
  { value: "all", label: "All types" },
  { value: "create", label: "New child" },
  { value: "update", label: "Edit" },
];

function parseStatus(s: string | undefined): ProposalStatus | "all" {
  if (s === "all" || s === "pending" || s === "approved" || s === "rejected")
    return s;
  return "pending";
}

function parseType(s: string | undefined): ProposalType | "all" {
  if (s === "create" || s === "update" || s === "all") return s;
  return "all";
}

function parsePage(s: string | undefined): number {
  const n = Number.parseInt(s ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
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

// Build a `?…` href that preserves all the active filters except the
// one being changed. Keeps users from losing context as they toggle
// between Pending / Approved / type / division / page.
function buildHref(opts: {
  status: ProposalStatus | "all";
  type: ProposalType | "all";
  division: string | null;
  page: number;
}): string {
  const params = new URLSearchParams();
  params.set("filter", opts.status);
  if (opts.type !== "all") params.set("type", opts.type);
  if (opts.division) params.set("division", opts.division);
  if (opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return `/admin/proposals${qs ? `?${qs}` : ""}`;
}

export default async function AdminProposalsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    type?: string;
    division?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeStatus = parseStatus(sp.filter);
  const activeType = parseType(sp.type);
  const activeDivision = sp.division?.trim() || null;
  const activePage = parsePage(sp.page);

  // Three parallel reads: paginated rows, division codes that have
  // any proposal at all (to populate the dropdown), and the
  // human-friendly division names from bd_division.
  const [pageResult, presentDivisions, allDivisions] = await Promise.all([
    listAdminProposalsPage({
      status: activeStatus,
      proposalType: activeType,
      bdDivision: activeDivision,
      page: activePage,
      pageSize: 20,
    }),
    listProposalDivisions(),
    getBdDivisions(),
  ]);

  // Intersect: only show filter dropdown options for divisions where
  // proposals actually exist. Lookup name from bd_division — falls
  // back to the code if name is missing.
  const divisionOptions = presentDivisions.map((code) => {
    const match = allDivisions.find((d) => d.code === code);
    return { code, label: match?.name ?? code };
  });

  const { rows: proposals, total, page, pageSize, totalPages } = pageResult;
  const hasActiveFilter = activeType !== "all" || !!activeDivision;
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Proposals
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Profile changes from the DI team waiting on your approval.
        </p>
      </header>

      {/* Status tabs */}
      <nav
        className="mb-3 flex flex-wrap gap-2"
        aria-label="Proposal status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeStatus === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref({
                status: tab.value,
                type: activeType,
                division: activeDivision,
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

      {/* Secondary filters: proposal_type + division.
          Native <form> with GET so the URL fully encodes the
          filter state — admin can bookmark "Pending Dhaka edits". */}
      <form
        method="get"
        className="mb-5 flex flex-wrap items-center gap-2 text-[13px]"
      >
        <input type="hidden" name="filter" value={activeStatus} />
        <label className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft">
            Type
          </span>
          <select
            name="type"
            defaultValue={activeType}
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-[12.5px] text-ink hover:border-tangerine-soft focus:outline-none focus:border-tangerine"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft">
            Division
          </span>
          <select
            name="division"
            defaultValue={activeDivision ?? ""}
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-[12.5px] text-ink hover:border-tangerine-soft focus:outline-none focus:border-tangerine"
          >
            <option value="">All divisions</option>
            {divisionOptions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center px-3 py-1 rounded-full bg-stone-800 text-white text-[12px] font-medium hover:bg-stone-700 transition-colors"
        >
          Apply
        </button>
        {hasActiveFilter ? (
          <Link
            href={buildHref({
              status: activeStatus,
              type: "all",
              division: null,
              page: 1,
            })}
            className="text-[12px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      {proposals.length === 0 ? (
        <EmptyState filter={activeStatus} hasActiveFilter={hasActiveFilter} />
      ) : (
        <>
          <ul className="space-y-2">
            {proposals.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </ul>

          {/* Pagination + count. Hide pager when single page; still
              show the count for context. */}
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
                    division: activeDivision,
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
                    division: activeDivision,
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
}

function ProposalRow({ proposal }: { proposal: AdminProposalSummary }) {
  const TypeIcon = proposal.proposal_type === "create" ? Plus : FileEdit;
  const typeLabel = proposal.proposal_type === "create" ? "Create" : "Update";
  const isUrgent =
    (proposal.priority_support || "").toLowerCase() === "urgent";
  return (
    <li>
      <Link
        href={`/admin/proposals/${proposal.id}`}
        className={`group block rounded-2xl shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors ${
          isUrgent
            ? "bg-white border-l-4 border-[#A02B2B] border border-[#A02B2B]/30 hover:border-[#A02B2B]/60"
            : "bg-white border border-stone-200 hover:border-tangerine-soft"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl ${
              isUrgent
                ? "bg-[#FCE9E9] text-[#A02020]"
                : "bg-tangerine-mist text-tangerine-deeper"
            }`}
          >
            <TypeIcon className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-[17px] text-ink leading-snug truncate">
                {proposal.child_label}
              </p>
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
                {typeLabel}
              </span>
              <StatusPill status={proposal.status} />
              {isUrgent ? <UrgentPill /> : null}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
              {proposal.submitted_by_name} ·{" "}
              <span className="inline-flex items-center gap-1">
                <Clock
                  className="w-3 h-3 stroke-[1.75]"
                  aria-hidden="true"
                />
                {formatRelative(proposal.date_created)}
              </span>{" "}
              · {proposal.change_count} change
              {proposal.change_count === 1 ? "" : "s"}
              {proposal.bd_division ? (
                <>
                  {" "}· <span className="capitalize">{proposal.bd_division}</span>
                </>
              ) : null}
            </p>
            {proposal.status === "rejected" && proposal.rejection_reason ? (
              <p className="mt-1 text-[12px] text-[#9A2424] italic line-clamp-2">
                {proposal.rejection_reason}
              </p>
            ) : null}
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

function StatusPill({ status }: { status: ProposalStatus }) {
  const styles: Record<
    ProposalStatus,
    { bg: string; text: string; label: string }
  > = {
    draft: { bg: "bg-stone-100", text: "text-stone-700", label: "Draft" },
    pending: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Pending",
    },
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

function UrgentPill() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FCE9E9] text-[#A02020]"
      title="priority_support=urgent — review first"
    >
      <AlertCircle
        className="w-3 h-3 stroke-[2.25]"
        aria-hidden="true"
      />
      Urgent
    </span>
  );
}

function EmptyState({
  filter,
  hasActiveFilter,
}: {
  filter: ProposalStatus | "all";
  hasActiveFilter: boolean;
}) {
  // The 'draft' bucket isn't surfaced in the UI tabs (drafts belong
  // to the DI surface, not admin's queue) so we narrow the type to
  // just the four tab values here.
  type EmptyStateFilter = "all" | "pending" | "approved" | "rejected";
  const copy: Record<EmptyStateFilter, { title: string; body: string }> = {
    all: {
      title: "No proposals yet.",
      body: "Once the DI team submits profile changes, they'll show up here.",
    },
    pending: {
      title: "Inbox zero.",
      body: "Nothing waiting on you. Check back soon.",
    },
    approved: {
      title: "No approved proposals yet.",
      body: "Once you approve some, they'll appear here for reference.",
    },
    rejected: {
      title: "No rejected proposals.",
      body: "When you reject something, it lands here so you can revisit your reasoning.",
    },
  };
  const base = copy[filter === "draft" ? "all" : filter];
  // When user has narrowed by type/division and the bucket is empty,
  // give them a hint that filters might be the reason, not absence.
  const body = hasActiveFilter
    ? `${base.body} (Try clearing the type / division filter to widen the view.)`
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
