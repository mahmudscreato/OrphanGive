// Session 65 — Account actions panel for the admin donor detail page.
//
// Five buttons, gated by current state:
//   Approve              shown when approval !== 'approved' AND account is active
//   Reject               shown when approval !== 'rejected' AND account is active
//   Suspend              shown when account is active
//   Reactivate           shown when account is suspended
//   Send password reset  always shown (no state dependency)
//
// Reject + Suspend both open a modal that requires a reason (min 10
// chars, max 1000) — same UX as Session 51's ProposalActionBar reject
// flow.
//
// On success of any action: router.refresh() so the page re-fetches
// the donor row with the new state and re-renders the action bar
// with the appropriate buttons disabled / shown.
//
// Errors: every endpoint returns { error: 'unauthorized' | 'not_found'
// | 'invalid_state' | 'write_failed' | 'server_error' }. We map them
// to friendly admin-facing strings via handleApiError; everything
// else falls back to a generic toast.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  PauseCircle,
  PlayCircle,
  XCircle,
} from "lucide-react";
import type {
  DonorAccountStatus,
  DonorApprovalStatus,
} from "@/lib/admin-donors";

interface ApiError {
  error?: string;
  message?: string;
}

type ActionKind =
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate"
  | "password-reset";

export function DonorActionBar({
  donorId,
  approvalStatus,
  accountStatus,
}: {
  donorId: string;
  approvalStatus: DonorApprovalStatus;
  accountStatus: DonorAccountStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  // Each modal pushes its kind here; the modal renders only when set.
  const [modalKind, setModalKind] = useState<"reject" | "suspend" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // ── Visibility rules ──
  //
  // We intentionally still render the Approve button on already-
  // approved donors (collapsed visually below) so admin can re-stamp
  // the approval timestamp if needed for an audit trail follow-up.
  // Same for Reject. The action helpers are idempotent — they record
  // a fresh audit row each time.
  const isSuspended = accountStatus === "suspended";
  const canShowApprove = !isSuspended;
  const canShowReject = !isSuspended;

  function handleApiError(err: ApiError, defaultMsg: string): string {
    if (err.error === "unauthorized") {
      return "Your admin session expired. Sign in again.";
    }
    if (err.error === "not_found") {
      return "This donor no longer exists. Refresh the list.";
    }
    if (err.error === "invalid_state") {
      return (
        err.message ??
        "This action isn't available given the donor's current state."
      );
    }
    if (err.error === "write_failed") {
      return "Couldn't save the change. Try again in a moment.";
    }
    return err.message ?? defaultMsg;
  }

  function clearAlerts() {
    setServerError(null);
    setSuccessToast(null);
  }

  async function callEndpoint(
    kind: ActionKind,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; data: ApiError }> {
    const path = `/api/admin/donors/${donorId}/${pathFor(kind)}`;
    try {
      const res = await fetch(path, {
        method: "POST",
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const data = (await res.json().catch(() => ({}))) as ApiError;
      return { ok: res.ok, data };
    } catch (err) {
      console.warn("[DonorActionBar] network error", err);
      return { ok: false, data: { error: "network", message: "Network error" } };
    }
  }

  function onApprove() {
    clearAlerts();
    setActiveAction("approve");
    startTransition(async () => {
      const { ok, data } = await callEndpoint("approve");
      if (!ok) {
        setServerError(handleApiError(data, "Couldn't approve. Try again."));
        setActiveAction(null);
        return;
      }
      setSuccessToast("Approved. The donor can now create sponsorships.");
      window.setTimeout(() => router.refresh(), 600);
      setActiveAction(null);
    });
  }

  function onReactivate() {
    clearAlerts();
    setActiveAction("reactivate");
    startTransition(async () => {
      const { ok, data } = await callEndpoint("reactivate");
      if (!ok) {
        setServerError(handleApiError(data, "Couldn't reactivate. Try again."));
        setActiveAction(null);
        return;
      }
      setSuccessToast("Reactivated. The donor's account is active again.");
      window.setTimeout(() => router.refresh(), 600);
      setActiveAction(null);
    });
  }

  function onPasswordReset() {
    clearAlerts();
    setActiveAction("password-reset");
    startTransition(async () => {
      const { ok, data } = await callEndpoint("password-reset");
      if (!ok) {
        setServerError(
          handleApiError(data, "Couldn't trigger reset. Try again."),
        );
        setActiveAction(null);
        return;
      }
      setSuccessToast(
        "Reset link sent. The donor will receive an email from Directus.",
      );
      setActiveAction(null);
    });
  }

  function onReasonedSubmit(kind: "reject" | "suspend", reason: string) {
    clearAlerts();
    setActiveAction(kind);
    startTransition(async () => {
      const { ok, data } = await callEndpoint(kind, { reason });
      if (!ok) {
        setServerError(
          handleApiError(data, `Couldn't ${kind}. Try again.`),
        );
        setActiveAction(null);
        return;
      }
      setModalKind(null);
      setSuccessToast(
        kind === "reject"
          ? "Rejected. The donor is flagged in the system."
          : "Suspended. The donor can't create new sponsorships.",
      );
      window.setTimeout(() => router.refresh(), 600);
      setActiveAction(null);
    });
  }

  return (
    <section
      aria-label="Account actions"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Account actions</h2>

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

      <div className="flex flex-wrap gap-3">
        {canShowApprove ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {activeAction === "approve" && pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            )}
            {approvalStatus === "approved" ? "Re-approve" : "Approve"}
          </button>
        ) : null}

        {canShowReject ? (
          <button
            type="button"
            onClick={() => {
              clearAlerts();
              setModalKind("reject");
            }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[14px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <XCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Reject
          </button>
        ) : null}

        {isSuspended ? (
          <button
            type="button"
            onClick={onReactivate}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-moss text-white font-medium text-[14px] hover:bg-moss-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {activeAction === "reactivate" && pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            )}
            Reactivate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              clearAlerts();
              setModalKind("suspend");
            }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[#A02B2B]/30 text-[#A02B2B] bg-white font-medium text-[14px] hover:bg-[#A02B2B]/[0.06] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <PauseCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Suspend
          </button>
        )}

        <button
          type="button"
          onClick={onPasswordReset}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[14px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {activeAction === "password-reset" && pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          Send password reset
        </button>
      </div>

      <p className="mt-4 text-[12.5px] text-ink-soft leading-relaxed">
        Suspend prevents new sponsorships and bounces the donor to the sign-in
        screen on their next visit. Existing sponsorships keep billing — pause
        or cancel each one individually from the sponsorship surface.
      </p>

      {modalKind ? (
        <ReasonModal
          kind={modalKind}
          pending={pending}
          onCancel={() => setModalKind(null)}
          onSubmit={(reason) => onReasonedSubmit(modalKind, reason)}
        />
      ) : null}
    </section>
  );
}

function pathFor(kind: ActionKind): string {
  switch (kind) {
    case "approve":
      return "approve";
    case "reject":
      return "reject";
    case "suspend":
      return "suspend";
    case "reactivate":
      return "reactivate";
    case "password-reset":
      return "send-password-reset";
  }
}

// Modal mirrors ProposalActionBar's RejectModal pattern. Caller picks
// the kind ('reject' vs 'suspend') and the copy adapts.
function ReasonModal({
  kind,
  onCancel,
  onSubmit,
  pending,
}: {
  kind: "reject" | "suspend";
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 10;
  const tooLong = trimmed.length > 1000;

  const copy =
    kind === "reject"
      ? {
          title: "Reject this donor",
          body:
            "The donor will see a rejected state on their dashboard. Be specific — the reason is captured in the audit log.",
          submit: "Reject donor",
          submitColor: "bg-[#A02B2B] hover:bg-[#8A2424]",
          placeholder:
            "e.g. KYC documents don't match the stated identity.",
        }
      : {
          title: "Suspend this donor",
          body:
            "Suspending blocks new sponsorships and redirects the donor to the sign-in screen on next visit. Existing sponsorships continue to bill.",
          submit: "Suspend donor",
          submitColor: "bg-[#A02B2B] hover:bg-[#8A2424]",
          placeholder:
            "e.g. Reported by support team — chargeback dispute pending.",
        };

  function submit() {
    if (tooShort) {
      setLocalError(
        "Please give at least 10 characters of context for the audit log.",
      );
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
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">{copy.title}</h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            {copy.body}
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor={`reason-${kind}`}
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (min 10 characters)
          </label>
          <textarea
            id={`reason-${kind}`}
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder={copy.placeholder}
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
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${copy.submitColor}`}
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {copy.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
