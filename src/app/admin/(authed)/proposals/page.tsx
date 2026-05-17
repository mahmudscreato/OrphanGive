// Session 51 — Admin proposals queue.
//
// Server component. Filter tabs: All / Pending / Approved / Rejected.
// Default = Pending. Pending sort is FIFO (oldest first); other tabs
// sort newest-first.
//
// Each row shows enough context for triage: child name, proposal
// type pill, submitter name, time-since-submitted, and the count of
// changed fields. Rows route to /admin/proposals/[id] for the diff
// + actions view.

import Link from "next/link";
import { ChevronRight, Clock, FileEdit, Plus } from "lucide-react";
import {
  listAdminProposals,
  type AdminProposalSummary,
  type ProposalStatus,
} from "@/lib/admin-proposals-list";

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

function parseFilter(s: string | undefined): ProposalStatus | "all" {
  if (s === "all" || s === "pending" || s === "approved" || s === "rejected")
    return s;
  return "pending";
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

export default async function AdminProposalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);
  const proposals = await listAdminProposals({ status: activeFilter });

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

      {/* Filter tabs */}
      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Proposal status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/proposals?filter=${tab.value}`}
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

      {proposals.length === 0 ? (
        <EmptyState filter={activeFilter} />
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: AdminProposalSummary }) {
  const TypeIcon = proposal.proposal_type === "create" ? Plus : FileEdit;
  const typeLabel = proposal.proposal_type === "create" ? "Create" : "Update";
  return (
    <li>
      <Link
        href={`/admin/proposals/${proposal.id}`}
        className="group block rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-tangerine-mist text-tangerine-deeper">
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

function EmptyState({ filter }: { filter: ProposalStatus | "all" }) {
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
  const c = copy[filter === "draft" ? "all" : filter];
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
      <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
        {c.title}
      </p>
      <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
        {c.body}
      </p>
    </div>
  );
}
