// Session 42 — DI Dashboard home / overview screen.
// Session 47 — Tile data sources moved to src/lib/di-home-stats.ts
//   (the SDK aggregate() bug from Sessions 42-46 is fixed there).
// Session 47 — "Tasks done this month" tile replaced with
//   "Awaiting sponsor". UrgentTasksPanel + RecentActivityPanel
//   replace the two ComingSoon placeholders.
//
// Server component. Pulls the DI session (already validated by
// (authed)/layout.tsx) and four count aggregates plus two list
// previews (urgent tasks + recent activity).

import {
  Users,
  ListTodo,
  Inbox,
  Plus,
  Camera,
  FileText,
  Truck,
  HeartHandshake,
} from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiHomeStats } from "@/lib/di-home-stats";
import { getUrgentTasksForUser } from "@/lib/di-tasks";
import { getRecentActivityForUser } from "@/lib/di-audit";
import { StatTile } from "@/components/di/StatTile";
import { QuickAction } from "@/components/di/QuickAction";
import { UrgentTasksPanel } from "@/components/di/UrgentTasksPanel";
import { RecentActivityPanel } from "@/components/di/RecentActivityPanel";

export const dynamic = "force-dynamic";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export default async function DiHomePage() {
  const session = await requireDiUser();
  const userId = session.userId;
  const greeting =
    session.firstName && session.firstName.trim().length > 0
      ? `Salaam, ${session.firstName.trim()}.`
      : "Salaam.";

  // Three parallel reads: stats bundle (4 tile counts + breakdowns),
  // urgent task preview (≤5), recent activity preview (≤8). Each
  // helper handles its own error path; nothing here cascades.
  const [stats, urgentTasks, recentActivity] = await Promise.all([
    getDiHomeStats(userId),
    getUrgentTasksForUser(userId, 5),
    getRecentActivityForUser(userId, 8),
  ]);

  // Pending submissions roll-up — same shape as Session 46. The
  // aggregate failures gracefully degrade to 0 contributions; tile
  // shows "—" only if ALL four sources errored.
  const pendingTotal =
    (stats.pendingProposalCount ?? 0) +
    (stats.pendingMomentCount ?? 0) +
    (stats.pendingReportCount ?? 0) +
    (stats.pendingDeliveryCount ?? 0);
  const pendingTooltip = [
    `${formatCount(stats.pendingProposalCount)} profile change${(stats.pendingProposalCount ?? 0) === 1 ? "" : "s"}`,
    `${formatCount(stats.pendingMomentCount)} moment${(stats.pendingMomentCount ?? 0) === 1 ? "" : "s"}`,
    `${formatCount(stats.pendingReportCount)} report${(stats.pendingReportCount ?? 0) === 1 ? "" : "s"}`,
    `${formatCount(stats.pendingDeliveryCount)} deliver${(stats.pendingDeliveryCount ?? 0) === 1 ? "y" : "ies"}`,
  ].join(" · ");
  const allPendingFailed =
    stats.pendingProposalCount === null &&
    stats.pendingMomentCount === null &&
    stats.pendingReportCount === null &&
    stats.pendingDeliveryCount === null;
  const pendingValue = allPendingFailed
    ? "—"
    : formatCount(pendingTotal);

  // Greeting subhead split: lead text + soft note for divisions
  // status (Session 42-FIX3).
  const childCountForSubhead = stats.childCount ?? 0;
  const childWord = childCountForSubhead === 1 ? "child" : "children";
  const hasDivisions =
    session.assignedDivisions && session.assignedDivisions.length > 0;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Greeting block */}
      <header className="mb-8 md:mb-10">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          {greeting}
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          You manage{" "}
          <span className="text-ink font-medium">
            {formatCount(stats.childCount)}
          </span>{" "}
          {childWord}.
        </p>
        {hasDivisions ? (
          <p className="mt-1 text-[13px] md:text-[14px] text-ink-soft leading-relaxed">
            Assigned divisions:{" "}
            <span className="text-ink">
              {session.assignedDivisions!.join(", ")}
            </span>
            .
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] md:text-[13px] italic text-slate-soft leading-relaxed">
            No divisions assigned yet — admin will set this on your profile.
          </p>
        )}
      </header>

      {/* Stat tiles — 2x2 mobile, 4-across desktop */}
      <section className="mb-12 md:mb-16">
        <h2 className="sr-only">At a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Children I manage"
            value={formatCount(stats.childCount)}
            href="/di/children"
            icon={Users}
          />
          <StatTile
            label="Open tasks"
            value={formatCount(stats.openTaskCount)}
            href="/di/tasks"
            icon={ListTodo}
          />
          <StatTile
            label="Pending submissions"
            value={pendingValue}
            href="/di/submissions"
            icon={Inbox}
            tooltip={pendingTooltip}
          />
          {/* Session 47 — replaced "Tasks done this month" with
              "Awaiting sponsor". Counts the DI's children with a
              support_type set who don't yet have an active monthly
              sponsorship. Donor-facing equivalent of "ready to fund". */}
          <StatTile
            label="Awaiting sponsor"
            value={formatCount(stats.awaitingSponsorCount)}
            href="/di/children?status=awaiting"
            icon={HeartHandshake}
            hint="children waiting for a donor"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-10 md:mb-12">
        <h2 className="font-display text-[20px] md:text-[22px] text-ink mb-6">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <QuickAction
            label="Add new child"
            href="/di/children/new"
            icon={Plus}
          />
          <QuickAction
            label="Upload moment"
            href="/di/children"
            icon={Camera}
          />
          <QuickAction
            label="Submit report"
            href="/di/children"
            icon={FileText}
          />
          <QuickAction
            label="Mark delivery"
            href="/di/children"
            icon={Truck}
          />
        </div>
      </section>

      {/* Session 47 — real data replaces the Session 46 placeholders. */}
      <section className="grid md:grid-cols-2 gap-4">
        <UrgentTasksPanel tasks={urgentTasks} />
        <RecentActivityPanel events={recentActivity} />
      </section>
    </div>
  );
}
