import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
  type Donor,
} from "@/lib/donor-data";
import {
  getAwaitingChildrenCount,
  getRandomActiveChildren,
} from "@/lib/children-data";
import {
  getDonorSponsorships,
  sortSponsorshipsByPriority,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import {
  calculateDonorImpact,
  getRecentMomentsForDonor,
} from "@/lib/dashboard-data";
import { ImpactHero } from "./components/ImpactHero";
import { AwaitingApprovalBanner } from "./components/AwaitingApprovalBanner";
import { RecommendedChildren } from "./components/RecommendedChildren";
import { AccountSummary } from "./components/AccountSummary";
import { RecentUpdatesPreview } from "./components/RecentUpdatesPreview";
import { VertSponsorshipCard } from "./components/VertSponsorshipCard";
import { isDisplaySponsorship } from "./components/sponsorshipCardHelpers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — OrphanGive",
};

export default async function DashboardPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard");
  const state = getDonorState(donor);

  if (state === "pending_approval") {
    return <PendingApprovalDashboard donor={donor} />;
  }
  if (state === "approved") {
    return <ApprovedDashboard donor={donor} />;
  }
  // The layout already redirected non-approved/non-pending states; this
  // is a defensive fallback that should be unreachable in normal flow.
  redirect("/signin");
}

function PendingApprovalDashboard({ donor }: { donor: Donor }) {
  const firstName =
    donor.first_name?.trim() || donor.email.split("@")[0] || "friend";
  return (
    <div className="space-y-10">
      <h1 className="font-display text-[28px] text-ink leading-tight tracking-[-0.02em] m-0">
        Hello, {firstName}.
      </h1>
      <AwaitingApprovalBanner />
      <AccountSummary donor={donor} />
    </div>
  );
}

async function ApprovedDashboard({ donor }: { donor: Donor }) {
  const [
    impact,
    sponsorships,
    moments,
    recommendedNormal,
    recommendedExpanded,
    awaitingTotal,
  ] = await Promise.all([
    calculateDonorImpact(donor.id),
    getDonorSponsorships(donor.id, { limit: 50 }),
    getRecentMomentsForDonor(donor.id, 4),
    getRandomActiveChildren("", 3),
    getRandomActiveChildren("", 6),
    getAwaitingChildrenCount(),
  ]);

  const activeChildBubbles = uniqueActiveChildren(sponsorships);
  // Active sponsorships sorted with the Part-C priority (prepaid first,
  // then recurring, then one-time; newest within each tier).
  const activeSponsorships = sortSponsorshipsByPriority(
    sponsorships.filter((s) => s.status === "active"),
  );
  const previewSponsorships = activeSponsorships.slice(0, 3);
  const hasDisplayable = sponsorships.some(isDisplaySponsorship);
  const isFirstTime = !hasDisplayable;

  return (
    <div className="space-y-16 max-md:space-y-12">
      <ImpactHero
        donor={donor}
        impact={impact}
        activeChildren={activeChildBubbles}
      />

      {previewSponsorships.length > 0 ? (
        <ChildrenPreview
          previewSponsorships={previewSponsorships}
          totalActive={activeSponsorships.length}
        />
      ) : null}

      {impact.hasAnyActive ? (
        <RecentUpdatesPreview
          moments={moments}
          primaryChildName={impact.primaryActiveChildName}
        />
      ) : null}

      <RecommendedChildren
        items={isFirstTime ? recommendedExpanded : recommendedNormal}
        expanded={isFirstTime}
        totalAwaiting={awaitingTotal}
      />
    </div>
  );
}

function ChildrenPreview({
  previewSponsorships,
  totalActive,
}: {
  previewSponsorships: Sponsorship[];
  totalActive: number;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
            Children you support
          </h2>
          {totalActive > 1 ? (
            <p className="mt-2 text-[14px] text-slate italic">
              {totalActive} active sponsorships
            </p>
          ) : null}
        </div>
        <Link
          href="/dashboard/sponsorships"
          className="text-[13px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
        >
          {totalActive > previewSponsorships.length
            ? `See all (${totalActive}) →`
            : "Manage →"}
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
        {previewSponsorships.map((s) => (
          <VertSponsorshipCard key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

type ChildBubble = { id: string; name: string; photoId: string | null };

function uniqueActiveChildren(sponsorships: Sponsorship[]): ChildBubble[] {
  const map = new Map<string, ChildBubble>();
  for (const s of sponsorships) {
    if (s.status !== "active") continue;
    if (!s.child || typeof s.child === "string") continue;
    if (map.has(s.child.id)) continue;
    map.set(s.child.id, {
      id: s.child.id,
      name: s.child.display_name?.trim() || "Child",
      photoId: s.child.Photo ?? null,
    });
  }
  return Array.from(map.values());
}
