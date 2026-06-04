// Spine 1.1 — Global admin task queue.
//
// List of every task across all DIs. Server component + an inline
// client control (TaskVerifyActions) for the admin half of the task
// state machine: a task the DI marked 'completed_pending_verification'
// gets Verify / Send-back buttons that POST to
// /api/admin/tasks/[id]/{verify,reject}. The page is also the entry
// point for new-task creation (via /admin/tasks/new).
//
// Filters (URL-driven so links are shareable):
//   ?di_status=open|in_progress|completed_pending_verification|all
//   ?admin_status=open|verified_complete|rejected_redo|all
//
// Privacy: list renders Tier-1 child fields only (display_name +
// division name). No district, DOB, guardian.

import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  listAdminTasks,
  listAssignableDIs,
  type AdminTaskRow,
} from "@/lib/admin-tasks";
import type {
  TaskDiStatus,
  TaskAdminStatus,
  TaskType,
} from "@/lib/di-tasks";
import {
  TaskQuickAssign,
  type QuickAssignDi,
} from "@/components/admin/TaskQuickAssign";
import { TaskVerifyActions } from "@/components/admin/TaskVerifyActions";
import { TASK_TYPE_LABELS } from "@/lib/task-templates";

export const dynamic = "force-dynamic";

const DI_STATUS_FILTERS: ReadonlyArray<{
  value: TaskDiStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  {
    value: "completed_pending_verification",
    label: "Awaiting verification",
  },
];

const ADMIN_STATUS_FILTERS: ReadonlyArray<{
  value: TaskAdminStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All admin states" },
  { value: "open", label: "Admin: open" },
  { value: "verified_complete", label: "Verified complete" },
  { value: "rejected_redo", label: "Sent back — redo" },
];

function parseDiStatus(s: string | undefined): TaskDiStatus | "all" {
  return s === "open" ||
    s === "in_progress" ||
    s === "completed_pending_verification"
    ? s
    : "all";
}
function parseAdminStatus(s: string | undefined): TaskAdminStatus | "all" {
  return s === "open" || s === "verified_complete" || s === "rejected_redo"
    ? s
    : "all";
}

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

