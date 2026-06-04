// Quick-assign control — assign an UNASSIGNED task to a Data Inputter
// without a full edit flow. Rendered inline on the /admin/tasks rows
// and on the /admin/tasks/[id] detail page (only when the task has no
// assignee). On success, router.refresh() re-reads the server
// component, which then shows the assignee name and drops this control.
//
// The DI list comes from the same source as the create form
// (listAssignableDIs) — passed in as { id, label }. The server
// re-validates the chosen id against the active-DI list.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

export interface QuickAssignDi {
  id: string;
  label: string;
}

export function TaskQuickAssign({
  taskId,
  dis,
}: {
  taskId: string;
  dis: QuickAssignDi[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dis.length === 0) {
    return (
      <span className="text-[12px] text-ink-soft italic">
        Unassigned — no active DIs to assign
      </span>
    );
  }

  async function assign() {
    if (!value) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.status === 401) setError("Session expired.");
        else if (res.status === 404) setError("Task no longer available.");
        else setError(data.message ?? data.error ?? "Couldn't assign.");
        setPending(false);
        return;
      }
      // Success — re-read the server component. This control unmounts
      // (the task now has an assignee), so no need to reset state.
      router.refresh();
    } catch {
      setError("Network issue. Try again.");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <UserPlus
        className="w-3.5 h-3.5 text-ink-soft stroke-[1.75]"
        aria-hidden="true"
      />
      <select
        aria-label="Assign to a Data Inputter"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="rounded-lg border border-stone-300 px-2 py-1 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine disabled:opacity-50"
      >
        <option value="">Assign to…</option>
        {dis.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={assign}
        disabled={pending || !value}
        className="inline-flex items-center gap-1 rounded-full bg-tangerine-deep text-white px-2.5 py-1 text-[12px] font-medium hover:bg-tangerine-deeper transition-colors disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? "Assigning…" : "Assign"}
      </button>
      {error ? (
        <span className="text-[11.5px] text-red-700 w-full">{error}</span>
      ) : null}
    </span>
  );
}
