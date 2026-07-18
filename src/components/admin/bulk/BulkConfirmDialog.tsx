// feat/admin-bulk-approve — confirmation dialog for a bulk approve.
//
// Two intensities:
//   - normal    (documents / reports / moments): a plain "approve N?" step.
//   - sensitive (intake-photos / reveal-requests): an EXTRA, explicit
//     warning that states the action + count and that each item is NOT
//     being reviewed individually. Non-negotiable for the child-safety
//     queues.
//
// `needsReason` (reveal) adds a REQUIRED shared reason (>= 3 chars) applied
// to every item in the batch — mirrors the single-approve reason contract.

"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export function BulkConfirmDialog({
  open,
  sensitive,
  title,
  message,
  confirmLabel,
  needsReason = false,
  reasonPlaceholder,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  sensitive: boolean;
  title: string;
  /** States exactly what's about to happen + the count. */
  message: string;
  confirmLabel: string;
  needsReason?: boolean;
  reasonPlaceholder?: string;
  pending: boolean;
  /** For reveal, `reason` carries the shared batch reason. */
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  if (!open) return null;

  const trimmed = reason.trim();

  function confirm() {
    if (needsReason) {
      if (trimmed.length < 3) {
        setLocalError("Please give a brief reason (at least 3 characters).");
        return;
      }
      if (trimmed.length > 1000) {
        setLocalError("Max 1000 characters.");
        return;
      }
    }
    setLocalError(null);
    onConfirm(needsReason ? trimmed : undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink inline-flex items-center gap-2">
            {sensitive ? (
              <AlertTriangle
                className="w-4.5 h-4.5 text-[#A02B2B] stroke-[1.75]"
                aria-hidden="true"
              />
            ) : null}
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-stone-100 disabled:opacity-60"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p
            className={`text-[14px] leading-relaxed ${
              sensitive ? "text-ink" : "text-ink-soft"
            }`}
          >
            {message}
          </p>

          {needsReason ? (
            <div>
              <label
                htmlFor="bulk-reason"
                className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
              >
                Reason (applied to every request)
              </label>
              <textarea
                id="bulk-reason"
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (localError) setLocalError(null);
                }}
                disabled={pending}
                maxLength={1000}
                autoFocus
                placeholder={reasonPlaceholder}
                className="w-full rounded-lg border border-ink/[0.14] bg-white px-3 py-2 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all disabled:opacity-60"
              />
            </div>
          ) : null}

          {localError ? (
            <p className="text-[12.5px] text-[#A02B2B]" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
              sensitive ? "bg-[#A02B2B] hover:bg-[#8A2424]" : "bg-moss hover:bg-moss-deep"
            }`}
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkConfirmDialog;