export const metadata = {
  title: "Tasks · OrphanGive",
};

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminUser();
  if (!session) {
    // Layout already gates, but defence-in-depth.
    return null;
  }

  const sp = await searchParams;
  const diStatus = parseDiStatus(
    typeof sp.di_status === "string" ? sp.di_status : undefined,
  );
  const adminStatus = parseAdminStatus(
    typeof sp.admin_status === "string" ? sp.admin_status : undefined,
  );

  const [rows, assignableDIs] = await Promise.all([
    listAdminTasks({ diStatus, adminStatus }),
    // Same DI source the create form uses — for the quick-assign
    // dropdown on unassigned (e.g. donation auto-created) tasks.
    listAssignableDIs(null),
  ]);
  const dis: QuickAssignDi[] = assignableDIs.map((d) => ({
    id: d.id,
    label:
      [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || d.email,
  }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <AdminPageHeader
        title="Tasks"
        subtitle="Every field task across the team — assignment, status, evidence."
        action={
          <Link
            href="/admin/tasks/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-tangerine-deep text-white px-4 py-2 text-[13px] font-medium hover:bg-tangerine-deeper transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            New task
          </Link>
        }
      />

      <FiltersBar diStatus={diStatus} adminStatus={adminStatus} />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <TaskRow row={row} dis={dis} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FiltersBar({
  diStatus,
  adminStatus,
}: {
  diStatus: TaskDiStatus | "all";
  adminStatus: TaskAdminStatus | "all";
}) {
  return (
    <form
      method="get"
      className="mb-5 flex flex-wrap gap-3 items-center rounded-2xl bg-white border border-stone-200 p-3"
    >
      <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        DI:
        <select
          name="di_status"
          defaultValue={diStatus}
          className="rounded-lg border border-stone-300 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
        >
          {DI_STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        Admin:
        <select
          name="admin_status"
          defaultValue={adminStatus}
          className="rounded-lg border border-stone-300 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
        >
          {ADMIN_STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg bg-tangerine-mist text-tangerine-deeper px-3 py-1 text-[12.5px] font-medium hover:bg-tangerine-soft transition-colors"
      >
        Apply
      </button>
    </form>
  );
}

function TaskRow({ row, dis }: { row: AdminTaskRow; dis: QuickAssignDi[] }) {
  const assigneeName = [row.assignee_first_name, row.assignee_last_name]
    .filter(Boolean)
    .join(" ");
  const assigneeLabel =
    assigneeName.trim().length > 0 ? assigneeName : row.assignee_email;
  const isUnassigned = !row.assignee_id;
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display text-[15.5px] leading-tight">
          <Link
            href={`/admin/tasks/${row.id}`}
            className="text-ink hover:text-tangerine-deeper hover:underline"
          >
            {row.title}
          </Link>
        </h3>
        <div className="flex gap-1.5">
          <TypePill type={row.type} />
          <DiStatusPill status={row.di_status} />
          <AdminStatusPill status={row.admin_status} />
          <PriorityPill priority={row.priority} />
        </div>
      </div>
      {row.description ? (
        <p className="text-[13px] text-ink-soft leading-snug line-clamp-2 mb-2">
          {row.description}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <span>
          <span className="text-ink-soft">Assignee:</span>{" "}
          {isUnassigned ? (
            <TaskQuickAssign taskId={row.id} dis={dis} />
          ) : (
            <span className="text-ink">{assigneeLabel}</span>
          )}
        </span>
        {row.child_display_name ? (
          <span>
            <span className="text-ink-soft">Child:</span>{" "}
            <span className="text-ink">{row.child_display_name}</span>
            {row.child_division_name
              ? ` · ${row.child_division_name}`
              : ""}
          </span>
        ) : (
          <span>
            <span className="text-ink-soft">Campaign task</span>{" "}
            <span className="text-ink-soft">(no child)</span>
          </span>
        )}
        {row.sponsorship_id ? (
          <Link
            href={`/admin/sponsorships/${row.sponsorship_id}`}
            className="text-tangerine-deeper hover:underline"
          >
            View sponsorship →
          </Link>
        ) : null}
        <span>
          <span className="text-ink-soft">Due:</span>{" "}
          {formatDate(row.due_date)}
        </span>
        <span>
          <span className="text-ink-soft">Created:</span>{" "}
          {formatDate(row.date_created)}
        </span>
      </div>

      {/* Admin verify / send-back. Shown while the DI's submitted work
          is awaiting (admin_status='open') OR already sent back but not
          yet re-started by the DI (admin_status='rejected_redo') — both
          require di_status='completed_pending_verification'. Keeping the
          buttons on a sent-back task lets the admin flip to Verify
          before the DI picks it up. Hidden once admin_status=
          'verified_complete' (terminal — a verified task is done). When
          the DI re-starts a rejected task, di_status moves off
          completed_pending_verification and the buttons stop showing. */}
      {row.di_status === "completed_pending_verification" &&
      (row.admin_status === "open" ||
        row.admin_status === "rejected_redo") ? (
        <TaskVerifyActions taskId={row.id} />
      ) : null}
    </div>
  );
}

function TypePill({ type }: { type: TaskType }) {
  // Suppress 'general' — the neutral/legacy default (mirrors the way
  // PriorityPill suppresses 'normal' and AdminStatusPill suppresses
  // 'open'). The four named types + 'custom' get a badge so tasks are
  // distinguishable at a glance.
  if (type === "general") return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-tangerine-mist text-tangerine-deeper">
      {TASK_TYPE_LABELS[type]}
    </span>
  );
}

function DiStatusPill({ status }: { status: TaskDiStatus }) {
  const label =
    status === "open"
      ? "Open"
      : status === "in_progress"
        ? "In progress"
        : "Awaiting verification";
  const tone =
    status === "completed_pending_verification"
      ? "bg-tangerine-mist text-tangerine-deeper"
      : status === "in_progress"
        ? "bg-moss-soft text-moss-deep"
        : "bg-stone-100 text-stone-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function AdminStatusPill({ status }: { status: TaskAdminStatus }) {
  if (status === "open") return null; // suppress the default; only render exceptional states
  const label =
    status === "verified_complete" ? "Verified" : "Sent back";
  const tone =
    status === "verified_complete"
      ? "bg-moss-soft text-moss-deep"
      : "bg-red-50 text-red-800";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  if (priority === "normal") return null; // suppress default
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

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-10 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
        aria-hidden="true"
      >
        <ListChecks className="w-6 h-6 stroke-[1.5]" />
      </div>
      <p className="font-display text-[16px] text-ink leading-tight mb-1">
        No tasks match these filters.
      </p>
      <p className="text-[13px] text-ink-soft leading-relaxed max-w-md mx-auto">
        Create one from a sponsorship's detail page, or use the New task
        button above to pick a sponsorship first.
      </p>
    </div>
  );
}
