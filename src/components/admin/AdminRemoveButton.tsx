// Session 52c → 52d — Admin "Remove" button.
//
// Two modes (52d):
//   1. PENDING: two-tap confirm, no reason captured, silent
//      (no DI notification). For DI mistakes admin cleans up
//      without recording a decision.
//   2. POST-APPROVAL: modal with required reason (min 10 chars).
//      DI is notified with admin's reason verbatim. For ongoing
//      curation — e.g., approved photo turns out to reveal
//      identifying info that wasn't caught at first review.
//
// The `wasApproved` prop drives which mode. The parent decides
// based on the row's current status when rendering the page.
//
// API contract:
//   DELETE {endpoint}
//   Body (52d): { reason?: string }  — pass when approved-mode.
//   → 200 { ok: true, wasStatus, ... }
//   → 404 { error: 'not_found' }
//   → 500 { error: 'server_error' }

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trash2, X } from "lucide-react";

const ARM_TIMEOUT_MS = 4000;

export interface AdminRemoveButtonProps {
  endpoint: string;
  redirectTo: string;
  // What we're removing — "document" / "intake photo" / etc. —
  // used in confirm copy, success toast, and the modal heading.
  entityNoun: string;
  // Session 52d — when true, the click opens a modal prompting
  // for a required reason (min 10 chars). The reason is passed
  // in the DELETE body and surfaces in the DI notification.
  wasApproved?: boolean;
  // Pre-disabled when the entity is in an unrecoverable terminal
  // state (e.g., archived) — admin can use Directus admin
  // directly if truly needed.
  disabled?: boolean;
  // fix/admin-quick-batch — override the default helper caption. Used
  // when the default "not as a rejection" copy doesn't fit (e.g.
  // removing an ALREADY-rejected intake photo to free its slot). Only
  // applies in the non-approved (two-tap) mode.
  helperText?: string;
}

interface ApiResponse {
  error?: string;
  message?: string;
}

export function AdminRemoveButton({
  endpoint,
  redirectTo,
  entityNoun,
  wasApproved = false,
  disabled = false,
  helperText,
}: AdminRemoveButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!armed) return;
    armTimer.current = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => {
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    };
  }, [armed]);

  async function performDelete(reason?: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, {
          method: "DELETE",
          ...(reason
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ reason }),
              }
            : {}),
        });
        const body = (await res.json().catch(() => ({}))) as ApiResponse;
        if (!res.ok) {
          if (body.error === "not_found") {
            setError(`This ${entityNoun} no longer exists.`);
          } else {
            setError(body.message ?? "Couldn't remove. Try again.");
          }
          setArmed(false);
          setShowReasonModal(false);
          return;
        }
        setShowReasonModal(false);
        window.setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 200);
      } catch {
        setError("Network error. Try again.");
        setArmed(false);
      }
    });
  }

  function onPrimaryClick() {
    if (wasApproved) {
      // Open the modal; reason capture is required.
      setShowReasonModal(true);
      return;
    }
    // Pending mode — two-tap confirm.
    if (!armed) {
      setArmed(true);
      setError(null);
      return;
    }
    void performDelete();
  }

  if (disabled) return null;

  return (
    <div className="mt-3">
      {error ? (
        <p className="mb-2 text-[12.5px] text-[#A02B2B]">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={pending}
        className={`inline-flex items-center gap-2 text-[13px] font-medium transition-colors ${
          armed
            ? "text-[#A02B2B]"
            : "text-stone-500 hover:text-[#A02B2B]"
        } disabled:opacity-60`}
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
        )}
        {wasApproved
          ? `Remove this approved ${entityNoun}…`
          : armed
            ? `Tap again to remove this ${entityNoun}`
            : `Remove this ${entityNoun}`}
      </button>
      <p className="mt-1 text-[11.5px] text-ink-soft italic">
        {wasApproved
          ? `Removes a previously-approved ${entityNoun}. DI is notified with your reason. Use for ongoing curation (e.g., later-spotted identifying info).`
          : helperText ??
            `Removes the upload without recording a decision — use for DI mistakes, not as a rejection. Approve / Reject above records a decision the DI sees.`}
      </p>

      {showReasonModal ? (
        <ReasonModal
          entityNoun={entityNoun}
          onCancel={() => setShowReasonModal(false)}
          onSubmit={(r) => void performDelete(r)}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function ReasonModal({
  entityNoun,
  onCancel,
  onSubmit,
  pending,
}: {
  entityNoun: string;
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
      setLocalError(`Please give the DI at least 10 characters of context.`);
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
      aria-label={`Remove approved ${entityNoun}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Remove approved {entityNoun}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-stone-100"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[13px] text-ink-soft leading-relaxed">
            This {entityNoun} is already approved. The DI who uploaded it
            will be notified with your reason — be specific.
          </p>
          <label
            htmlFor="remove-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (min 10 characters)
          </label>
          <textarea
            id="remove-reason"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. The background reveals the family's house number — re-take with the door closed."
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
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
