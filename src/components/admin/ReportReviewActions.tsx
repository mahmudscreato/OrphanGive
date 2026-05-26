// Spine 1.2 — Admin report review action bar.
//
// Different shape from ReviewActionBar (moments / documents):
// reports support claim → edit-donor-text → approve, with
// send-back-for-correction as a separate branch. Approve and send-
// back are mutually exclusive (one terminal-for-1.2, the other
// kicks back to the DI).
//
// Race-condition handling mirrors ReviewActionBar — 400
// invalid_status from another admin's parallel action → friendly
// "refresh" prompt.
//
// Privacy note on the editor: donor_text is free-form text typed
// by admin. We render a counter + warning copy ("don't paste
// Tier-3 details") next to the textarea; the structural guard is
// upstream — this page joins only Tier-1 fields, so admin has
// nothing to copy from in the surrounding UI.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Edit3,
  Loader2,
  RotateCcw,
} from "lucide-react";

interface ApiError {
  error?: string;
  message?: string;
}

export interface ReportReviewActionsProps {
  reportId: string;
  /** Current row status — drives which actions are enabled + the
   *  banner copy. */
  status: string;
  /** Current donor_text — the editor seed. */
  initialDonorText: string;
  /** DI's original narrative — shown alongside for forensic comparison
   *  (never editable from this surface). */
  diOriginal: string | null;
  /** If status === 'correction_requested', show the prior reason for
   *  context (admin can decide to approve directly if the DI resubmit
   *  fixed it). */
  priorCorrectionReason: string | null;
  /** Tier-1 child label for copy. */
  childDisplayName: string;
}

