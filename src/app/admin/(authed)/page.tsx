// Admin Lot 1 — admin home dashboard.
//
// Daily-operations landing surface:
//   1. Quick actions       — one-tap into the most-used admin flows
//   2. Pending work        — what's queued, click-through to triage
//   3. Operational snapshot — active/live counts at a glance
//   4. Attention items     — fulfillment exceptions (only when present)
//
// Read-only. Every count comes from existing counter helpers or a
// single safeCount call in admin-dashboard.ts. No writes, no schema,
// no business-logic touch. Every tile/button links to a real, filtered
// destination — a tile's number always links to a list showing exactly
// those items.

import {
  AlertTriangle,
  CalendarClock,
  Camera,
  ClipboardCheck,
  CreditCard,
  Eye,
  FileBarChart,
  FileText,
  Gift,
  HeartHandshake,
  Hourglass,
  ImagePlus,
  Inbox,
  ListChecks,
  PauseCircle,
  Plus,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { getAdminOverviewStats } from "@/lib/admin-overview-stats";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { AttentionCard } from "@/components/admin/AttentionCard";
import { DashboardSection } from "@/components/admin/DashboardSection";

export const dynamic = "force-dynamic";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

// Null-aware sum: "—" only when EVERY input failed to load; otherwise a
// failed count is treated as 0 so the total still reflects what loaded.
function sumCounts(...vals: Array<number | null>): number | null {
  if (vals.every((v) => v === null)) return null;
  return vals.reduce<number>((a, v) => a + (v ?? 0), 0);
}

// Deep-link to the "DI marked complete, awaiting admin verification"
// slice of the tasks list — the tasks page honours these two params.
const TASKS_TO_VERIFY_HREF =
  "/admin/tasks?di_status=completed_pending_verification&admin_status=open";

const QUICK_ACTIONS: ReadonlyArray<{
  label: string;
  href: string;
  icon: typeof ListChecks;
}> = [
  { label: "Review queue", href: "/admin/reviews", icon: ListChecks },
  { label: "Tasks to verify", href: TASKS_TO_VERIFY_HREF, icon: ClipboardCheck },
  { label: "New Child", href: "/admin/children/new", icon: UserPlus },
  { label: "New Task", href: "/admin/tasks/new", icon: Plus },
];

export default async function AdminHomePage() {
  const session = await requireAdminUser();
  const greeting =
    session?.firstName && session.firstName.trim().length > 0
      ? `Good day, ${session.firstName.trim()}.`
      : "Good day.";

  // Existing dashboard data + the new overview stats, in parallel.
  const [data, overview] = await Promise.all([
    getAdminDashboardData(),
    getAdminOverviewStats(),
  ]);
  const { base } = data;

  // Pending review total = the 5 review queues (4 from getAdminHomeStats +
  // reveal). NOT proposals (a separate surface).
  const pendingReviewTotal = sumCounts(
    base.pendingMomentCount,
    base.pendingIntakePhotoCount,
    base.pendingDocumentCount,
    base.pendingReportCount,
    overview.pendingRevealCount,
  );

  // Surface attention items only when any > 0 — avoid four amber
  // cards on a quiet day. fulfillment_exception columns are on main
  // (sub-phase 1) so this query never throws.
  const exceptionsTotal =
    (data.fulfillmentOnHold ?? 0) +
    (data.fulfillmentDisputed ?? 0) +
    (data.fulfillmentRefundRequested ?? 0) +
    (data.fulfillmentRefunded ?? 0);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-6xl mx-auto">
      <AdminPageHeader
        title={greeting}
        subtitle="Today's queues and the state of the platform."
        flourish="Approve thoughtfully, reject with kindness."
      />

      {/* ─── Needs attention (actionable rollups) ─────────────────── */}
      <DashboardSection
        eyebrow="Act on these"
        title="Needs attention"
        viewAllHref="/admin/reviews"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <AdminStatTile
            label="Pending review"
            value={formatCount(pendingReviewTotal)}
            href="/admin/reviews"
            icon={Inbox}
            hint="across all 5 review queues"
          />
          <AdminStatTile
            label="Reveal requests"
            value={formatCount(overview.pendingRevealCount)}
            href="/admin/reviews/reveal-requests"
            icon={Eye}
            hint="Tier-3 information-access asks"
          />
          <AdminStatTile
            label="Ending this month"
            value={formatCount(overview.childrenEndingThisMonth)}
            href="/admin/sponsorships?filter=active"
            icon={CalendarClock}
            hint="children whose paid term ends"
          />
        </div>
      </DashboardSection>

      {/* ─── Overview (state of the platform) ─────────────────────── */}
      <DashboardSection eyebrow="At a glance" title="Overview">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <AdminStatTile
            label="Children listed"
            value={formatCount(overview.childrenListed)}
            href="/admin/children"
            icon={Users}
            hint="active in the program"
          />
          <AdminStatTile
            label="Children sponsored"
            value={formatCount(overview.childrenSponsored)}
            href="/admin/children?has=yes"
            icon={HeartHandshake}
            hint="have an active sponsor"
          />
          <AdminStatTile
            label="Children waiting"
            value={formatCount(overview.childrenWaiting)}
            href="/admin/children?has=no"
            icon={Hourglass}
            hint="awaiting a sponsor"
          />
          <AdminStatTile
            label="Active sponsorships"
            value={formatCount(data.activeSponsorships)}
            href="/admin/sponsorships?filter=active"
            icon={HeartHandshake}
            hint="currently funding a child"
          />
          <AdminStatTile
            label="Paused sponsorships"
            value={formatCount(overview.pausedSponsorships)}
            href="/admin/sponsorships?filter=paused"
            icon={PauseCircle}
            hint="temporarily paused"
          />
          <AdminStatTile
            label="One-time gifts"
            value={formatCount(overview.oneTimeGifts)}
            href="/admin/sponsorships?type=one_time"
            icon={Gift}
            hint="single-payment gifts"
          />
          <AdminStatTile
            label="Donors registered"
            value={formatCount(overview.donorsRegistered)}
            href="/admin/donors"
            icon={Users}
            hint="Donor + Org Donor accounts"
          />
          <AdminStatTile
            label="Donors active"
            value={formatCount(overview.donorsActive)}
            href="/admin/donors"
            icon={UserCheck}
            hint="≥1 active or paused sponsorship"
          />
          <AdminStatTile
            label="New donors"
            value={formatCount(overview.newDonorsThisMonth)}
            href="/admin/donors"
            icon={UserPlus}
            hint="signed up this month"
          />
          <AdminStatTile
            label="New sponsorships"
            value={formatCount(overview.newSponsorshipsThisMonth)}
            href="/admin/sponsorships"
            icon={Sparkles}
            hint="started this month"
          />
        </div>
      </DashboardSection>

      {/* ─── Quick actions ────────────────────────────────────────── */}
      <DashboardSection eyebrow="Jump straight in" title="Quick actions">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-tangerine hover:bg-tangerine-mist/30"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tangerine-mist/60 text-tangerine-deep group-hover:bg-tangerine group-hover:text-ink transition-colors">
                <Icon className="h-[18px] w-[18px] stroke-[1.75]" aria-hidden="true" />
              </span>
              <span className="font-medium text-[14px] text-ink leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </DashboardSection>

      {/* ─── Pending work ─────────────────────────────────────────── */}
      <DashboardSection
        eyebrow="What's waiting"
        title="Pending work"
        viewAllHref="/admin/reviews"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <AdminStatTile
            label="Proposals"
            value={formatCount(base.pendingProposalCount)}
            href="/admin/proposals?filter=pending"
            icon={ClipboardCheck}
            hint="profile changes from DI"
          />
          <AdminStatTile
            label="Reports"
            value={formatCount(base.pendingReportCount)}
            href="/admin/reviews/reports"
            icon={FileBarChart}
            hint="donor-facing updates"
          />
          <AdminStatTile
            label="Moments"
            value={formatCount(base.pendingMomentCount)}
            href="/admin/reviews/moments"
            icon={Camera}
            hint="timeline posts"
          />
          <AdminStatTile
            label="Intake photos"
            value={formatCount(base.pendingIntakePhotoCount)}
            href="/admin/reviews/intake-photos"
            icon={ImagePlus}
            hint="initial-visit evidence"
          />
          <AdminStatTile
            label="Documents"
            value={formatCount(base.pendingDocumentCount)}
            href="/admin/reviews/documents"
            icon={FileText}
            hint="legal/identity evidence"
          />
          <AdminStatTile
            label="Open tasks"
            value={formatCount(data.openTasks)}
            href="/admin/tasks?di_status=open"
            icon={ListChecks}
            hint="field work in progress"
          />
          <AdminStatTile
            label="Tasks to verify"
            value={formatCount(data.tasksAwaitingVerification)}
            href={TASKS_TO_VERIFY_HREF}
            icon={ClipboardCheck}
            hint="DI marked complete"
          />
        </div>
      </DashboardSection>

      {/* ─── Operational snapshot ─────────────────────────────────── */}
      <DashboardSection
        eyebrow="State of the platform"
        title="Operational snapshot"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <AdminStatTile
            label="Active sponsorships"
            value={formatCount(data.activeSponsorships)}
            href="/admin/sponsorships?filter=active"
            icon={HeartHandshake}
            hint="currently funding a child"
          />
          <AdminStatTile
            label="Active children"
            value={formatCount(data.activeChildren)}
            href="/admin/children"
            icon={Users}
            hint="in the program now"
          />
          <AdminStatTile
            label="Audit log"
            value="Open"
            href="/admin/audit"
            icon={CreditCard}
            hint="forensic history"
          />
        </div>
      </DashboardSection>

      {/* ─── Attention items (only when present) ──────────────────── */}
      {exceptionsTotal > 0 ? (
        <DashboardSection
          eyebrow="Fulfillment exceptions"
          title="Needs your attention"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {(data.fulfillmentOnHold ?? 0) > 0 ? (
              <AttentionCard
                label="On hold"
                count={data.fulfillmentOnHold ?? 0}
                description="Fulfillment paused — non-payment reasons"
                href="/admin/sponsorships"
                icon={PauseCircle}
                tone="amber"
              />
            ) : null}
            {(data.fulfillmentDisputed ?? 0) > 0 ? (
              <AttentionCard
                label="Under review"
                count={data.fulfillmentDisputed ?? 0}
                description="Donor flagged a concern"
                href="/admin/sponsorships"
                icon={ShieldAlert}
                tone="amber"
              />
            ) : null}
            {(data.fulfillmentRefundRequested ?? 0) > 0 ? (
              <AttentionCard
                label="Refund requested"
                count={data.fulfillmentRefundRequested ?? 0}
                description="Donor asked, not yet processed"
                href="/admin/sponsorships"
                icon={AlertTriangle}
                tone="stone"
              />
            ) : null}
            {(data.fulfillmentRefunded ?? 0) > 0 ? (
              <AttentionCard
                label="Refunded"
                count={data.fulfillmentRefunded ?? 0}
                description="Stripe refund completed"
                href="/admin/sponsorships"
                icon={CreditCard}
                tone="stone"
              />
            ) : null}
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}
