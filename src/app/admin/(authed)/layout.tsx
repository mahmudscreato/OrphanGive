// Session 51 — Admin Dashboard authed layout.
//
// Wraps everything under /admin/(authed)/. The route group `(authed)`
// doesn't appear in the URL, so this layout applies to /admin (the
// page below it) and any future /admin/<sub> pages added under this
// route group. /admin/login lives OUTSIDE this group at
// src/app/admin/login/page.tsx — that page does NOT see this
// layout's auth check.
//
// Auth: requireAdminUser() returns null when there's no admin
// session (it doesn't redirect — admin-auth.ts kept that semantic
// for the API routes that pre-date the UI). We check + redirect
// here in the layout, mirroring the DI layout's behavior.

import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminHomeStats } from "@/lib/admin-home-stats";
// Session 65 — donor pending count for the Donors nav badge.
import { countPendingDonorApprovals } from "@/lib/admin-donors";
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

  // Session 60 — pending counts for the nav badges. Same source
  // of truth as the admin home stat tiles (getAdminHomeStats),
  // so the sidebar badge and the home counter can't drift.
  // Reviews badge = combined pending for the three review queues
  // (moments + intake-photos + documents) that hang off
  // /admin/reviews. Null values (fetch error) cause the badge to
  // hide gracefully.
  //
  // Session 65 — added the donor pending-approval count fetched in
  // parallel with the home stats (Promise.all). Same null-on-error
  // convention. countPendingDonorApprovals returns 0 on failure (not
  // null) because the helper swallows internally — we can't
  // distinguish "0 pending" from "fetch failed" here. That's
  // acceptable for the badge: 0 hides it anyway.
  const [stats, donorPending] = await Promise.all([
    getAdminHomeStats(),
    countPendingDonorApprovals(),
  ]);
  const reviewsCount =
    (stats.pendingMomentCount ?? 0) +
    (stats.pendingIntakePhotoCount ?? 0) +
    (stats.pendingDocumentCount ?? 0);
  const badges = {
    proposals: stats.pendingProposalCount,
    reviews:
      stats.pendingMomentCount === null &&
      stats.pendingIntakePhotoCount === null &&
      stats.pendingDocumentCount === null
        ? null
        : reviewsCount,
    donors: donorPending,
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
