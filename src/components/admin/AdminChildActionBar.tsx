// Session 66 — Admin child detail page action bar.
//
// Three button groups:
//   Edit basic info    → Link to /admin/children/[id]/edit
//   Archive (or Reactivate, when status='withdrawn')
//   Re-upload requests  — these live inside the documents + intake
//                         photo panels rather than here, so the action
//                         bar stays focused on whole-child lifecycle
//
// Archive opens a reason modal (min 10 chars). Reactivate is a single
// click confirm — no reason needed (we audit the action + previous
// state regardless).
//
// On any successful mutation, router.refresh() so the detail page
// re-fetches with the new status and the action bar re-renders with
// the appropriate buttons shown.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Edit3,
  Loader2,
  PlayCircle,
  Trash2,
} from "lucide-react";

interface ApiError {
  error?: string;
  message?: string;
}

export function AdminChildActionBar({
  childId,
  status,
}: {
  childId: string;
  // Raw child.status — we render distinct UI for 'withdrawn' (= our
  // archived bucket) so admin can flip back to active.
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isArchived = status === "withdrawn";

  function handleApiError(err: ApiError, fallback: string): string {
    if (err.error === "unauthorized") {
      return "Your admin session expired. Sign in again.";
    }
    if (err.error === "not_found") {
      return "This child no longer exists. Refresh the list.";
    }
    if (err.error === "invalid_state") {
      return err.message ?? "Action isn't available right now.";
    }
    if (err.error === "write_failed") {
      return "Couldn't save the change. Try again.";
    }
    return err.message ?? fallback;
  }

  function clearAlerts() {
    setServerError(null);
    setSuccessToast(null);
  }

  function onReactivate() {
    clearAlerts();
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/children/${childId}/reactivate`,
          { method: "POST" },
        );
        const data = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(data, "Couldn't reactivate."));
          return;
        }
        setSuccessToast("Reactivated. The child is back on public surfaces.");
        window.setTimeout(() => router.refresh(), 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onArchiveSubmit(reason: string) {
    clearAlerts();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/children/${childId}/archive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(data, "Couldn't archive."));
          return;
        }
        setShowArchiveModal(false);
        setSuccessToast(
          "Archived. The child is hidden from public surfaces but their data is preserved.",
        );
        window.setTimeout(() => router.refresh(), 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  return (
    <section
      aria-label="Admin actions"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Admin actions</h2>

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
        <Link
          href={`/admin/children/${childId}/edit`}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep transition-colors"
        >
          <Edit3 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Edit basic info
        </Link>

        {isArchived ? (
          <button
            type="button"
            onClick={onReactivate}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-moss text-white font-medium text-[14px] hover:bg-moss-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
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
              setShowArchiveModal(true);
            }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[#A02B2B]/30 text-[#A02B2B] bg-white font-medium text-[14px] hover:bg-[#A02B2B]/[0.06] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Archive
          </button>
        )}
      </div>

      <p className="mt-4 text-[12.5px] text-ink-soft leading-relaxed">
        Archive sets the child&apos;s status to &quot;withdrawn&quot; (the
        existing terminal value). The data stays in Directus; donor-facing
        reads stop returning the row. Reactivate flips it back to active.
        Re-upload requests for documents or intake photos live in the
        corresponding panels above.
      </p>

      {showArchiveModal ? (
        <ArchiveReasonModal
          pending={pending}
          onCancel={() => setShowArchiveModal(false)}
          onSubmit={onArchiveSubmit}
        />
      ) : null}
    </section>
  );
}

function ArchiveReasonModal({
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
      setLocalError("Please give at least 10 characters of context.");
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
      aria-label="Archive this child"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Archive this child
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            The child profile will be hidden from donor surfaces. Data is
            preserved and the reason is captured in the audit log.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor="archive-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (min 10 characters)
          </label>
          <textarea
            id="archive-reason"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. Family relocated overseas; sponsorship no longer needed."
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] hover:bg-[#8A2424] text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Archive child
          </button>
        </div>
      </div>
    </div>
  );
}
