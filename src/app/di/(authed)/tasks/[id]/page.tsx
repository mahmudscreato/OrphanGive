// Spine 1.2b — DI task detail page.
//
// The connector between an assigned task and filing the report
// against it. Closes the spine's middle handoff:
//   admin tasks DI (1.1) → DI files report for that task (1.2)
//
// Surfaces the task (title, description, due, priority, status), the
// linked child (Tier-1 ONLY — display_name + division; NO district,
// DOB, guardian, medical), the linked sponsorship context, and the
// "File report for this task" CTA that opens the existing report
// form pre-bound to child + sponsorship + task.
//
// Scope: getTaskForUser already filters to `assignee = userId` —
// returns null for any task the DI didn't get assigned, so 404s
// cleanly. A DI can't open another DI's task even by guessing the
// URL.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  FileBarChart,
  Flame,
  RotateCcw,
  Upload,
  User2,
} from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getTaskForUser, type TaskPriority } from "@/lib/di-tasks";
import {
  getDiChildById,
  getDiChildSponsorships,
} from "@/lib/di-children";
import { listReportsForTask } from "@/lib/di-reports";
import { StatusPill, type StatusPillKind } from "@/components/di/StatusPill";
import { TaskActionButton } from "@/components/di/TaskActionButton";

export const dynamic = "force-dynamic";

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
    month: "long",
    year: "numeric",
  }).format(d);
}

function statusToPillKind(status: string): StatusPillKind {
  if (
    status === "submitted_by_di" ||
    status === "under_admin_review" ||
    status === "approved" ||
    status === "correction_requested" ||
    status === "rejected" ||
    status === "published" ||
    status === "verified" ||
    status === "pending" ||
    status === "draft"
  ) {
    return status as StatusPillKind;
  }
  return "draft";
}

