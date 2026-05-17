// Session 46 — single task card.
//
// Server component (with embedded TaskActionButton client island for
// the di_status transition). One per task in the /di/tasks list.

import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  Clock,
  Flame,
} from "lucide-react";
import type {
  TaskAdminStatus,
  TaskPriority,
  TaskSummary,
} from "@/lib/di-tasks";
import { TaskActionButton } from "./TaskActionButton";

const PRIORITY_PILL: Record<
  TaskPriority,
  { bg: string; text: string; label: string; Icon: typeof Flame | null }
> = {
  urgent: {
    bg: "bg-tangerine-deeper",
    text: "text-white",
    label: "Urgent",
    Icon: Flame,
  },
  high: {
    bg: "bg-tangerine",
    text: "text-white",
    label: "High",
    Icon: null,
  },
  normal: {
    bg: "bg-stone-100",
    text: "text-ink-soft",
    label: "Normal",
    Icon: null,
  },
  low: {
    bg: "bg-stone-100",
    text: "text-ink-soft/70",
    label: "Low",
    Icon: null,
  },
};

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

const ADMIN_HINT: Partial<
  Record<TaskAdminStatus, { label: string; tone: string }>
> = {
  rejected_redo: {
    label: "Admin asked you to redo this",
    tone: "text-tangerine-deeper",
  },
  verified_complete: {
    label: "Admin verified",
    tone: "text-moss-deep",
  },
};

export function TaskCard({ task }: { task: TaskSummary }) {
  const priority = PRIORITY_PILL[task.priority];
  const PriorityIcon = priority.Icon;
  const due = formatDueDate(task.dueDate);
  const adminHint = ADMIN_HINT[task.adminStatus];

  return (
    <article className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 mb-3">
      {/* Top row: priority + due + admin status hint */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${priority.bg} ${priority.text}`}
        >
          {PriorityIcon ? (
            <PriorityIcon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
          ) : null}
          {priority.label}
        </span>
        {due ? (
          <span
            className={`inline-flex items-center gap-1 text-[12.5px] ${
              task.isOverdue
                ? "text-[#9A2424] font-medium"
                : "text-ink-soft"
            }`}
          >
            {task.isOverdue ? (
              <AlertCircle className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            ) : (
              <CalendarDays className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            )}
            {task.isOverdue ? "Overdue · " : "Due "}
            {due}
          </span>
        ) : null}
        {task.diStatus === "completed_pending_verification" &&
        task.adminStatus === "open" ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-soft">
            <Clock className="w-3 h-3 stroke-[2]" aria-hidden="true" />
            Awaiting verification
          </span>
        ) : null}
      </div>

      {/* Title */}
      <h3 className="font-display text-[18px] text-ink leading-snug mt-2">
        {task.title}
      </h3>

      {/* Description */}
      {task.description ? (
        <p className="mt-1 text-[14px] text-ink-soft leading-relaxed line-clamp-3">
          {task.description}
        </p>
      ) : null}

      {/* Linked child */}
      {task.childId && task.childDisplayName ? (
        <Link
          href={`/di/children/${task.childId}`}
          className="mt-2 inline-flex items-center gap-1 text-[13px] text-tangerine-deeper hover:underline"
        >
          About {task.childDisplayName}
          <ChevronRight className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Admin hint (rejected / verified) */}
      {adminHint ? (
        <p className={`mt-3 text-[13px] ${adminHint.tone}`}>{adminHint.label}</p>
      ) : null}

      {/* Action button */}
      <div className="mt-4 pt-3 border-t border-stone-200">
        <TaskActionButton
          taskId={task.id}
          diStatus={task.diStatus}
          adminStatus={task.adminStatus}
        />
      </div>
    </article>
  );
}
