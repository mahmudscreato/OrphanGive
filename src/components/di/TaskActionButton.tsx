// Session 46 — Task action button (client).
//
// Button text + behavior switches on the (di_status, admin_status)
// pair. Single source of truth for the state machine UI.
//
//   Open                            → "Start"            (POST in_progress)
//   In progress                     → "Mark complete"    (POST completed_pending_verification)
//   Completed (admin open)          → "Awaiting verification"  (disabled)
//   Verified complete               → "Done ✓"           (disabled)
//   Rejected redo (any di status)   → "Redo"             (POST in_progress)

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play, RotateCcw } from "lucide-react";
import type {
  TaskAdminStatus,
  TaskDiStatus,
} from "@/lib/di-tasks";

type ButtonShape =
  | { kind: "start" }
  | { kind: "mark-complete" }
  | { kind: "awaiting" }
  | { kind: "done" }
  | { kind: "redo" };

function shapeFor(
  diStatus: TaskDiStatus,
  adminStatus: TaskAdminStatus,
): ButtonShape {
  // Rejected-redo wins over di_status — DI must rework regardless of
  // current di state.
  if (adminStatus === "rejected_redo") return { kind: "redo" };
  if (adminStatus === "verified_complete") return { kind: "done" };
  if (diStatus === "open") return { kind: "start" };
  if (diStatus === "in_progress") return { kind: "mark-complete" };
  return { kind: "awaiting" };
}

export function TaskActionButton({
  taskId,
  diStatus,
  adminStatus,
}: {
  taskId: string;
  diStatus: TaskDiStatus;
  adminStatus: TaskAdminStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shape = shapeFor(diStatus, adminStatus);

  function transitionTo(to: "in_progress" | "completed_pending_verification") {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/di/tasks/${taskId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        });
        if (!res.ok) {
          if (res.status === 401) {
            setError("Your session expired.");
            return;
          }
          if (res.status === 404) {
            setError("Task no longer in your list. Refresh.");
            return;
          }
          if (res.status === 400) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            if (body.error === "invalid_transition") {
              setError("Refresh — the task was updated since you opened this.");
              return;
            }
          }
          setError("Couldn't update. Please try again.");
          return;
        }
        // Soft refresh — server component re-reads the now-updated row.
        router.refresh();
      } catch {
        setError("Network issue. Try again.");
      }
    });
  }

  const baseBtn =
    "w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-colors min-h-[44px]";

  if (shape.kind === "start") {
    return (
      <ButtonShell error={error}>
        <button
          type="button"
          onClick={() => transitionTo("in_progress")}
          disabled={pending}
          className={`${baseBtn} bg-tangerine text-white hover:bg-tangerine-deep disabled:opacity-60`}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play
              className="w-4 h-4 stroke-[2]"
              aria-hidden="true"
            />
          )}
          Start
        </button>
      </ButtonShell>
    );
  }

  if (shape.kind === "mark-complete") {
    return (
      <ButtonShell error={error}>
        <button
          type="button"
          onClick={() => transitionTo("completed_pending_verification")}
          disabled={pending}
          className={`${baseBtn} bg-moss text-white hover:bg-moss-deep disabled:opacity-60`}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
          )}
          Mark complete
        </button>
      </ButtonShell>
    );
  }

  if (shape.kind === "redo") {
    return (
      <ButtonShell error={error}>
        <button
          type="button"
          onClick={() => transitionTo("in_progress")}
          disabled={pending}
          className={`${baseBtn} border border-tangerine text-tangerine-deeper bg-white hover:bg-tangerine-mist/40 disabled:opacity-60`}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          Redo
        </button>
      </ButtonShell>
    );
  }

  if (shape.kind === "done") {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${baseBtn} bg-moss text-white opacity-90 cursor-default`}
      >
        <CheckCircle2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
        Done
      </button>
    );
  }

  // awaiting
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className={`${baseBtn} bg-stone-100 text-slate cursor-default`}
    >
      Awaiting verification
    </button>
  );
}

function ButtonShell({
  children,
  error,
}: {
  children: React.ReactNode;
  error: string | null;
}) {
  return (
    <div className="w-full md:w-auto">
      {children}
      {error ? (
        <p className="mt-2 text-[12.5px] text-[#9A2424]">{error}</p>
      ) : null}
    </div>
  );
}
