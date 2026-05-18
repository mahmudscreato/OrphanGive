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
// Session 66 — active-children count for the sidebar/bottom-nav badge.
import { countActiveChildrenForBadge } from "@/lib/admin-children";
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

  // Session 66 — single fetch threaded to both navs so the desktop
  // sidebar pill and the mobile bottom-nav corner badge can't drift.
  // countActiveChildrenForBadge swallows failure and returns 0 — the
  // nav code hides the badge when the number is 0 so a fetch error
  // is indistinguishable from "no active children", which is fine
  // for a non-critical decoration.
  const activeChildren = await countActiveChildrenForBadge();
  const badges = { children: activeChildren };

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
