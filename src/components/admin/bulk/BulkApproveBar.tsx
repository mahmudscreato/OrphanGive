// feat/admin-bulk-approve — the shared bulk action bar.
//
// Renders above a review queue when it has approvable (pending) items.
// Shows: a select-all checkbox, "Approve selected (K)", "Approve all (N)",
// a running/progress state, and the result tally ("6 approved · 2 failed").
//
// Presentational only — it calls back to the owning list, which owns the
// key→endpoints mapping + the confirmation step. Keeps this component
// identical across every queue.

"use client";

import { CheckCircle2, Loader2, X } from "lucide-react";
import type { BulkApproveResult } from "./useBulkApprove";

export function BulkApproveBar({
  approvableCount,
  selectedCount,
  allSelected,
  onToggleAll,
  onApproveSelected,
  onApproveAll,
  running,
  progress,
  result,
  onDismissResult,
}: {
  /** How many rows in the queue can be bulk-approved (pending/approvable). */
  approvableCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onApproveSelected: () => void;
  onApproveAll: () => void;
  running: boolean;
  progress: { done: number; total: number } | null;
  result: BulkApproveResult | null;
  onDismissResult: () => void;
}) {
  if (approvableCount === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-stone-200 bg-white shadow-sm px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            disabled={running}
            className="w-4 h-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft"
            aria-label="Select all approvable items"
          />
          {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
        </label>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onApproveSelected}
            disabled={running || selectedCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-moss text-white text-[13px] font-medium hover:bg-moss-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            )}
            Approve selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
          <button
            type="button"
            onClick={onApproveAll}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-moss/40 text-moss-deep bg-white text-[13px] font-medium hover:bg-moss-soft/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Approve all ({approvableCount})
          </button>
        </div>
      </div>

      {progress ? (
        <p className="mt-2 text-[12.5px] text-ink-soft" role="status">
          Approving {progress.done} of {progress.total}…
        </p>
      ) : null}

      {result && !running ? (
        <div
          className={`mt-2 flex items-center gap-2 text-[12.5px] ${
            result.failed > 0 ? "text-amber-800" : "text-moss-deep"
          }`}
          role="status"
        >
          <span>
            {result.ok} approved
            {result.failed > 0 ? ` · ${result.failed} failed` : ""}
            {result.failed > 0
              ? " — failed items stay in the queue; try them again or one by one."
              : "."}
          </span>
          <button
            type="button"
            onClick={onDismissResult}
            className="ml-1 text-stone-400 hover:text-ink-soft"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default BulkApproveBar;
