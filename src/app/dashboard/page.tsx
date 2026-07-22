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
  isQueuedSponsorship,
  sortSponsorshipsByPriority,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import {
  getRecentMomentsForDonor,
  getRecentReportsForDonor,
} from "@/lib/dashboard-data";
import { Button } from "@/components/ui/Button";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { AwaitingApprovalBanner } from "./components/AwaitingApprovalBanner";
import { RecommendedChildren } from "./components/RecommendedChildren";
import { AccountSummary } from "./components/AccountSummary";
import { RecentUpdatesPreview } from "./components/RecentUpdatesPreview";
import { SponsoredChildCard } from "./components/SponsoredChildCard";
import { childOf } from "./components/sponsorshipCardHelpers";

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

// feat/donor-dashboard-home — the RETURNING-DONOR home.
//
// Order is deliberate: greeting → the children they support → what's new
// from those children → discovery last. No impact numbers, stats, or
// progress bars anywhere: this is a relationship, not a scoreboard.
//
// Both states are handled: a donor with children gets the returning-home;
// a donor with none gets a gentle first-visit greeting that leads into
// discovery (the same RecommendedChildren section, expanded).
async function ApprovedDashboard({ donor }: { donor: Donor }) {
  const [
    sponsorships,
    moments,
    reports,
    recommendedNormal,
    recommendedExpanded,
    awaitingTotal,
  ] = await Promise.all([
    getDonorSponsorships(donor.id, { limit: 50 }),
    getRecentMomentsForDonor(donor.id, 6),
    getRecentReportsForDonor(donor.id, 6),
    getRandomActiveChildren("", 3),
    getRandomActiveChildren("", 6),
    getAwaitingChildrenCount(),
  ]);

  const supported = supportedChildren(sponsorships);
  const isFirstTime = supported.length === 0;
  const firstName =
    donor.first_name?.trim() || donor.email.split("@")[0] || "friend";
  const primaryChildName = supported[0] ? childOf(supported[0].s).name : null;

  return (
    <div className="space-y-16 max-md:space-y-12">
      <Greeting firstName={firstName} isFirstTime={isFirstTime} />

      {!isFirstTime ? (
        <>
          <SupportedChildren supported={supported} />
          <RecentUpdatesPreview
            moments={moments}
            reports={reports}
            primaryChildName={primaryChildName}
          />
        </>
      ) : null}

      <RecommendedChildren
        items={isFirstTime ? recommendedExpanded : recommendedNormal}
        expanded={isFirstTime}
        totalAwaiting={awaitingTotal}
      />
    </div>
  );
}

// ─── Greeting ───────────────────────────────────────────────────────────────

// fix/donor-small-batch — rotating welcome sub-lines. The page is a
// force-dynamic SERVER component, so Math.random here runs per REQUEST:
// each refresh/visit picks a fresh line. Name + structure (eyebrow +
// "Hello…, {firstName}." heading) are unchanged; only the sub-line
// rotates. Tone: dignified, about the children and the quiet meaning
// of sponsorship — not saccharine.
const RETURNING_SUBLINES = [
  "Here’s how the children you support are doing.",
  "Somewhere in Bangladesh, a child’s day is steadier because of you.",
  "Quiet support, real childhoods — here’s the latest from yours.",
  "You showed up again. That’s what changes a childhood.",
  "The children you support are growing — come see.",
  "Small updates, big lives. Here’s what’s new.",
] as const;

const FIRST_TIME_SUBLINES = [
  "When you’re ready, meet the children waiting for a sponsor. There’s no rush — take your time finding the right one.",
  "Every sponsorship here starts with one quiet decision. Meet the children when you’re ready.",
  "A steady hand changes a childhood. The children below are waiting for theirs.",
  "There’s a child here whose story will stay with you. Take your time.",
  "No rush, no pressure — just children hoping someone shows up. Have a look when you’re ready.",
] as const;

function pickLine(lines: readonly string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
}

function Greeting({
  firstName,
  isFirstTime,
}: {
  firstName: string;
  isFirstTime: boolean;
}) {
  if (isFirstTime) {
    // No sponsored children yet — a gentle first visit that leads into
    // the discovery section below.
    return (
      <header>
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Welcome
        </div>
        <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Hello, {firstName}.
        </h1>
        <p className="mt-3 text-[15px] text-slate leading-[1.65] max-w-[560px]">
          {pickLine(FIRST_TIME_SUBLINES)}
        </p>
        <div className="mt-5">
          <Button href="/children" variant="primary">
            Meet the children
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header>
      <div className="inline-flex items-center text-script-md text-tangerine-deep">
        <EyebrowIcon />
        Welcome back
      </div>
      <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
        Hello again, {firstName}.
      </h1>
      <p className="mt-3 text-[15px] text-slate leading-[1.65] max-w-[560px] italic">
        {pickLine(RETURNING_SUBLINES)}
      </p>
    </header>
  );
}

// ─── The children you support ───────────────────────────────────────────────

function SupportedChildren({ supported }: { supported: Supported[] }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
          {supported.length === 1
            ? "The child you support"
            : "The children you support"}
        </h2>
        <Link
          href="/dashboard/sponsorships"
          className="text-[13px] text-tangerine-deeper hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
        >
          Manage →
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-md:grid-cols-1">
        {supported.map((x) => (
          <SponsoredChildCard key={x.s.id} s={x.s} startedAt={x.startedAt} />
        ))}
      </ul>
    </section>
  );
}

// ─── Selection ──────────────────────────────────────────────────────────────

type Supported = {
  /** The sponsorship the card links to (priority-ordered pick). */
  s: Sponsorship;
  /** Earliest start across this child's sponsorships. */
  startedAt: string | null;
};

function startsEarlier(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() < new Date(b).getTime();
}

/**
 * The donor's currently-supported children: ACTIVE or PAUSED sponsorships
 * (a paused relationship is still theirs), excluding queued rows (a future
 * slot isn't support yet) and campaign/child-less rows.
 *
 * Deduped BY CHILD — a donor may hold more than one sponsorship for the
 * same child; the home is about children, not contracts. We keep the
 * priority-ordered sponsorship for the link, but carry the EARLIEST start
 * so "you've supported X for N months" reflects the whole relationship.
 */
function supportedChildren(sponsorships: Sponsorship[]): Supported[] {
  const ordered = sortSponsorshipsByPriority(
    sponsorships.filter(
      (s) =>
        (s.status === "active" || s.status === "paused") &&
        !isQueuedSponsorship(s) &&
        !!s.child &&
        typeof s.child !== "string",
    ),
  );
  const byChild = new Map<string, Supported>();
  for (const s of ordered) {
    if (!s.child || typeof s.child === "string") continue;
    const id = s.child.id;
    const existing = byChild.get(id);
    if (!existing) {
      byChild.set(id, { s, startedAt: s.started_at });
      continue;
    }
    if (startsEarlier(s.started_at, existing.startedAt)) {
      existing.startedAt = s.started_at;
    }
  }
  return Array.from(byChild.values());
}
