// Session 68 — Draft picker modal for the DI dashboard's
// "Resume a draft" quick action.
//
// Server fetches the 5 most recent drafts and passes them as
// `drafts`. The button is a client component that toggles modal
// visibility on click; the modal renders the same 5 rows as links
// straight to /di/children/[new|edit]?draftId=... with the right
// route based on the draft's proposal_type:
//
//   - proposal_type='create' AND target_child stub set
//       → /di/children/new?draftId=...
//       (the new-child page hydrates from the draft + stub)
//   - proposal_type='update' AND target_child set
//       → /di/children/[target_child]/edit?draftId=...
//   - anything else (defensive)
//       → /di/drafts (full list)
//
// When the DI has zero drafts the button still renders but is
// disabled with a hover hint — clicking it explains why.

"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, X, FileEdit } from "lucide-react";

export interface DraftPickerEntry {
  id: string;
  proposalType: "create" | "update";
  targetChildId: string | null;
  childDisplayName: string | null;
  proposedDisplayName: string | null;
  dateCreated: string | null;
}

export function DraftPickerModal({
  drafts,
}: {
  drafts: DraftPickerEntry[];
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = drafts.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isEmpty) setOpen(true);
        }}
        disabled={isEmpty}
        title={isEmpty ? "You don't have any drafts in progress yet." : undefined}
        className={`group flex flex-col items-start gap-3 rounded-2xl bg-white border border-ink/[0.06] p-5 min-h-[112px] transition-all duration-200 text-left ${
          isEmpty
            ? "opacity-60 cursor-not-allowed"
            : "hover:bg-tangerine-mist/40 hover:border-tangerine-soft hover:-translate-y-px"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-colors ${
            isEmpty
              ? "bg-stone-100 text-stone-400"
              : "bg-tangerine-mist text-tangerine-deeper group-hover:bg-tangerine group-hover:text-ink"
          }`}
        >
          <FileEdit className="w-5 h-5 stroke-[2]" aria-hidden="true" />
        </span>
        <span className="font-display text-[16px] text-ink leading-tight">
          Resume a draft
        </span>
        {isEmpty ? (
          <span className="text-[11.5px] text-ink-soft">
            No drafts in progress.
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-soft">
            {drafts.length === 1
              ? "1 draft in progress."
              : `${drafts.length} drafts in progress.`}
          </span>
        )}
      </button>

      {open ? (
        <PickerModal drafts={drafts} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PickerModal({
  drafts,
  onClose,
}: {
  drafts: DraftPickerEntry[];
  onClose: () => void;
}) {
  // Loading state is only used for the Cancel button visual — the
  // actual draft links navigate via the browser, no fetch here.
  const [pending] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resume a draft"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[18px] text-ink">
              Resume a draft
            </h3>
            <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
              Your {drafts.length === 1 ? "draft" : `${drafts.length} most recent drafts`} — pick one to keep editing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-ink-soft hover:text-ink transition-colors shrink-0 -mt-1 -mr-1 p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          </button>
        </div>
        <ul className="p-2 divide-y divide-stone-200">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={hrefForDraft(d)}
                onClick={onClose}
                className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-stone-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] text-ink font-medium truncate">
                    {labelForDraft(d)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-soft">
                    {d.proposalType === "create" ? "New child" : "Edit"} ·
                    {" "}
                    {formatRelative(d.dateCreated)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between">
          <Link
            href="/di/drafts"
            className="text-[13px] text-tangerine-deeper hover:underline"
            onClick={onClose}
          >
            See all drafts →
          </Link>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[13px] text-slate hover:text-tangerine-deeper transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              "Cancel"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function hrefForDraft(d: DraftPickerEntry): string {
  if (d.proposalType === "update" && d.targetChildId) {
    return `/di/children/${d.targetChildId}/edit?draftId=${d.id}`;
  }
  // CREATE drafts route to the new-child page; the page hydrates
  // from the draft (Session 52a + Session 52e). When the draft has
  // a stub target_child, the new-child page picks that up too.
  return `/di/children/new?draftId=${d.id}`;
}

function labelForDraft(d: DraftPickerEntry): string {
  // CREATE drafts may have a typed-in display_name on the proposal
  // row; UPDATE drafts inherit the live child's name. Fall through
  // to "Untitled draft" if neither is populated (a brand-new draft
  // with nothing filled in).
  return (
    d.childDisplayName?.trim() ||
    d.proposedDisplayName?.trim() ||
    "Untitled draft"
  );
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
