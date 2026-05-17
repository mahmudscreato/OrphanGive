// Session 52b — Generic admin review action bar.
//
// Used by the three review queues (documents, intake photos,
// moments) and any future ones. Same UX shape as Session 51's
// ProposalActionBar (which it derives from): Approve primary
// tangerine, Reject opens a modal requiring a reason. The shared
// component reduces parallel maintenance — when the modal copy
// shifts or the race-condition handling tightens, one change.
//
// Differences from ProposalActionBar:
//   - approve and reject endpoints are passed in (not hardcoded
//     to /api/admin/proposals/[id])
//   - redirectTo defaults to the queue index but the caller can
//     override (e.g., intake-photo batch routes back to the
//     per-child detail)
//   - copy is parameterized (entityNoun = "document" | "intake
//     photo" | "moment" | etc.) so toast text reads naturally
//
// Race-condition handling: existing endpoints return 400 with
// `error: "invalid_status"` when the row has been reviewed by
// another admin. We surface the same friendly "refresh" copy.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

interface ApiError {
  error?: string;
  message?: string;
}

export interface ReviewActionBarProps {
  approveUrl: string;
  rejectUrl: string;
  redirectTo: string;
  // What the entity is in copy — "document", "intake photo",
  // "moment", "proposal". Used in toast strings + the modal.
  entityNoun: string;
  // Renders the action bar in a disabled "this has been reviewed
  // already" state when the row's current status isn't pending.
  disabled?: boolean;
  disabledStatusLabel?: string;
}

export function ReviewActionBar({
  approveUrl,
  rejectUrl,
  redirectTo,
  entityNoun,
  disabled = false,
  disabledStatusLabel,
}: ReviewActionBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  function handleApiError(err: ApiError, defaultMsg: string): string {
    if (err.error === "invalid_status") {
      return `This ${entityNoun} was already reviewed by another admin. Refresh to see the current state.`;
    }
    if (err.error === "unauthorized") {
      return "Your admin session expired. Sign in again.";
    }
    if (err.error === "not_found") {
      return `This ${entityNoun} no longer exists. Refresh the queue.`;
    }
    return err.message ?? defaultMsg;
  }

  function onApprove() {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(approveUrl, { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(body, "Couldn't approve. Try again."));
          return;
        }
        setSuccessToast("Approved. Redirecting…");
        window.setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onRejectSubmit(reason: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(rejectUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(body, "Couldn't reject. Try again."));
          return;
        }
        setShowRejectModal(false);
        setSuccessToast("Rejected. The DI was notified.");
        window.setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-[13.5px] text-ink-soft">
        This {entityNoun} is{" "}
        <span className="font-medium text-ink">
          {disabledStatusLabel ?? "already reviewed"}
        </span>
        . No further action available.
      </div>
    );
  }

  return (
    <>
      {serverError ? (
        <div
          className="mb-4 rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}

      {successToast ? (
        <div
          className="mb-4 rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[14.5px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <XCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Reject
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {pending ? "Working…" : "Approve"}
        </button>
      </div>

      {showRejectModal ? (
        <RejectModal
          onCancel={() => setShowRejectModal(false)}
          onSubmit={onRejectSubmit}
          pending={pending}
          entityNoun={entityNoun}
        />
      ) : null}
    </>
  );
}

function RejectModal({
  onCancel,
  onSubmit,
  pending,
  entityNoun,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
  entityNoun: string;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 10;
  const tooLong = trimmed.length > 1000;

  function submit() {
    if (tooShort) {
      setLocalError("Please give the DI at least 10 characters of context.");
      return;
    }
    if (tooLong) {
      setLocalError("Max 1000 characters.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reject this ${entityNoun}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Reject this {entityNoun}
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            The DI sees your reason in their notification. Be specific —
            it&apos;s how they know what to fix.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor="reject-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (min 10 characters)
          </label>
          <textarea
            id="reject-reason"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. The scan is too blurry to read line 3."
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          />
          <div className="flex items-center justify-between text-[12px] text-ink-soft">
            <span>{trimmed.length}/1000</span>
            {tooShort && trimmed.length > 0 ? (
              <span className="text-amber-700">{10 - trimmed.length} more</span>
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] text-white font-medium text-[14px] hover:bg-[#8A2424] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
