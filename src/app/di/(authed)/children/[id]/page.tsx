// Session 43 — DI Dashboard Child Detail page.
// Session 45 — Moments / Reports / Deliveries tabs wired to real data
// (replaced the three ComingSoonPanel placeholders).
//
// Server component. Fetches the child (with scope guard), the
// redacted sponsorship list, and the three additive content lists
// in parallel. Pre-renders all six tab panels server-side; the
// client tab shell just toggles which is visible.
//
// notFound() collapses both "doesn't exist" and "out of scope" into
// a single 404 — we never reveal which child IDs the DI is or isn't
// allowed to see.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, History } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById, getDiChildSponsorships } from "@/lib/di-children";
import { listMomentsForChild } from "@/lib/di-moments";
import { listReportsForChild } from "@/lib/di-reports";
import { listDeliveriesForChild } from "@/lib/di-deliveries";
import { ChildDetailHeader } from "@/components/di/ChildDetailHeader";
import { ChildDetailTabs } from "@/components/di/ChildDetailTabs";
import { ProfilePanel } from "@/components/di/ProfilePanel";
import { SponsorshipPanel } from "@/components/di/SponsorshipPanel";
import { ComingSoonPanel } from "@/components/di/ComingSoonPanel";
import { MomentsPanel } from "@/components/di/MomentsPanel";
import { ReportsPanel } from "@/components/di/ReportsPanel";
import { DeliveriesPanel } from "@/components/di/DeliveriesPanel";

export const dynamic = "force-dynamic";

export default async function DiChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;

  const child = await getDiChildById(id, session.userId);
  if (!child) notFound();

  // Five parallel reads. Each scope-guards independently (belt-and-
  // braces — the parent already 404'd if out of scope, so any null
  // returns here would be a race condition). All read functions
  // return [] (or empty list) on miss, never throw, so partial
  // failures degrade gracefully (e.g. moments unreachable doesn't
  // break the Profile tab).
  const [sponsorships, moments, reports, deliveries] = await Promise.all([
    getDiChildSponsorships(id, session.userId).then((s) => s ?? []),
    listMomentsForChild(session.userId, id),
    listReportsForChild(session.userId, id),
    listDeliveriesForChild(session.userId, id),
  ]);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/di/children"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All children
      </Link>

      {/* Identity header */}
      <ChildDetailHeader child={child} />

      {/* Tabs */}
      <ChildDetailTabs
        profileContent={<ProfilePanel child={child} />}
        sponsorshipContent={<SponsorshipPanel sponsorships={sponsorships} />}
        momentsContent={<MomentsPanel moments={moments} childId={id} />}
        reportsContent={<ReportsPanel reports={reports} childId={id} />}
        deliveriesContent={
          <DeliveriesPanel deliveries={deliveries} childId={id} />
        }
        historyContent={
          // History is Session 46 — keep the placeholder.
          <ComingSoonPanel
            title="History"
            description="Audit trail of changes to this child's record."
            icon={History}
          />
        }
      />
    </div>
  );
}
