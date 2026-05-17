// Session 46 — DI Tasks page.
//
// Server component. Reads the DI session, lists their assigned tasks
// with optional URL-driven status filter, renders cards. Empty state
// gets the Caveat italic accent.

import Link from "next/link";
import { ListTodo } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import {
  listTasksForUser,
  type TaskDiStatus,
} from "@/lib/di-tasks";
import { TaskCard } from "@/components/di/TaskCard";

export const dynamic = "force-dynamic";

const FILTER_OPTIONS: ReadonlyArray<{
  value: "all" | TaskDiStatus;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  {
    value: "completed_pending_verification",
    label: "Awaiting verification",
  },
];

function isStatusFilter(
  v: string | undefined,
): v is "all" | TaskDiStatus {
  return (
    v === "all" ||
    v === "open" ||
    v === "in_progress" ||
    v === "completed_pending_verification"
  );
}

export default async function DiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireDiUser();
  const sp = await searchParams;
  const filter: "all" | TaskDiStatus = isStatusFilter(sp.status)
    ? sp.status
    : "all";

  const tasks = await listTasksForUser(session.userId, {
    diStatus: filter,
  });

  // Surface count of "needs attention" — open + in_progress tasks. We
  // include the count in the subtitle so a DI scanning the page knows
  // the size of their pile at a glance.
  const needsAttentionCount = tasks.filter(
    (t) => t.diStatus !== "completed_pending_verification",
  ).length;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Tasks
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          What admin has asked you to do.
          {filter === "all" && tasks.length > 0 ? (
            <>
              {" "}
              <span className="text-ink font-medium">
                {needsAttentionCount}
              </span>{" "}
              {needsAttentionCount === 1 ? "task needs" : "tasks need"} your
              attention.
            </>
          ) : null}
        </p>
      </header>

      {/* Filter pills */}
      <nav
        aria-label="Filter by task status"
        className="mb-5 md:mb-6 flex gap-2 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {FILTER_OPTIONS.map((f) => {
          const selected = f.value === filter;
          const href =
            f.value === "all" ? "/di/tasks" : `/di/tasks?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors ${
                selected
                  ? "bg-tangerine text-white"
                  : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-4"
            aria-hidden="true"
          >
            <ListTodo className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            A clear day. Take a breath.
          </p>
          <p className="font-display text-[20px] text-ink mb-2">
            {filter === "all"
              ? "No tasks assigned."
              : `No ${
                  filter === "in_progress"
                    ? "in-progress"
                    : filter === "open"
                      ? "open"
                      : "awaiting verification"
                } tasks.`}
          </p>
          <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto">
            {filter === "all"
              ? "You're up to date. When admin assigns you new work, it'll appear here."
              : (
                <>
                  Try{" "}
                  <Link
                    href="/di/tasks"
                    className="text-tangerine-deeper hover:underline font-medium"
                  >
                    All
                  </Link>{" "}
                  to see every task.
                </>
              )}
          </p>
        </div>
      ) : (
        <div>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
