// Session 51 — Admin Dashboard home / overview screen.
//
// Server component. The (authed) layout has already validated the
// session and redirected to /admin/login if missing, so we can
// safely call requireAdminUser() here without re-handling null.
//
// V1 surface per the brief: 4 stat tiles, no Quick Actions section
// (admins approve, they don't create). Each tile click routes to
// the matching review queue. Only Proposals has a real list page in
// Session 51; the other three currently land on the /admin/reviews
// placeholder where Session 52 will fill in the queues.

import { ClipboardCheck, Camera, FileText, Truck } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminHomeStats } from "@/lib/admin-home-stats";
import { AdminStatTile } from "@/components/admin/AdminStatTile";

export const dynamic = "force-dynamic";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export default async function AdminHomePage() {
  // Layout has already enforced auth + redirect; this is just for
  // the greeting copy.
  const session = await requireAdminUser();
  const greeting =
    session?.firstName && session.firstName.trim().length > 0
      ? `Good day, ${session.firstName.trim()}.`
      : "Good day.";

  const stats = await getAdminHomeStats();

  // Combine moments + intake photos for the "Pending moments" tile.
  // The tooltip shows the breakdown so admin doesn't lose visibility.
  const momentsCombined =
    stats.pendingMomentCount === null && stats.pendingIntakePhotoCount === null
      ? null
      : (stats.pendingMomentCount ?? 0) + (stats.pendingIntakePhotoCount ?? 0);
  const momentsTooltip = `${formatCount(stats.pendingMomentCount)} timeline moment${(stats.pendingMomentCount ?? 0) === 1 ? "" : "s"} · ${formatCount(stats.pendingIntakePhotoCount)} intake photo${(stats.pendingIntakePhotoCount ?? 0) === 1 ? "" : "s"}`;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Greeting block */}
      <header className="mb-8 md:mb-10">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          {greeting}
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Review queues across the platform — what&apos;s waiting on you.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Approve thoughtfully, reject with kindness.
        </p>
      </header>

      <section className="mb-12 md:mb-16">
        <h2 className="sr-only">At a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <AdminStatTile
            label="Pending proposals"
            value={formatCount(stats.pendingProposalCount)}
            href="/admin/proposals?filter=pending"
            icon={ClipboardCheck}
            hint="profile changes from DI team"
          />
          <AdminStatTile
            label="Pending moments"
            value={formatCount(momentsCombined)}
            href="/admin/reviews"
            icon={Camera}
            tooltip={momentsTooltip}
            hint="timeline + intake photos"
          />
          <AdminStatTile
            label="Pending deliveries"
            value={formatCount(stats.pendingDeliveryCount)}
            href="/admin/reviews"
            icon={Truck}
            hint="aid drops awaiting review"
          />
          <AdminStatTile
            label="Pending documents"
            value={formatCount(stats.pendingDocumentCount)}
            href="/admin/reviews"
            icon={FileText}
            hint="legal/identity evidence"
          />
        </div>
      </section>

      {/* No Quick Actions on admin home (Session 51 brief).
          Subsequent sessions add review queue panels here when
          there's actual content to surface. */}
    </div>
  );
}