export function ReportReviewActions({
  reportId,
  status,
  initialDonorText,
  diOriginal,
  priorCorrectionReason,
  childDisplayName,
}: ReportReviewActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [donorText, setDonorText] = useState(initialDonorText);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isTerminal = status === "approved" || status === "rejected";
  const trimmed = donorText.trim();
  const tooShort = trimmed.length < 50;
  const tooLong = trimmed.length > 4000;
  const editDirty = trimmed !== initialDonorText.trim();

  function handleApiError(err: ApiError, defaultMsg: string): string {
    if (err.error === "invalid_status") {
      return `This report was just touched by another admin or the DI. Refresh to see the current state.`;
    }
    if (err.error === "unauthorized") {
      return "Your admin session expired. Sign in again.";
    }
    if (err.error === "not_found") {
      return "This report no longer exists. Refresh the queue.";
    }
    return err.message ?? defaultMsg;
  }

  async function postJson(url: string, body?: object): Promise<ApiError | null> {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as ApiError;
    if (!res.ok) return json;
    return null;
  }

  function onClaim() {
    setServerError(null);
    startTransition(async () => {
      try {
        const err = await postJson(`/api/admin/reports/${reportId}/claim`);
        if (err) {
          setServerError(handleApiError(err, "Couldn't claim. Try again."));
          return;
        }
        setSuccessToast("Claimed for review. Refreshing…");
        window.setTimeout(() => router.refresh(), 400);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onSaveDonorText() {
    setServerError(null);
    if (tooShort || tooLong) {
      setServerError(
        tooShort
          ? "Donor text must be at least 50 characters."
          : "Donor text must be at most 4000 characters.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const err = await postJson(
          `/api/admin/reports/${reportId}/edit-donor-text`,
          { donorText: trimmed },
        );
        if (err) {
          setServerError(handleApiError(err, "Couldn't save edit."));
          return;
        }
        setSuccessToast("Saved. Status unchanged — approve when ready.");
        window.setTimeout(() => router.refresh(), 400);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onApprove() {
    setServerError(null);
    startTransition(async () => {
      try {
        // If admin tweaked the donor_text but didn't save first, save
        // it before approving so the audit shows the edit + the
        // approval in order.
        if (editDirty && !tooShort && !tooLong) {
          const editErr = await postJson(
            `/api/admin/reports/${reportId}/edit-donor-text`,
            { donorText: trimmed },
          );
          if (editErr) {
            setServerError(handleApiError(editErr, "Couldn't save edit."));
            return;
          }
        }
        const err = await postJson(`/api/admin/reports/${reportId}/approve`);
        if (err) {
          setServerError(handleApiError(err, "Couldn't approve."));
          return;
        }
        setSuccessToast(
          `Approved. Ready to send to ${childDisplayName}'s sponsor(s).`,
        );
        window.setTimeout(() => {
          router.push("/admin/reviews/reports");
          router.refresh();
        }, 700);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onRequestCorrection(reason: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        const err = await postJson(
          `/api/admin/reports/${reportId}/request-correction`,
          { reason },
        );
        if (err) {
          setServerError(handleApiError(err, "Couldn't send back."));
          return;
        }
        setShowCorrectionModal(false);
        setSuccessToast("Sent back to the DI.");
        window.setTimeout(() => {
          router.push("/admin/reviews/reports");
          router.refresh();
        }, 700);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  if (isTerminal) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-[13.5px] text-ink-soft">
        This report is{" "}
        <span className="font-medium text-ink">{status}</span>. No further
        admin action available in this phase.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {serverError ? (
        <div
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}

      {successToast ? (
        <div
          className="rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      {/* CLAIM — only shown while admin hasn't taken the row yet. */}
      {status === "submitted_by_di" ||
      status === "pending" ||
      status === "correction_requested" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 md:p-5">
          <p className="text-[13.5px] text-ink-soft leading-relaxed mb-3">
            {status === "correction_requested"
              ? "DI may have resubmitted after correction. Claim to begin review."
              : "Claim this report so other admins know you're on it."}
          </p>
          <button
            type="button"
            onClick={onClaim}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep disabled:opacity-60 transition-colors"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : null}
            Claim for review
          </button>
        </div>
      ) : null}

      {/* PRIOR CORRECTION REASON — context if applicable. */}
      {priorCorrectionReason ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
          <span className="font-semibold">Last correction asked:</span>{" "}
          {priorCorrectionReason}
        </div>
      ) : null}

      {/* DI ORIGINAL — forensic record, never editable here. */}
      {diOriginal ? (
        <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-soft">
            View DI's original narrative (read-only)
          </summary>
          <p className="mt-3 text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">
            {diOriginal}
          </p>
        </details>
      ) : null}

      {/* EDIT DONOR TEXT — the inline edit surface. */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 md:p-5">
        <label
          htmlFor="donor-text"
          className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-2"
        >
          Donor-facing copy
        </label>
        <p className="text-[12.5px] text-ink-soft leading-relaxed mb-2">
          Donors will read this verbatim when 1.3 ships. Keep it warm,
          specific, and free of admin-only details (no district, no
          guardian info, no medical specifics).
        </p>
        <textarea
          id="donor-text"
          rows={10}
          value={donorText}
          onChange={(e) => setDonorText(e.target.value)}
          disabled={pending}
          className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between text-[12px] text-ink-soft">
          <span>{trimmed.length}/4000</span>
          {tooShort && trimmed.length > 0 ? (
            <span className="text-amber-700">
              {50 - trimmed.length} more for minimum
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveDonorText}
            disabled={pending || !editDirty || tooShort || tooLong}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stone-300 bg-white text-[13.5px] text-ink-soft font-medium hover:border-tangerine-soft hover:text-tangerine-deeper disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            Save edit
          </button>
          <span className="text-[12px] text-stone-400">
            Save preserves status. Use Approve to finalize.
          </span>
        </div>
      </div>

      {/* TERMINAL ACTIONS — approve vs send back. */}
      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
        <button
          type="button"
          onClick={() => setShowCorrectionModal(true)}
          disabled={pending || status === "correction_requested"}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[14.5px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          title={
            status === "correction_requested"
              ? "Already sent back. Wait for DI to resubmit."
              : undefined
          }
        >
          <RotateCcw className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Send back for correction
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={pending || tooShort || tooLong}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {pending ? "Working…" : "Approve report"}
        </button>
      </div>

      {showCorrectionModal ? (
        <CorrectionModal
          onCancel={() => setShowCorrectionModal(false)}
          onSubmit={onRequestCorrection}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function CorrectionModal({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 5;
  const tooLong = trimmed.length > 500;

  function submit() {
    if (tooShort) {
      setLocalError("At least 5 characters of context for the DI.");
      return;
    }
    if (tooLong) {
      setLocalError("Max 500 characters.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send this report back for correction"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Send back for correction
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            DI sees your reason on their submissions page. Be specific —
            it's how they know what to fix.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor="correction-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (5-500 chars)
          </label>
          <textarea
            id="correction-reason"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. The photo is too dark to use. Please re-take in daylight."
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          />
          <div className="flex items-center justify-between text-[12px] text-ink-soft">
            <span>{trimmed.length}/500</span>
            {tooShort && trimmed.length > 0 ? (
              <span className="text-amber-700">
                {5 - trimmed.length} more
              </span>
            ) : null}
          </div>
          {localError ? (
            <p className="text-[12.5px] text-[#A02B2B]">{localError}</p>
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
            onClick={submit}
            disabled={pending || tooShort || tooLong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-600 text-white font-medium text-[14px] hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Send back
          </button>
        </div>
      </div>
    </div>
  );
}
