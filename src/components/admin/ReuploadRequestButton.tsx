// Session 66 — "Request re-upload" button for a single document or
// intake photo row.
//
// Opens an inline modal asking for a short reason (min 10 chars).
// POSTs to either /api/admin/children/[id]/request-document-reupload
// or /api/admin/children/[id]/request-intake-reupload depending on
// `target.kind`. On success: toast + router.refresh() so the parent
// detail page can re-render whatever surface should reflect the new
// audit row.
//
// Reused inside the documents panel + intake-photo panel of the
// admin child detail page so we don't duplicate modal markup.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

interface ApiError {
  error?: string;
  message?: string;
}

export type ReuploadTarget =
  | { kind: "document"; documentId: string; label: string }
  | { kind: "intake"; intakePhotoId: string; label: string };

export function ReuploadRequestButton({
  childId,
  target,
  // Compact mode renders an icon-only button (used in tight grids).
  compact = false,
}: {
  childId: string;
  target: ReuploadTarget;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  function handleApiError(err: ApiError): string {
    if (err.error === "unauthorized")
      return "Your admin session expired. Sign in again.";
    if (err.error === "not_found")
      return "Target no longer exists. Refresh the page.";
    if (err.error === "invalid_state")
      return err.message ?? "Action isn't available right now.";
    if (err.error === "write_failed")
      return "Couldn't send the request. Try again.";
    return err.message ?? "Something went wrong.";
  }

  function submit(reason: string) {
    setServerError(null);
    setSuccessToast(null);
    startTransition(async () => {
      try {
        const path =
          target.kind === "document"
            ? `/api/admin/children/${childId}/request-document-reupload`
            : `/api/admin/children/${childId}/request-intake-reupload`;
        const body =
          target.kind === "document"
            ? { documentId: target.documentId, reason }
            : { intakePhotoId: target.intakePhotoId, reason };
        const res = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(data));
          return;
        }
        setOpen(false);
        setSuccessToast("Request sent. The DI will see it in their bell.");
        window.setTimeout(() => router.refresh(), 800);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={
          compact
            ? "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stone-300 text-stone-700 bg-white text-[11.5px] hover:bg-stone-50 disabled:opacity-60 transition-colors"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-300 text-stone-700 bg-white text-[12.5px] font-medium hover:bg-stone-50 disabled:opacity-60 transition-colors"
        }
        aria-label={`Request re-upload of ${target.label}`}
      >
        <RefreshCcw className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
        {compact ? "Re-upload" : "Request re-upload"}
      </button>

      {/* Toast lives outside the modal so it stays visible after the
          modal closes on submit. */}
      {successToast && !open ? (
        <div
          className="mt-2 rounded-lg border border-moss/40 bg-moss-soft px-3 py-2 text-[12.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      {open ? (
        <ReuploadModal
          target={target}
          pending={pending}
          serverError={serverError}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}

function ReuploadModal({
  target,
  pending,
  serverError,
  onCancel,
  onSubmit,
}: {
  target: ReuploadTarget;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 10;
  const tooLong = trimmed.length > 500;

  function attemptSubmit() {
    if (tooShort) {
      setLocalError("Give the DI at least 10 characters of context.");
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
      aria-label={`Request re-upload of ${target.label}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Request re-upload
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            Asking the DI to re-upload <strong>{target.label}</strong>. Your
            reason goes verbatim into the DI&apos;s notification.
          </p>
        </div>
        <div className="p-5 space-y-3">
          {serverError ? (
            <div
              className="rounded-lg border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-3 py-2 text-[13px] text-[#A02B2B]"
              role="alert"
            >
              {serverError}
            </div>
          ) : null}
          <label
            htmlFor="reupload-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (min 10 characters)
          </label>
          <textarea
            id="reupload-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. The scan is blurry — please re-photograph in good light."
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          />
          <div className="flex items-center justify-between text-[12px] text-ink-soft">
            <span>{trimmed.length}/500</span>
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
            onClick={attemptSubmit}
            disabled={pending || tooShort || tooLong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tangerine hover:bg-tangerine-deep text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}
