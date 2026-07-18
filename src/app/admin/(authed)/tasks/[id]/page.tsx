// Admin task detail / workspace.
//
// Everything about one task + the lifecycle actions (Verify / Send
// back, reusing piece #1's TaskVerifyActions + endpoints) + the
// internal admin↔DI comment thread. Reached by clicking a row on
// /admin/tasks.
//
// Privacy: Tier-1 child fields only (display_name + division). The
// comment thread is INTERNAL (never donor-visible).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminTaskById, listAssignableDIs } from "@/lib/admin-tasks";
import { listTaskComments } from "@/lib/task-comments";
import type {
  TaskAdminStatus,
  TaskDiStatus,
  TaskType,
} from "@/lib/di-tasks";
import { TASK_TYPE_LABELS } from "@/lib/task-templates";
import { TaskVerifyActions } from "@/components/admin/TaskVerifyActions";
import {
  TaskQuickAssign,
  type QuickAssignDi,
} from "@/components/admin/TaskQuickAssign";
import { TaskCommentThread } from "@/components/tasks/TaskCommentThread";
import { TaskCommentComposer } from "@/components/tasks/TaskCommentComposer";
import { TaskDeleteButton } from "@/components/admin/TaskDeleteButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Task · OrphanGive",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function diStatusLabel(s: TaskDiStatus): string {
  return s === "open"
    ? "Open"
    : s === "in_progress"
      ? "In progress"
      : "Awaiting verification";
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}
    >
      {children}
    </span>
  );
}

function TypeBadge({ type }: { type: TaskType }) {
  if (type === "general") return null;
  return (
    <Pill tone="bg-tangerine-mist text-tangerine-deeper">
      {TASK_TYPE_LABELS[type]}
    </Pill>
  );
}

function DiStatusBadge({ status }: { status: TaskDiStatus }) {
  const tone =
    status === "completed_pending_verification"
      ? "bg-tangerine-mist text-tangerine-deeper"
      : status === "in_progress"
        ? "bg-moss-soft text-moss-deep"
        : "bg-stone-100 text-stone-700";
  return <Pill tone={tone}>{diStatusLabel(status)}</Pill>;
}

function AdminStatusBadge({ status }: { status: TaskAdminStatus }) {
  if (status === "open") return null;
  const label = status === "verified_complete" ? "Verified" : "Sent back";
  const tone =
    status === "verified_complete"
      ? "bg-moss-soft text-moss-deep"
      : "bg-red-50 text-red-800";
  return <Pill tone={tone}>{label}</Pill>;
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal") return null;
  const tone =
    priority === "urgent"
      ? "bg-red-50 text-red-800"
      : priority === "high"
        ? "bg-amber-50 text-amber-800"
        : "bg-stone-100 text-stone-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium uppercase ${tone}`}
    >
      {priority}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4 py-2.5 border-b border-stone-100 last:border-0">
      <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium sm:w-40 shrink-0 mb-0.5 sm:mb-0">
        {label}
      </dt>
      <dd className="text-[14px] text-ink break-words">{value}</dd>
    </div>
  );
}

