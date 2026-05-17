// Session 44 — Card for a single proposal in the My Submissions list.
//
// Server component (with embedded WithdrawButton client island when
// the proposal is pending).

import { CheckCircle2, FileEdit, FilePlus, XCircle, Clock } from "lucide-react";
import type { ProposalSummary } from "@/lib/di-proposals";
import { WithdrawButton } from "./WithdrawButton";

const STATUS_PILL: Record<
  ProposalSummary["status"],
  { bg: string; text: string; label: string; Icon: typeof Clock }
> = {
  draft: {
    bg: "bg-stone-200",
    text: "text-stone-700",
    label: "Draft",
    Icon: Clock,
  },
  pending: {
    bg: "bg-tangerine",
    text: "text-white",
    label: "Pending review",
    Icon: Clock,
  },
  approved: {
    bg: "bg-moss",
    text: "text-white",
    label: "Approved",
    Icon: CheckCircle2,
  },
  rejected: {
    bg: "bg-slate",
    text: "text-white",
    label: "Rejected",
    Icon: XCircle,
  },
};

const OPERATION_PILL: Record<
  ProposalSummary["proposal_type"],
  { bg: string; text: string; label: string; Icon: typeof FilePlus }
> = {
  create: {
    bg: "bg-tangerine-mist",
    text: "text-tangerine-deeper",
    label: "New child",
    Icon: FilePlus,
  },
  update: {
    bg: "bg-stone-100",
    text: "text-ink-soft",
    label: "Edit profile",
    Icon: FileEdit,
  },
};

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
  // Fall back to absolute date for older.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function describe(p: ProposalSummary): string {
  if (p.proposal_type === "create") {
    return p.proposed_display_name
      ? `New child: ${p.proposed_display_name}`
      : "New child (name pending)";
  }
  return p.child_display_name
    ? `Edit profile: ${p.child_display_name}`
    : "Edit profile";
}

export function SubmissionCard({ proposal }: { proposal: ProposalSummary }) {
  const statusPill = STATUS_PILL[proposal.status] ?? STATUS_PILL.pending!;
  const opPill = OPERATION_PILL[proposal.proposal_type];
  const StatusIcon = statusPill.Icon;
  const OpIcon = opPill.Icon;

  const reviewedAt = formatLongDate(proposal.published_at);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5">
      {/* Top row: operation + status pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${opPill.bg} ${opPill.text}`}
        >
          <OpIcon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
          {opPill.label}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${statusPill.bg} ${statusPill.text}`}
        >
          <StatusIcon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
          {statusPill.label}
        </span>
        <span className="ml-auto text-[12px] text-ink-soft">
          {formatRelative(proposal.date_created)}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-display text-[18px] text-ink leading-snug mt-3">
        {describe(proposal)}
      </h3>

      {/* Reviewer info / rejection reason */}
      {proposal.status === "approved" && reviewedAt ? (
        <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
          Reviewed by admin on {reviewedAt}.
        </p>
      ) : null}
      {proposal.status === "rejected" ? (
        <div className="mt-2 text-[13px] text-ink-soft leading-relaxed">
          {reviewedAt ? <>Reviewed on {reviewedAt}. </> : null}
          {proposal.rejection_reason ? (
            <span>
              <span className="text-ink font-medium">Reason:</span>{" "}
              {proposal.rejection_reason}
            </span>
          ) : (
            <span className="italic">No reason given.</span>
          )}
        </div>
      ) : null}

      {/* Withdraw — pending only */}
      {proposal.status === "pending" ? (
        <div className="mt-4 pt-3 border-t border-stone-200">
          <WithdrawButton proposalId={proposal.id} />
        </div>
      ) : null}
    </div>
  );
}
