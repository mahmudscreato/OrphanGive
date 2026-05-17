// Session 43 — DI Dashboard Child Detail page.
//
// Server component. Fetches the child (with scope guard) and the
// redacted sponsorship list, pre-renders all six tab panels server-
// side, and hands them to the client tab shell. Switching tabs is
// then a pure client UI toggle — no per-tab fetch.
//
// notFound() collapses both "doesn't exist" and "out of scope" into
// a single 404 — we never reveal which child IDs the DI is or isn't
// allowed to see.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Camera,
  ChevronLeft,
  FileBarChart,
  History,
  Truck,
} from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById, getDiChildSponsorships } from "@/lib/di-children";
import { ChildDetailHeader } from "@/components/di/ChildDetailHeader";
import { ChildDetailTabs } from "@/components/di/ChildDetailTabs";
import { ProfilePanel } from "@/components/di/ProfilePanel";
import { SponsorshipPanel } from "@/components/di/SponsorshipPanel";
import { ComingSoonPanel } from "@/components/di/ComingSoonPanel";

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

  // Sponsorships: getDiChildSponsorships also enforces scope, but we
  // already know the child is in scope (otherwise we 404'd above), so
  // the guard there is belt-and-braces. A null return here would be
  // a race condition — treat as empty list rather than rethrowing.
  const sponsorships = (await getDiChildSponsorships(id, session.userId)) ?? [];

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
        momentsContent={
          <ComingSoonPanel
            title="Moments"
            description="Photos and short videos from visits with this child."
            icon={Camera}
          />
        }
        reportsContent={
          <ComingSoonPanel
            title="Reports"
            description="Monthly progress notes you'll submit for this child."
            icon={FileBarChart}
          />
        }
        deliveriesContent={
          <ComingSoonPanel
            title="Deliveries"
            description="Aid handed to the family — school supplies, food, clothing, healthcare."
            icon={Truck}
          />
        }
        historyContent={
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