export default async function DiTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;

  // Scope-guarded read — returns null for any task that isn't
  // assigned to this DI. notFound() collapses with not-exists so a
  // tampering DI can't distinguish "wrong owner" from "no row".
  const task = await getTaskForUser(id, session.userId);
  if (!task) notFound();

  // Parallel: child (Tier-1 only via DiChildSummary), the DI's
  // reports already filed against this task, and the sponsorship
  // list (we'll filter to the linked one).
  const [child, taskReports, allSponsorships] = await Promise.all([
    task.childId ? getDiChildById(task.childId, session.userId) : null,
    listReportsForTask(session.userId, task.id),
    task.childId
      ? getDiChildSponsorships(task.childId, session.userId)
      : Promise.resolve(null),
  ]);

  // The sponsorship this task is bound to (if any). May be null when
  // the task is general (no sponsorship tie) or when admin assigned a
  // task whose sponsorship was later removed.
  const sponsorship =
    task.sponsorshipId && allSponsorships
      ? allSponsorships.find((s) => s.id === task.sponsorshipId) ?? null
      : null;

  const due = formatDueDate(task.dueDate);
  const priority = PRIORITY_PILL[task.priority];
  const PriorityIcon = priority.Icon;
  const hasFiledReport = taskReports.length > 0;

  // "File report" link — pre-binds child + sponsorship + task via
  // the new /reports/new searchParams handshake (Spine 1.2b).
  const fileReportHref: Route = task.childId
    ? sponsorship
      ? (`/di/children/${task.childId}/reports/new?sponsorshipId=${sponsorship.id}&taskId=${task.id}` as Route)
      : (`/di/children/${task.childId}/reports/new?taskId=${task.id}` as Route)
    : ("/di/tasks" as Route);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href="/di/tasks"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All tasks
      </Link>

      {/* TASK HEADER */}
      <header className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
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
                <AlertCircle
                  className="w-3.5 h-3.5 stroke-[1.75]"
                  aria-hidden="true"
                />
              ) : (
                <CalendarDays
                  className="w-3.5 h-3.5 stroke-[1.75]"
                  aria-hidden="true"
                />
              )}
              {task.isOverdue ? "Overdue · " : "Due "}
              {due}
            </span>
          ) : null}
          {task.adminStatus === "rejected_redo" ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-tangerine-deeper font-medium">
              <RotateCcw
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              Admin asked you to redo this
            </span>
          ) : null}
          {task.adminStatus === "verified_complete" ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-moss-deep">
              <CircleCheckBig
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              Admin verified
            </span>
          ) : null}
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

        {/* Task action button — open → in_progress → completed_pending.
            Separate from the report-filing flow by design (filing
            evidence is not the same intent as marking task progress). */}
        <div className="mt-5 pt-4 border-t border-stone-200">
          <TaskActionButton
            taskId={task.id}
            diStatus={task.diStatus}
            adminStatus={task.adminStatus}
          />
        </div>
      </header>

      {/* CHILD CONTEXT — Tier-1 only */}
      {child ? (
        <section
          className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
          aria-label="Child"
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full bg-tangerine-mist text-tangerine-deeper">
              <User2 className="w-6 h-6 stroke-[1.5]" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
                Child
              </p>
              <p className="mt-1 font-display text-[18px] text-ink leading-snug">
                {child.display_name}
              </p>
              {child.bd_division_name ? (
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {child.bd_division_name}
                </p>
              ) : null}
              <Link
                href={`/di/children/${child.id}` as Route}
                className="mt-2 inline-flex items-center gap-1 text-[13px] text-tangerine-deeper hover:underline"
              >
                Open profile
                <ChevronRight
                  className="w-3.5 h-3.5 stroke-[1.75]"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* SPONSORSHIP CONTEXT — only when tied */}
      {sponsorship ? (
        <section
          className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
          aria-label="Sponsorship"
        >
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-2">
            Sponsorship context
          </p>
          <p className="text-[14.5px] text-ink leading-snug">
            <span className="font-medium">{sponsorship.donor_display_name}</span>
            <span className="text-ink-soft">
              {" · "}
              {sponsorship.sponsor_category === "monthly"
                ? "Monthly sponsor"
                : sponsorship.sponsor_category === "one_time"
                  ? "One-time donor"
                  : sponsorship.sponsor_category === "prepaid"
                    ? "Prepaid sponsor"
                    : "Sponsor"}
            </span>
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
            The report you file against this task will go to this sponsor
            after admin approval.
          </p>
        </section>
      ) : task.sponsorshipId ? (
        // Edge case: task carries a sponsorship FK but the lookup
        // returned null. Could happen if the sponsorship was
        // cancelled / removed after admin assigned the task.
        <section
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5"
          aria-label="Sponsorship missing"
        >
          <p className="text-[13.5px] text-amber-900 leading-relaxed">
            The sponsorship admin tied to this task isn&apos;t reachable
            anymore. Filing a report from here won&apos;t link to a sponsor.
            Reach out to admin if you&apos;re unsure how to proceed.
          </p>
        </section>
      ) : null}

      {/* FILE REPORT CTA + ALREADY-FILED LINK */}
      <section
        className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
        aria-label="File report"
      >
        <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-2">
          Evidence
        </p>

        {hasFiledReport ? (
          <>
            <p className="text-[14px] text-ink leading-relaxed mb-3">
              You&apos;ve filed{" "}
              {taskReports.length === 1
                ? "a report"
                : `${taskReports.length} reports`}{" "}
              against this task. Status updates as admin reviews.
            </p>
            <ul className="space-y-2 mb-4">
              {taskReports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50"
                >
                  <FileBarChart
                    className="w-4 h-4 text-tangerine-deeper stroke-[1.75] shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-ink leading-snug truncate">
                      {r.title}
                    </p>
                    {r.reportType ? (
                      <p className="text-[11.5px] text-ink-soft uppercase tracking-wider mt-0.5">
                        {r.reportType === "progress"
                          ? "Progress report"
                          : "Deployment confirmation"}
                      </p>
                    ) : null}
                  </div>
                  {r.status !== "published" ? (
                    <StatusPill kind={statusToPillKind(r.status)} />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[14px] text-ink leading-relaxed mb-4">
            When the task is done, file a short report — donors who
            funded this work see it after admin review.
          </p>
        )}

        {task.childId ? (
          <Link
            href={fileReportHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white text-[14px] font-medium hover:bg-tangerine-deep transition-colors"
          >
            <Upload className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            {hasFiledReport ? "File another report" : "File report for this task"}
          </Link>
        ) : (
          <p className="text-[13px] italic text-ink-soft">
            This task has no linked child, so a report can&apos;t be filed
            from here.
          </p>
        )}
      </section>
    </div>
  );
}
