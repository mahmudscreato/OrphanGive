// Session 42 — DI Dashboard home / overview screen.
// Session 47 — replaced ComingSoon placeholders with real
//   UrgentTasksPanel + RecentActivityPanel data.
// Session 68 — polish pass. The Session 47 layout (greeting + 4
//   stat tiles + 4 quick actions + 2-panel grid) becomes:
//   - Notifications strip (when unread > 0)
//   - Welcome strip with name + dated subhead + division context
//   - 4 proposal-lifecycle stat tiles (drafts / pending / approved
//     this month / changes requested) — distinct from di-home-stats'
//     "Children / Open tasks / Pending / Awaiting sponsor" which
//     remains the source for the per-DI count headline kept in the
//     subhead.
//   - 3 quick actions (Add new child / Resume a draft / Check
//     submissions) — the Resume button is a client component that
//     opens an inline picker of recent drafts.
//   - Recent activity feed (last 10 events for this DI).
//
// Back-of-house aesthetic: clean, no decorative confetti / brush /
// script anywhere. Stat numbers use Fraunces for a little warmth;
// everything else stays in body sans.

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  ClipboardList,
  FilePlus2,
  Inbox,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiDashboardStats } from "@/lib/di-dashboard-stats";
import { getRecentActivityForUser } from "@/lib/di-audit";
import { listDraftsForUser } from "@/lib/di-proposals";
import { countUnreadForUser } from "@/lib/di-notifications";
import { getBdDivisions } from "@/lib/di-children";
import { StatTile } from "@/components/di/StatTile";
import { QuickAction } from "@/components/di/QuickAction";
import { RecentActivityPanel } from "@/components/di/RecentActivityPanel";
import {
  DraftPickerModal,
  type DraftPickerEntry,
} from "@/components/di/DraftPickerModal";

export const dynamic = "force-dynamic";

// All 8 Bangladesh divisions per the BD admin geography. When the
// DI's assigned_divisions array has 8 entries we collapse the
// rendering to "all of Bangladesh" rather than listing them all (the
// brief's UX call — saves the strip from becoming a wall of names).
const TOTAL_BD_DIVISIONS = 8;

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

