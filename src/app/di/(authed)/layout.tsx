// Session 42 — DI Dashboard authed layout.
//
// Wraps everything under /di/(authed)/. The route group `(authed)`
// doesn't appear in the URL, so this layout applies to /di (the
// page below this layout's directory) and any future /di/<sub>
// pages added under this route group. /di/login lives OUTSIDE this
// group at src/app/di/login/page.tsx — that page does NOT see this
// layout's auth check.
//
// Auth: requireDiUser() either returns the session or redirects to
// /di/login. Server-side check happens at request time; cookies are
// read from the incoming request.

import { requireDiUser } from "@/lib/di-auth";
import { DiBottomNav } from "@/components/di/DiBottomNav";
import { DiHeader } from "@/components/di/DiHeader";
import { DiSidebar } from "@/components/di/DiSidebar";

export default async function DiAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /di/login if not authenticated as a Data Inputter.
  await requireDiUser();

  return (
    <div className="bg-cream min-h-screen text-ink">
      {/* Mobile-only header */}
      <DiHeader />
      {/* Desktop-only sidebar (240px wide, fixed left). On desktop
          we offset main by 240px to avoid the sidebar's column. */}
      <DiSidebar />
      {/* Main content area. pb-24 on mobile leaves room for the fixed
          bottom nav (56px min per tab + iOS Home-Indicator safe-area
          ~34px on PWA install — pb-20 was tight there). Session 46 polish. */}
      <main className="md:pl-[240px] pb-24 md:pb-12 min-h-screen">
        {children}
      </main>
      {/* Mobile-only bottom nav */}
      <DiBottomNav />
    </div>
  );
}