export default async function AdminTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) return null; // layout gates; defence-in-depth

  const { id } = await params;
  const task = await getAdminTaskById(id);
  if (!task) notFound();

  const [comments, assignableDIs] = await Promise.all([
    listTaskComments(task.id),
    // Same DI source the create form uses — for quick-assign when the
    // task is unassigned (e.g. a donation auto-task with no DI found).
    listAssignableDIs(null),
  ]);
  const dis: QuickAssignDi[] = assignableDIs.map((d) => ({
    id: d.id,
    label:
      [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || d.email,
  }));

  const assigneeName =
    [task.assignee_first_name, task.assignee_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || task.assignee_email || "—";
  const isUnassigned = !task.assignee_id;

  const showVerifyActions =
    task.di_status === "completed_pending_verification" &&
    (task.admin_status === "open" || task.admin_status === "rejected_redo");

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href="/admin/tasks"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All tasks
      </Link>

      {/* HEADER */}
      <header className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <TypeBadge type={task.type} />
          <DiStatusBadge status={task.di_status} />
          <AdminStatusBadge status={task.admin_status} />
          <PriorityBadge priority={task.priority} />
        </div>
        <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
          {task.title}
        </h1>
        {task.description ? (
          <p className="mt-3 text-[14.5px] text-ink leading-relaxed whitespace-pre-line">
            {task.description}
          </p>
        ) : (
          <p className="mt-3 text-[14.5px] italic text-ink-soft">
            No description provided.
          </p>
        )}

        {/* Lifecycle actions — Verify / Send back (piece #1). Only when
            the DI has submitted and no terminal decision yet. */}
        {showVerifyActions ? (
          <div className="mt-5 pt-4 border-t border-stone-200">
            <TaskVerifyActions taskId={task.id} />
          </div>
        ) : null}
      </header>

      {/* DETAILS */}
      <section className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <dl>
          <Field
            label="Assignee"
            value={
              isUnassigned ? (
                <TaskQuickAssign taskId={task.id} dis={dis} />
              ) : (
                assigneeName
              )
            }
          />
          <Field
            label="Child"
            value={
              task.child_id ? (
                <Link
                  href={`/admin/children/${task.child_id}`}
                  className="text-tangerine-deeper hover:underline"
                >
                  {task.child_display_name ?? "View child"}
                  {task.child_division_name
                    ? ` · ${task.child_division_name}`
                    : ""}
                </Link>
              ) : (
                <span className="text-ink-soft">General task (no child)</span>
              )
            }
          />
          <Field
            label="Sponsorship"
            value={
              task.sponsorship_id ? (
                <Link
                  href={`/admin/sponsorships/${task.sponsorship_id}`}
                  className="text-tangerine-deeper hover:underline"
                >
                  View sponsorship →
                </Link>
              ) : (
                <span className="text-ink-soft">None</span>
              )
            }
          />
          <Field label="Priority" value={task.priority} />
          <Field label="Due date" value={formatDate(task.due_date)} />
          <Field label="Created" value={formatDate(task.date_created)} />
          {task.created_by_name ? (
            <Field label="Created by" value={task.created_by_name} />
          ) : null}
          {task.completed_at ? (
            <Field
              label="DI completed"
              value={formatDateTime(task.completed_at)}
            />
          ) : null}
          {task.verified_at ? (
            <Field
              label="Admin decision"
              value={`${formatDateTime(task.verified_at)}${
                task.verified_by_name ? ` · ${task.verified_by_name}` : ""
              }`}
            />
          ) : null}
          {task.source_payment_id ? (
            <Field
              label="Auto-created"
              value={
                <span className="text-ink-soft">
                  From a donation payment ·{" "}
                  <span className="font-mono text-[12px]">
                    {task.source_payment_id}
                  </span>
                </span>
              }
            />
          ) : null}
        </dl>
      </section>

      {/* INTERNAL COMMENT THREAD */}
      <section className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <TaskCommentThread comments={comments} currentUserId={session.userId} />
        <TaskCommentComposer
          postUrl={`/api/admin/tasks/${task.id}/comments`}
          uploadUrl="/api/admin/uploads/document"
        />
      </section>

      {/* DANGER ZONE — hard-delete (fix/admin-quick-batch). Two-tap
          confirm lives in the button; deleting cascades the comment
          thread and the donor's fulfillment view re-derives from the
          remaining updates (never stranded). */}
      <section className="mb-6 rounded-2xl bg-white border border-red-200/70 shadow-sm p-5 md:p-6">
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[#A02B2B] font-medium mb-3">
          Danger zone
        </h2>
        <TaskDeleteButton
          taskId={task.id}
          hasSponsorship={!!task.sponsorship_id}
        />
      </section>
    </div>
  );
}