function formatTodayLine(): string {
  // Server-rendered. UTC is fine for the relative "Tuesday, May 19"
  // strip — Bangladesh is UTC+6, so the displayed day flips at
  // 18:00 local time. Accurate enough for a banner.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default async function DiHomePage() {
  const session = await requireDiUser();
  const userId = session.userId;

  // Five parallel reads: stats bundle (4 lifecycle counts), recent
  // activity (last 10), recent drafts (top 5 for the picker), unread
  // notification count, and BD division name resolution. Each
  // helper handles its own error path; nothing here cascades.
  const [stats, recentActivity, recentDrafts, unreadCount, allDivisions] =
    await Promise.all([
      getDiDashboardStats(userId),
      getRecentActivityForUser(userId, 10),
      listDraftsForUser(userId),
      countUnreadForUser(userId),
      getBdDivisions(
        session.assignedDivisions && session.assignedDivisions.length > 0
          ? session.assignedDivisions
          : null,
      ),
    ]);

  // ── Welcome strip prep ──
  //
  // Brief calls for "Welcome back, {first_name}." If first_name is
  // missing (some DIs were bootstrapped without it), fall back to
  // "Welcome back." with no name — beats "Welcome back, ."
  const firstName = session.firstName?.trim();
  const welcome = firstName
    ? `Welcome back, ${firstName}.`
    : "Welcome back.";
  const today = formatTodayLine();

  // Division phrasing: "all of Bangladesh" when assigned to 8,
  // joined names when 1-7, terse hint when 0.
  const assigned = session.assignedDivisions ?? [];
  const hasDivisions = assigned.length > 0;
  let divisionPhrase: string;
  if (!hasDivisions) {
    divisionPhrase = "no divisions assigned yet";
  } else if (assigned.length >= TOTAL_BD_DIVISIONS) {
    divisionPhrase = "all of Bangladesh";
  } else {
    // Map session.assignedDivisions codes → human names via the
    // bd_division collection we just fetched. Any code that doesn't
    // resolve (e.g. legacy spelling) falls through to the raw code
    // so admin can spot the drift.
    const nameByCode = new Map(allDivisions.map((d) => [d.code, d.name]));
    const names = assigned.map((code) => nameByCode.get(code) ?? code);
    divisionPhrase = listJoin(names);
  }

  // ── Drafts mapped to the picker's wire shape ──
  const draftEntries: DraftPickerEntry[] = recentDrafts
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      proposalType: d.proposal_type,
      targetChildId: d.target_child,
      childDisplayName: d.child_display_name,
      proposedDisplayName: d.proposed_display_name,
      dateCreated: d.date_created,
    }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* ── Unread notifications strip ── */}
      {unreadCount > 0 ? (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-[14px] text-amber-900">
            <Bell
              className="w-4 h-4 text-amber-800 stroke-[1.75] shrink-0"
              aria-hidden="true"
            />
            <span>
              You have{" "}
              <span className="font-semibold">{unreadCount}</span>{" "}
              {unreadCount === 1 ? "unread notification" : "unread notifications"}.
            </span>
          </p>
          <Link
            href="/di/notifications"
            className="inline-flex items-center gap-1 text-[13.5px] font-medium text-amber-900 hover:text-amber-800 transition-colors"
          >
            View
            <ArrowRight className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {/* ── Welcome strip ── */}
      <header className="mb-8 md:mb-10">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          {welcome}
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Today is <span className="text-ink">{today}</span> ·{" "}
          {hasDivisions ? (
            <>
              You&apos;re working on behalf of{" "}
              <span className="text-ink font-medium">{divisionPhrase}</span>.
            </>
          ) : (
            <span className="italic text-slate-soft">
              No divisions assigned yet — admin will set this on your
              profile.
            </span>
          )}
        </p>
      </header>

      {/* ── Stat tiles row ── */}
      <section className="mb-12 md:mb-14">
        <h2 className="sr-only">Your submissions at a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Drafts in progress"
            value={formatCount(stats.draftCount)}
            href="/di/drafts"
            icon={ClipboardList}
          />
          <StatTile
            label="Awaiting admin review"
            value={formatCount(stats.pendingCount)}
            href="/di/submissions?status=pending"
            icon={Inbox}
          />
          <StatTile
            label="Approved this month"
            value={formatCount(stats.approvedThisMonthCount)}
            href="/di/submissions?status=approved"
            icon={CheckCircle2}
          />
          <StatTile
            label="Changes requested"
            value={formatCount(stats.changesRequestedCount)}
            href="/di/drafts"
            icon={AlertCircle}
            hint={
              (stats.changesRequestedCount ?? 0) > 0
                ? "Admin sent some back — check drafts"
                : undefined
            }
          />
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section className="mb-10 md:mb-12">
        <h2 className="font-display text-[20px] md:text-[22px] text-ink mb-6">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <QuickAction
            label="Add a new child"
            href="/di/children/new"
            icon={FilePlus2}
          />
          {/* DraftPickerModal renders its own button styled to match
              QuickAction so the row stays visually consistent. */}
          <DraftPickerModal drafts={draftEntries} />
          <QuickAction
            label="Check submissions"
            href="/di/submissions"
            icon={Inbox}
          />
        </div>
      </section>

      {/* ── Recent activity ── */}
      <section>
        <RecentActivityPanel events={recentActivity} />
      </section>
    </div>
  );
}

/**
 * Join an array of names with Oxford-comma logic so the welcome
 * strip reads naturally regardless of length.
 *   1 → "Dhaka"
 *   2 → "Dhaka and Chittagong"
 *   3+ → "Dhaka, Chittagong, and Sylhet"
 */
function listJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
