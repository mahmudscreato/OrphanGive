// Session 45 — Submit report page.
// Spine 1.2 — adds optional sponsorship + task pickers so the report
// can flow into the new admin review lifecycle. Without a sponsorship
// pick, the legacy 'pending'-status path still runs.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import {
  getDiChildById,
  getDiChildSponsorships,
} from "@/lib/di-children";
import { listTasksForUser } from "@/lib/di-tasks";
import { ReportForm } from "@/components/di/ReportForm";

export const dynamic = "force-dynamic";

export default async function DiNewReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Spine 1.2b — when the DI lands here via the "File report for
  // this task" button on /di/tasks/[id], the link carries the
  // task's sponsorship + task ids so the ReportForm pickers come
  // up pre-bound. URL parameters are validated against the loaded
  // sponsorships/tasks below; server-side createReport is the
  // security boundary, so any URL tampering at most de-binds the
  // selection rather than letting the DI bypass scope.
  searchParams: Promise<{ sponsorshipId?: string; taskId?: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;
  const sp = await searchParams;
  const child = await getDiChildById(id, session.userId);
  if (!child) notFound();

  // Spine 1.2 — parallel fetches for the new selectors.
  // - Sponsorships: this child's sponsorships, server-scoped (returns
  //   null only when the DI lacks scope, which we already ruled out).
  // - Tasks: ALL the DI's tasks; we filter to this child + the picked
  //   sponsorship client-side. Server-side validation in createReport
  //   re-checks assignee + sponsorship match (defence-in-depth).
  const [sponsorshipsRaw, allTasks] = await Promise.all([
    getDiChildSponsorships(id, session.userId),
    listTasksForUser(session.userId),
  ]);
  const sponsorships = (sponsorshipsRaw ?? [])
    // Hide terminal-state rows from the picker — a DI shouldn't be
    // filing reports against cancelled / completed sponsorships in
    // V1. Admin can revisit if the policy needs to soften.
    .filter((s) => s.status === "active" || s.status === "paused")
    .map((s) => ({
      id: s.id,
      sponsor_category: s.sponsor_category,
      status: s.status,
      donor_display_name: s.donor_display_name,
    }));

  // Tasks for this child only; the form filters further by picked
  // sponsorship.
  const tasksForChild = allTasks
    .filter((t) => t.childId === id)
    .map((t) => ({
      id: t.id,
      title: t.title,
      // listTasksForUser doesn't return sponsorship today — read it
      // from a follow-on lookup when sponsorship-filtering is needed.
      // For now we surface every task for this child; the form will
      // hide tasks whose sponsorship doesn't match the picked one
      // (we set sponsorshipId = null here; the server-side validation
      // in createReport is the security boundary). To get the task's
      // sponsorship onto this prop, the DI task summary needs to
      // expose it — a small TASK_FIELDS extension. Done in this same
      // commit; see src/lib/di-tasks.ts.
      sponsorshipId: t.sponsorshipId ?? null,
      diStatus: t.diStatus,
    }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href={`/di/children/${id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {child.display_name || "Child"}
      </Link>

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Submit report
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          A note about how {child.display_name} is doing. Donors see this
          after admin approval.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Donors look forward to these.
        </p>
      </header>

      <ReportForm
        childId={id}
        childName={child.display_name || "this child"}
        sponsorships={sponsorships}
        tasks={tasksForChild}
        initialSponsorshipId={
          // Pre-bind ONLY if the URL-named sponsorship is actually in
          // the loaded picker — silently drop otherwise (no error
          // surface; the DI can repick).
          typeof sp.sponsorshipId === "string" &&
          sponsorships.some((s) => s.id === sp.sponsorshipId)
            ? sp.sponsorshipId
            : ""
        }
        initialTaskId={
          // Pre-bind task only when its sponsorship matches the
          // pre-bound sponsorship (same defensive check the form
          // applies after selection).
          typeof sp.taskId === "string" &&
          typeof sp.sponsorshipId === "string" &&
          tasksForChild.some(
            (t) =>
              t.id === sp.taskId && t.sponsorshipId === sp.sponsorshipId,
          )
            ? sp.taskId
            : ""
        }
      />
    </div>
  );
}
