// Admin verify / send-back controls for a task awaiting verification.
//
// Rendered on /admin/tasks ONLY for rows where di_status ===
// 'completed_pending_verification' AND admin_status === 'open' (i.e.
// the DI has submitted the work and the admin hasn't decided yet).
// Once a decision is written, the parent stops rendering this and the
// AdminStatusPill ("Verified" / "Sent back") reflects the outcome.
//
// POSTs to the admin write path (no body) then router.refresh() so the
// server component re-reads the task and swaps this control for the
// resulting pill. Errors surface inline; the buttons re-enable so the
// admin can retry.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";

export function TaskVerifyActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<null | "verify" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "verify" | "reject") {
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/${kind}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        setError(
          (data && (data.message || data.error)) || `Failed (${res.status})`,
        );
        setPending(null);
        return;
      }
      // Success — re-read the server component. The row's admin_status
      // changes, so this control unmounts; no need to reset `pending`.
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setPending(null);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-stone-100">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => act("verify")}
          disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-full bg-moss-deep text-white px-3.5 py-1.5 text-[12.5px] font-medium hover:bg-moss-deep/90 transition-colors disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
          {pending === "verify" ? "Verifying…" : "Verify complete"}
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white text-red-800 px-3.5 py-1.5 text-[12.5px] font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
          {pending === "reject" ? "Sending back…" : "Send back"}
        </button>
        <span className="text-[11.5px] text-ink-soft">
          Verify accepts the work; Send back returns it to the DI to redo.
        </span>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
