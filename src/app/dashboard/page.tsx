import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
  type Donor,
} from "@/lib/donor-data";
import { getRandomActiveChildren } from "@/lib/children-data";
import { getAllDonorReveals } from "@/lib/reveal-data";
import { getDonorSponsorships } from "@/lib/sponsorship-data";
import { DonorWelcome } from "./components/DonorWelcome";
import { AwaitingApprovalBanner } from "./components/AwaitingApprovalBanner";
import { RecommendedChildren } from "./components/RecommendedChildren";
import { EmptyDonorState } from "./components/EmptyDonorState";
import { AccountSummary } from "./components/AccountSummary";
import { RevealRequestsSection } from "./components/RevealRequestsSection";
import {
  SponsorshipsSection,
  isDisplaySponsorship,
} from "./components/SponsorshipsSection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — OrphanGive",
};

export default async function DashboardPage() {
  // 1. Pull donor and compute state. The proxy already gates unauth /
  //    suspended / draft / rejected, but we re-check here in defense in
  //    depth: if the proxy bypassed the call (e.g. token expired between
  //    proxy and page), we redirect identically here.
  const donor = await getCurrentDonor();
  const state = getDonorState(donor);

  switch (state) {
    case "unauthenticated":
      redirect("/signin?next=/dashboard");
    case "pending_verification":
      redirect(
        `/signup/verify?email=${encodeURIComponent(donor?.email ?? "")}`,
      );
    case "suspended":
      redirect("/signin?error=suspended");
    case "rejected":
      redirect("/dashboard/rejected");
    case "pending_approval":
      return <PendingApprovalDashboard donor={donor!} />;
    case "approved":
      return <ApprovedDashboard donor={donor!} />;
  }
}

function PendingApprovalDashboard({ donor }: { donor: Donor }) {
  return (
    <main className="bg-cream">
      <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[1100px] mx-auto space-y-10">
          <DonorWelcome donor={donor} approved={false} />
          <AwaitingApprovalBanner />
          <AccountSummary donor={donor} />
        </div>
      </section>
    </main>
  );
}

async function ApprovedDashboard({ donor }: { donor: Donor }) {
  // Parallel fetch: recommended children, reveal requests, sponsorships.
  const [recommended, revealRequests, sponsorships] = await Promise.all([
    getRandomActiveChildren("", 4),
    getAllDonorReveals(donor.id),
    getDonorSponsorships(donor.id, { limit: 50 }),
  ]);

  const hasDisplayable = sponsorships.some(isDisplaySponsorship);

  return (
    <main className="bg-cream">
      <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[1100px] mx-auto space-y-12">
          <DonorWelcome donor={donor} approved={true} />
          {hasDisplayable ? (
            <SponsorshipsSection items={sponsorships} />
          ) : (
            <EmptyDonorState />
          )}
          <RevealRequestsSection requests={revealRequests} />
          <RecommendedChildren items={recommended} />
          <AccountSummary donor={donor} />
        </div>
      </section>
    </main>
  );
}
