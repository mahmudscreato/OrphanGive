// Admin hard-delete control for a task — fix/admin-quick-batch.
//
// Two-tap confirm (NOT one-click) sitting in the task detail "danger
// zone". First tap arms; second tap within 4s performs the delete.
// POSTs to /api/admin/tasks/[id]/delete then routes back to the task
// list (the task no longer exists) + refreshes so the list re-reads.
//
// The two-tap + auto-disarm pattern mirrors AdminRemoveButton /
// PhotoReviewCard's inline remove. Copy is explicit about the
// irreversibility + the comment-thread cascade.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

const ARM_TIMEOUT_MS = 4000;

export function TaskDeleteButton({
  taskId,
  hasSponsorship,
}: {
  taskId: string;
  /** When the task is tied to a sponsorship, the confirm copy notes
   *  that the donor's fulfillment view recomputes from the remaining
   *  tasks (it never strands — fulfillment is derived read-time). */
  hasSponsorship: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);

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
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/tasks/${taskId}/delete`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          if (body.error === "not_found") {
            setError("This task no longer exists.");
          } else {
            setError(body.message ?? "Couldn't delete. Try again.");
          }
          setArmed(false);
          return;
        }
        // Gone — leave the (now-404) detail page for the list.
        window.setTimeout(() => {
          router.push("/admin/tasks");
          router.refresh();
        }, 150);
      } catch {
        setError("Network error — please try again.");
        setArmed(false);
      }
    });
  }

  return (
    <div>
      {error ? (
        <p className="mb-2 text-[12.5px] text-[#A02B2B]" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-2 text-[13px] font-medium transition-colors ${
          armed ? "text-[#A02B2B]" : "text-stone-500 hover:text-[#A02B2B]"
        } disabled:opacity-60`}
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
        )}
        {armed ? "Tap again to delete this task" : "Delete this task"}
      </button>
      <p className="mt-1 text-[11.5px] text-ink-soft italic">
        Permanently removes the task and its internal comment thread —
        this can&apos;t be undone. Use for mistaken or duplicate tasks, not
        as a substitute for Send back.
        {hasSponsorship
          ? " The donor's fulfillment view for the linked sponsorship recomputes from the remaining updates."
          : ""}
      </p>
    </div>
  );
}

export default TaskDeleteButton;
