// Session 51 — Admin Dashboard authed layout.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin-auth";

// Lot 4 Job B — defence-in-depth on top of robots.txt. Every admin
// surface is auth-gated, but an explicit per-layout noindex prevents
// any accidental crawler reach if a route ever leaks publicly.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { getAdminHomeStats } from "@/lib/admin-home-stats";
// Donor admin-approval was removed (getDonorState maps active→approved), so
// the old "pending donor approvals" nav badge is defunct and was dropped —
// there is nothing to approve. See admin-donors for the still-valid
// moderation actions (reject/suspend).
// Session 66 — active-children count for the Children nav badge.
import { countActiveChildrenForBadge } from "@/lib/admin-children";
// P4 — `new`-status partnership inquiries badge.
import { countNewPartnershipInquiries } from "@/lib/partnership-inquiries";
// Tasks nav badge — count of DI-completed tasks awaiting admin verification.
import { countTasksAwaitingVerification } from "@/lib/admin-dashboard";
import { AdminBottomNav } from "@/components/admin/AdminBottomNav";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

export default async function AdminAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminUser();
  if (!session) {
    redirect("/admin/login");
  }

  // Sessions 60 + 65 + 66 — pending counts for the nav badges,
  // fetched in parallel.
  // P4 — partnerships `new` count added to the parallel set.
  const [stats, activeChildren, partnershipsNew, tasksToVerify] =
    await Promise.all([
      getAdminHomeStats(),
      countActiveChildrenForBadge(),
      countNewPartnershipInquiries(),
      countTasksAwaitingVerification(),
    ]);
  // Spine 1.2 — Reviews badge must include the reports queue.
  // pendingReportCount uses the SAME helper (countPendingReports) the
  // /admin/reviews index tile uses, so badge total and index tile
  // sum agree by construction. fix/admin-quick-batch — pendingRevealCount
  // added the same way so a new donor information-access request bumps
  // the "Review (N)" badge (the hub index already counts reveals).
  const reviewsCount =
    (stats.pendingMomentCount ?? 0) +
    (stats.pendingIntakePhotoCount ?? 0) +
    (stats.pendingDocumentCount ?? 0) +
    (stats.pendingReportCount ?? 0) +
    (stats.pendingRevealCount ?? 0);
  const badges = {
    proposals: stats.pendingProposalCount,
    reviews:
      stats.pendingMomentCount === null &&
      stats.pendingIntakePhotoCount === null &&
      stats.pendingDocumentCount === null &&
      stats.pendingReportCount === null &&
      stats.pendingRevealCount === null
        ? null
        : reviewsCount,
    tasks: tasksToVerify,
    children: activeChildren,
    partnerships: partnershipsNew,
  };

  return (
    <div className="bg-cream min-h-screen text-ink">
      {/* Mobile-only header */}
      <AdminHeader />
      {/* Desktop-only sidebar (240px wide, fixed left) */}
      <AdminSidebar badges={badges} />
      <main className="md:pl-[240px] pb-24 md:pb-12 min-h-screen">
        {/* Desktop-only top bar with admin identity pill */}
        <AdminTopBar session={session} />
        {children}
      </main>
      {/* Mobile-only bottom nav */}
      <AdminBottomNav badges={badges} />
    </div>
  );
}
