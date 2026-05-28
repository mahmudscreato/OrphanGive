// Admin Lot 1 — admin home dashboard.
//
// A four-section landing surface for daily operations:
//   1. Pending work        — what's queued, click-through to triage
//   2. Operational snapshot — active/live counts at a glance
//   3. Attention items     — fulfillment exceptions (only when present)
//   4. Recent activity     — last N audit events with human labels
//
// Read-only. Every count comes from existing counter helpers or a
// single safeCount call in admin-dashboard.ts. No writes, no schema,
// no business-logic touch.
//
// Privacy: Tier-1 labels only. Recent-activity feed renders via the
// centralised audit-labels helpers — never dereferences audit
// metadata directly.

import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  FileText,
  HeartHandshake,
  ImagePlus,
  ListChecks,
  PauseCircle,
  ShieldAlert,
  Truck,
  UserCircle,
  Users,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { AttentionCard } from "@/components/admin/AttentionCard";
import { DashboardSection } from "@/components/admin/DashboardSection";
import { RecentActivityFeed } from "@/components/admin/RecentActivityFeed";

export const dynamic = "force-dynamic";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export default async function AdminHomePage() {
  const session = await requireAdminUser();
  const greeting =
    session?.firstName && session.firstName.trim().length > 0
      ? `Good day, ${session.firstName.trim()}.`
      : "Good day.";

  const data = await getAdminDashboardData();
  const { base } = data;

  // Aggregate moments + intake photos as a single "Moments & photos"
  // tile because admin treats them as one batch when triaging.
  const momentsCombined =
    base.pendingMomentCount === null && base.pendingIntakePhotoCount === null
      ? null
      : (base.pendingMomentCount ?? 0) + (base.pendingIntakePhotoCount ?? 0);

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
        subtitle="Today's queues, operational state, and what changed recently."
        flourish="Approve thoughtfully, reject with kindness."
      />

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
            label="Moments & photos"
            value={formatCount(momentsCombined)}
            href="/admin/reviews/moments"
            icon={Camera}
            tooltip={`${formatCount(base.pendingMomentCount)} timeline · ${formatCount(base.pendingIntakePhotoCount)} intake`}
            hint="timeline + intake"
          />
          <AdminStatTile
            label="Documents"
            value={formatCount(base.pendingDocumentCount)}
            href="/admin/reviews/documents"
            icon={FileText}
            hint="legal/identity evidence"
          />
          <AdminStatTile
            label="Deliveries"
            value={formatCount(base.pendingDeliveryCount)}
            href="/admin/reviews"
            icon={Truck}
            hint="aid drops awaiting review"
          />
          <AdminStatTile
            label="Intake photos"
            value={formatCount(base.pendingIntakePhotoCount)}
            href="/admin/reviews/intake-photos"
            icon={ImagePlus}
            hint="initial-visit evidence"
          />
          <AdminStatTile
            label="Open tasks"
            value={formatCount(data.openTasks)}
            href="/admin/tasks"
            icon={ListChecks}
            hint="field work in progress"
          />
          <AdminStatTile
            label="Tasks to verify"
            value={formatCount(data.tasksAwaitingVerification)}
            href="/admin/tasks"
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
            label="Donors awaiting approval"
            value={formatCount(data.pendingDonorApprovals)}
            href="/admin/donors?filter=pending"
            icon={UserCircle}
            hint="signup queue"
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

      {/* ─── Recent activity ──────────────────────────────────────── */}
      <DashboardSection
        eyebrow="What's been happening"
        title="Recent activity"
        viewAllHref="/admin/audit"
        viewAllLabel="Open audit log"
      >
        <RecentActivityFeed events={data.recentActivity} />
      </DashboardSection>
    </div>
  );
}
