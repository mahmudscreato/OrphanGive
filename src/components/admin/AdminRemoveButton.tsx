// Session 52c — Admin "Remove" cleanup button.
//
// Used on admin review detail pages alongside the
// approve/reject ReviewActionBar. Two-tap confirm pattern (first
// tap arms, second tap fires) to avoid an extra modal — the
// remove is a quiet cleanup, not a deliberation. On success the
// user is redirected back to the queue.
//
// API contract:
//   DELETE {endpoint}
//   → 200 { ok: true }
//   → 400 { error: 'invalid_status' } if no longer pending
//   → 404 { error: 'not_found' }

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

const ARM_TIMEOUT_MS = 4000;

export interface AdminRemoveButtonProps {
  endpoint: string;
  redirectTo: string;
  // What we're removing — "document" / "intake photo" / etc. —
  // used in the confirm copy + success toast.
  entityNoun: string;
  // Pre-disabled when the row is already past pending state
  // (server would 400 invalid_status anyway; this avoids the
  // round-trip).
  disabled?: boolean;
}

export function AdminRemoveButton({
  endpoint,
  redirectTo,
  entityNoun,
  disabled = false,
}: AdminRemoveButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);

  // Disarm automatically after a short window so the user has to
  // re-confirm intent if they walked away.
  useEffect(() => {
    if (!armed) return;
    armTimer.current = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => {
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    };
  }, [armed]);

  function onClick() {
    if (!armed) {
      setArmed(true);
      setError(null);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, { method: "DELETE" });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          if (body.error === "invalid_status") {
            setError(
              `This ${entityNoun} was already reviewed by another admin. Refresh to see the current state.`,
            );
          } else if (body.error === "not_found") {
            setError(`This ${entityNoun} no longer exists.`);
          } else {
            setError(body.message ?? "Couldn't remove. Try again.");
          }
          setArmed(false);
          return;
        }
        // Redirect on success. Brief window so the implicit "ok"
        // registers visually before the page changes.
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

  if (disabled) return null;

  return (
    <div className="mt-3">
      {error ? (
        <p className="mb-2 text-[12.5px] text-[#A02B2B]">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={onClick}
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
        {armed
          ? `Tap again to remove this ${entityNoun}`
          : `Remove this ${entityNoun}`}
      </button>
      <p className="mt-1 text-[11.5px] text-ink-soft italic">
        Removes the upload without recording a decision — use for
        DI mistakes, not as a rejection. Approve / Reject above
        records a decision the DI sees.
      </p>
    </div>
  );
}
