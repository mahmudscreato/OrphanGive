// Session 48b — Draft proposal card.
//
// Server component. Renders one draft summary with a "Resume"
// button that routes to the appropriate edit form pre-filled from
// the draft (?draftId=<id>), plus an embedded DiscardDraftButton
// client island.

import Link from "next/link";
import {
  ChevronRight,
  FileEdit,
  FilePlus,
  type LucideIcon,
} from "lucide-react";
import type { DraftSummary } from "@/lib/di-proposals";
import { DiscardDraftButton } from "./DiscardDraftButton";

const OPERATION_PILL: Record<
  DraftSummary["proposal_type"],
  { bg: string; text: string; label: string; Icon: LucideIcon }
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
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function describe(d: DraftSummary): string {
  if (d.proposal_type === "create") {
    return d.proposed_display_name
      ? `New child: ${d.proposed_display_name}`
      : "New child (name not yet set)";
  }
  return d.child_display_name
    ? `Edit profile: ${d.child_display_name}`
    : "Edit profile";
}

// Resume route: edit drafts of update type re-use the existing edit
// page, pre-filled from the draft via ?draftId=. Create-type drafts
// re-use the new-child page with the same query param.
function resumeHref(d: DraftSummary): string {
  if (d.proposal_type === "update" && d.target_child) {
    return `/di/children/${d.target_child}/edit?draftId=${d.id}`;
  }
  return `/di/children/new?draftId=${d.id}`;
}

export function DraftCard({ draft }: { draft: DraftSummary }) {
  const op = OPERATION_PILL[draft.proposal_type];
  const Icon = op.Icon;

  return (
    <article className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${op.bg} ${op.text}`}
        >
          <Icon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
          {op.label}
        </span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-medium bg-amber-100 text-amber-900 border border-amber-200">
          Draft
        </span>
        <span className="ml-auto text-[12px] text-ink-soft">
          Last edited {formatRelative(draft.date_created)}
        </span>
      </div>

      <h3 className="font-display text-[18px] text-ink leading-snug mt-3">
        {describe(draft)}
      </h3>

      <div className="mt-4 pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <DiscardDraftButton draftId={draft.id} />
        <Link
          href={resumeHref(draft)}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-tangerine text-white text-[13.5px] font-medium hover:bg-tangerine-deep transition-colors"
        >
          Resume
          <ChevronRight className="w-4 h-4 stroke-[2]" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
