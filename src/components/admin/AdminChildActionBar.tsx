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
  AlertTriangle,
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
  childDisplayName,
  status,
  canDelete,
  deleteBlockedReason,
  isSuperAdmin,
}: {
  childId: string;
  childDisplayName: string;
  // Raw child.status — we render distinct UI for 'withdrawn' (= our
  // archived bucket) so admin can flip back to active.
  status: string;
  // Session 71 — hard-delete gate. Computed server-side via
  // isChildSafeToDelete (no sponsorship/payment/report/etc. history).
  // When false, Delete is disabled and `deleteBlockedReason` explains
  // why (archive-only). The delete endpoint re-checks this regardless.
  canDelete: boolean;
  deleteBlockedReason: string | null;
  // fix/super-admin-route-gating — hard delete is Super-Admin-only (both
  // the delete + delete-OTP routes 403 a plain Admin). Hide the whole
  // Delete affordance for plain Admins; Archive/Reactivate stay theirs.
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 'withdrawn' = archived (was public, flip back to Reactivate).
  // 'awaiting_intake' = never published yet (admin-created or DI stub) —
  // the publish step. Both use the same reactivate endpoint (flip → active,
  // gated on required fields); only the label differs.
  const isArchived = status === "withdrawn";
  const isAwaitingIntake = status === "awaiting_intake";
  const canPublish = isArchived || isAwaitingIntake;

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
        setSuccessToast(
          isAwaitingIntake
            ? "Published. The child is now live on public surfaces."
            : "Reactivated. The child is back on public surfaces.",
        );
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

        {canPublish ? (
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
            {isAwaitingIntake ? "Publish" : "Reactivate"}
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

        {/* Session 71 — permanent delete. Only enabled for children with
            NO downstream history (canDelete). Otherwise disabled with the
            reason, so admin understands why it's archive-only.
            fix/super-admin-route-gating — the whole affordance is
            Super-Admin-only; plain Admins don't see it at all. */}
        {isSuperAdmin && canDelete ? (
          <button
            type="button"
            onClick={() => {
              clearAlerts();
              setShowDeleteModal(true);
            }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] text-white font-medium text-[14px] hover:bg-[#8A2424] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <AlertTriangle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Delete permanently
          </button>
        ) : isSuperAdmin ? (
          <button
            type="button"
            disabled
            title={deleteBlockedReason ?? "Delete unavailable."}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-stone-300 text-stone-400 bg-stone-50 font-medium text-[14px] cursor-not-allowed"
          >
            <AlertTriangle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Delete permanently
          </button>
        ) : null}
      </div>

      {isSuperAdmin && !canDelete && deleteBlockedReason ? (
        <p className="mt-3 text-[12.5px] text-amber-700 leading-relaxed">
          Delete unavailable — {deleteBlockedReason}
        </p>
      ) : null}

      <p className="mt-4 text-[12.5px] text-ink-soft leading-relaxed">
        Archive sets the child&apos;s status to &quot;withdrawn&quot; (the
        existing terminal value). The data stays in Directus; donor-facing
        reads stop returning the row. Reactivate flips it back to active.
        Delete <strong>permanently</strong> removes a child that has no
        sponsorship/payment/report history (email-code confirmed, cannot be
        undone) — children with any history are archive-only. Re-upload
        requests for documents or intake photos live in the corresponding
        panels above.
      </p>

      {showArchiveModal ? (
        <ArchiveReasonModal
          pending={pending}
          onCancel={() => setShowArchiveModal(false)}
          onSubmit={onArchiveSubmit}
        />
      ) : null}

      {showDeleteModal ? (
        <DeleteOtpModal
          childId={childId}
          childDisplayName={childDisplayName}
          onCancel={() => setShowDeleteModal(false)}
          onDeleted={() => {
            // Child is gone — leave the (now-404) detail page.
            router.push("/admin/children");
          }}
        />
      ) : null}
    </section>
  );
}

// ─── Delete OTP modal (Session 71) ─────────────────────────────────
//
// Two steps, self-contained:
//   1. Warn + "Send delete code" → POST /delete/request-otp (emails the
//      admin). On success advance to step 2.
//   2. Enter the 6-digit code → POST /delete. On success show a brief
//      "Deleted" state, then onDeleted() navigates away.
//
// The safe-delete predicate is enforced server-side in BOTH endpoints;
// this modal is purely the confirmation UX.

function DeleteOtpModal({
  childId,
  childDisplayName,
  onCancel,
  onDeleted,
}: {
  childId: string;
  childDisplayName: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "code" | "done">("confirm");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeValid = /^\d{6}$/.test(code.trim());

  async function sendCode() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(
        `/api/admin/children/${childId}/delete/request-otp`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (data.error === "invalid_state") {
          setError(
            data.message ??
              "This child now has history and can't be deleted. Archive instead.",
          );
        } else if (data.error === "unauthorized") {
          setError("Your admin session expired. Sign in again.");
        } else if (data.error === "not_found") {
          setError("This child no longer exists.");
        } else {
          setError("Couldn't send the code. Try again.");
        }
        return;
      }
      setStep("code");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!codeValid) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/children/${childId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (data.error === "invalid_code" || data.error === "bad_request") {
          setError(data.message ?? "Invalid or expired code.");
        } else if (data.error === "invalid_state") {
          setError(
            data.message ??
              "This child now has history and can't be deleted. Archive instead.",
          );
        } else if (data.error === "not_found") {
          setError("This child no longer exists.");
        } else {
          setError("Couldn't delete the child. Try again.");
        }
        return;
      }
      setStep("done");
      window.setTimeout(onDeleted, 800);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete this child permanently"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#A02B2B]/[0.08] text-[#A02B2B] inline-flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-[18px] text-ink">
              Delete {childDisplayName || "this child"}
            </h3>
            <p className="mt-1 text-[13px] text-[#A02B2B] leading-relaxed font-medium">
              This permanently deletes the child. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {step === "confirm" ? (
            <p className="text-[13.5px] text-ink-soft leading-relaxed">
              We&apos;ll email a 6-digit confirmation code to your admin
              address. Enter it on the next step to permanently remove this
              child and their documents/intake photos. Sponsorship, payment
              and report history would block this — those children can only
              be archived.
            </p>
          ) : step === "code" ? (
            <>
              <label
                htmlFor="delete-otp-code"
                className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
              >
                6-digit code (sent to your email)
              </label>
              <input
                id="delete-otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (error) setError(null);
                }}
                disabled={pending}
                placeholder="123456"
                className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[18px] tracking-[0.3em] text-ink placeholder:text-slate-soft placeholder:tracking-normal focus:outline-none focus:border-[#A02B2B] focus:ring-2 focus:ring-[#A02B2B]/20 transition-all duration-150 disabled:opacity-60"
              />
              <p className="text-[12px] text-ink-soft">
                Code expires in 10 minutes.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-moss-deep leading-relaxed" role="status">
              Deleted. Returning to the children list…
            </p>
          )}

          {error ? (
            <p className="text-[12.5px] text-[#A02B2B]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {step !== "done" ? (
          <div className="px-5 py-4 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            {step === "confirm" ? (
              <button
                type="button"
                onClick={sendCode}
                disabled={pending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] hover:bg-[#8A2424] text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {pending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Send delete code
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending || !codeValid}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] hover:bg-[#8A2424] text-white font-medium text-[14px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {pending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Delete permanently
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
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
