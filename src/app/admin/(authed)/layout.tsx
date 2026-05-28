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
// Session 65 — donor pending count for the Donors nav badge.
import { countPendingDonorApprovals } from "@/lib/admin-donors";
// Session 66 — active-children count for the Children nav badge.
import { countActiveChildrenForBadge } from "@/lib/admin-children";
// P4 — `new`-status partnership inquiries badge.
import { countNewPartnershipInquiries } from "@/lib/partnership-inquiries";
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
  const [stats, donorPending, activeChildren, partnershipsNew] = await Promise.all([
    getAdminHomeStats(),
    countPendingDonorApprovals(),
    countActiveChildrenForBadge(),
    countNewPartnershipInquiries(),
  ]);
  // Spine 1.2 — Reviews badge must include the reports queue.
  // pendingReportCount uses the SAME helper (countPendingReports) the
  // /admin/reviews index tile uses, so badge total and index tile
  // sum agree by construction.
  const reviewsCount =
    (stats.pendingMomentCount ?? 0) +
    (stats.pendingIntakePhotoCount ?? 0) +
    (stats.pendingDocumentCount ?? 0) +
    (stats.pendingReportCount ?? 0);
  const badges = {
    proposals: stats.pendingProposalCount,
    reviews:
      stats.pendingMomentCount === null &&
      stats.pendingIntakePhotoCount === null &&
      stats.pendingDocumentCount === null &&
      stats.pendingReportCount === null
        ? null
        : reviewsCount,
    donors: donorPending,
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
