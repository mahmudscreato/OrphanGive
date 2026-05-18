// Session 51 — Approve / Reject action bar for the admin proposal
// detail page.
//
// Sticky-bottom action row on mobile, in-flow on desktop. Approve is
// the primary tangerine; Reject opens a modal that requires a
// rejection reason (min 10 chars per the brief).
//
// Race-condition handling: the existing /api/admin/proposals/[id]/
// approve|reject endpoints return 400 with `error: 'invalid_status'`
// when the proposal is no longer pending. We catch that and surface
// a friendly "another admin already reviewed this" message instead
// of a generic failure toast.
//
// On success we router.push('/admin/proposals?filter=pending') —
// admin's typical workflow is to plow through the queue, so landing
// back at the next pending row is the right default.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  FileEdit,
  Loader2,
  XCircle,
} from "lucide-react";

interface ApiError {
  error?: string;
  message?: string;
}

export function ProposalActionBar({
  proposalId,
  currentStatus,
}: {
  proposalId: string;
  // Disable both actions if the proposal isn't pending — admin's
  // landed here from the All / Approved / Rejected tab. The detail
  // page still renders the diff for reference, but actions are
  // gated.
  currentStatus: "draft" | "pending" | "approved" | "rejected";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRejectModal, setShowRejectModal] = useState(false);
  // Session 60 — separate modal for the change-request flow so the
  // copy + button label can be distinct from rejection (admin's
  // intent and the DI's downstream UX differ between the two).
  const [showRequestChangesModal, setShowRequestChangesModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  function handleApiError(err: ApiError, defaultMsg: string): string {
    if (err.error === "invalid_status") {
      return "This proposal was already reviewed by another admin. Refresh to see the current state.";
    }
    if (err.error === "unauthorized") {
      return "Your admin session expired. Sign in again.";
    }
    if (err.error === "not_found") {
      return "This proposal no longer exists. Refresh the queue.";
    }
    if (err.error === "target_child_missing") {
      return "Can't approve — the proposal references a child that's gone.";
    }
    return err.message ?? defaultMsg;
  }

  function onApprove() {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/proposals/${proposalId}/approve`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(body, "Couldn't approve. Try again."));
          return;
        }
        setSuccessToast("Approved. Redirecting…");
        // Tiny delay so the toast registers before navigation.
        window.setTimeout(() => {
          router.push("/admin/proposals?filter=pending");
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
        const res = await fetch(`/api/admin/proposals/${proposalId}/reject`, {
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
          router.push("/admin/proposals?filter=pending");
          router.refresh();
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  // Session 60 — request changes. Calls the new endpoint that flips
  // status back to 'draft' and notifies the DI. Same error-mapping
  // and success-then-redirect choreography as reject so the admin
  // flow feels consistent.
  function onRequestChangesSubmit(reason: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/proposals/${proposalId}/request-changes`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(
            handleApiError(body, "Couldn't send back for changes. Try again."),
          );
          return;
        }
        setShowRequestChangesModal(false);
        setSuccessToast(
          "Sent back to the DI for changes. They've been notified.",
        );
        window.setTimeout(() => {
          router.push("/admin/proposals?filter=pending");
          router.refresh();
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  if (currentStatus !== "pending") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-[13.5px] text-ink-soft">
        This proposal is{" "}
        <span className="font-medium text-ink">{currentStatus}</span>. No
        further action available.
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

      {/* Session 60 — three-button row.
          Order on desktop (left→right): Reject (destructive, outline),
          Request changes (neutral, outline with amber tint), Approve
          (primary, tangerine). Mobile column-reverse keeps Approve at
          the bottom (closest to thumb on tap). */}
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
          onClick={() => setShowRequestChangesModal(true)}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-amber-300 text-amber-800 bg-amber-50 font-medium text-[14.5px] hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <FileEdit className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Request changes
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
        />
      ) : null}
      {showRequestChangesModal ? (
        <RequestChangesModal
          onCancel={() => setShowRequestChangesModal(false)}
          onSubmit={onRequestChangesSubmit}
          pending={pending}
        />
      ) : null}
    </>
  );
}

// Session 60 — request-changes modal. Same shape as RejectModal but
// reframes the action: amber tone (not red), copy emphasises the
// "back to drafts" semantic so admin doesn't expect a terminal
// decision. Reason is REQUIRED (min 10 chars) — the DI's drafts
// surface renders this as the reason the proposal bounced, so
// without it they'd be lost on what to fix.
function RequestChangesModal({
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
      aria-label="Request changes on this proposal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Request changes
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            The proposal goes back to the DI&apos;s drafts queue. Be
            specific about what to revise — it&apos;s how they know
            what to fix before resubmitting.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor="request-changes-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            What needs changing? (min 10 characters)
          </label>
          <textarea
            id="request-changes-reason"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. Story is short — can you add a paragraph about Fahim's daily routine and what he enjoys at school?"
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-600 text-white font-medium text-[14px] hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Send back for changes
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal pattern mirrors DI's Discard-draft modal (Session 48b) for
// consistency. Reason is required + min 10 chars per the brief.
function RejectModal({
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
      aria-label="Reject this proposal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Reject this proposal
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            The DI sees your reason in their notification. Be specific —
            it&apos;s how they know what to fix on the next try.
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
            placeholder="e.g. Birth date conflicts with the school recommendation. Could you check both?"
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
            Reject proposal
          </button>
        </div>
      </div>
    </div>
  );
}
