// Session 47 — Urgent tasks home-page preview panel.
//
// Server component. Renders up to 5 high/urgent open tasks. Each row
// links to the task's detail page (which doesn't exist yet — falls
// back to the /di/tasks list with a query param so the right card
// is at least visible at the top of the list).
//
// Empty state copy per spec: "No urgent tasks. Nice."

import Link from "next/link";
import { AlertCircle, Flame, ListTodo } from "lucide-react";
import type { TaskPriority, TaskSummary } from "@/lib/di-tasks";

const PRIORITY_PILL: Record<
  TaskPriority,
  { bg: string; text: string; label: string }
> = {
  urgent: { bg: "bg-tangerine-deeper", text: "text-white", label: "Urgent" },
  high: { bg: "bg-tangerine", text: "text-white", label: "High" },
  // Normal/low don't show in this panel but the map needs to be total.
  normal: { bg: "bg-stone-100", text: "text-ink-soft", label: "Normal" },
  low: { bg: "bg-stone-100", text: "text-ink-soft/70", label: "Low" },
};

function relativeDue(iso: string | null, isOverdue: boolean): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T23:59:59Z`);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (isOverdue) {
    const overdueDays = Math.abs(diffDays);
    if (overdueDays === 0) return "Overdue today";
    if (overdueDays === 1) return "Overdue 1 day";
    return `Overdue ${overdueDays} days`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(d);
}

export function UrgentTasksPanel({ tasks }: { tasks: TaskSummary[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2 mb-4">
        <Flame
          className="w-4 h-4 text-tangerine-deeper stroke-[1.75]"
          aria-hidden="true"
        />
        <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
          Urgent tasks
        </h3>
      </header>

      {tasks.length === 0 ? (
        <div className="py-6 text-center">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-moss-soft text-moss-deep mb-2"
            aria-hidden="true"
          >
            <ListTodo className="w-5 h-5 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[16px] text-tangerine-deeper">
            No urgent tasks. Nice.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const pill = PRIORITY_PILL[t.priority];
            const due = relativeDue(t.dueDate, t.isOverdue);
            return (
              <li key={t.id}>
                <Link
                  href="/di/tasks"
                  className="block rounded-xl border border-stone-200 px-3 py-2.5 hover:border-tangerine-soft hover:bg-tangerine-mist/20 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${pill.bg} ${pill.text}`}
                    >
                      {pill.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-ink leading-snug truncate">
                        {t.title}
                      </p>
                      <p className="text-[12px] text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2">
                        {t.childDisplayName ? (
                          <span>About {t.childDisplayName}</span>
                        ) : null}
                        {due ? (
                          <span
                            className={
                              t.isOverdue
                                ? "text-[#9A2424] font-medium inline-flex items-center gap-1"
                                : "inline-flex items-center gap-1"
                            }
                          >
                            {t.isOverdue ? (
                              <AlertCircle
                                className="w-3 h-3 stroke-[1.75]"
                                aria-hidden="true"
                              />
                            ) : null}
                            {due}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
