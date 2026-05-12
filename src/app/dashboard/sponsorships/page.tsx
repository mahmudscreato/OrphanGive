import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import {
  getDonorSponsorships,
  isCancelledSponsorship,
  isOngoingSponsorship,
  isPastGiftOrSponsorship,
  isQueuedSponsorship,
  sortSponsorshipsByEnded,
  sortSponsorshipsByPriority,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { VertSponsorshipCard } from "../components/VertSponsorshipCard";
import { CollapsibleSection } from "./CollapsibleSection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Children you support — OrphanGive",
};

export default async function DashboardSponsorshipsPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/sponsorships");
  const state = getDonorState(donor);
  if (state !== "approved") redirect("/dashboard");

  const sponsorships = await getDonorSponsorships(donor.id, { limit: 200 });

  // Partition into the four buckets the page surfaces. The three
  // long-lived buckets are mutually exclusive (per the helpers in
  // sponsorship-data.ts); pending_payment is the transient bucket
  // surfaced separately above the main sections.
  //
  //   • Currently sponsoring         — active monthly + prepaid only.
  //                                     One-time gifts intentionally
  //                                     excluded — a one-time row is
  //                                     status='active' in the DB but
  //                                     not an ongoing relationship.
  //   • Past gifts and sponsorships  — one-time gifts + completed
  //                                     subscriptions, sorted by
  //                                     date_created DESC so a recent
  //                                     gift floats to the top.
  //   • Cancelled                    — collapsed by default behind a
  //                                     toggle; shown via
  //                                     CollapsibleSection.
  //   • Awaiting payment             — pending_payment rows, finish-
  //                                     or-cancel block at top.
  const ongoing = sortSponsorshipsByPriority(
    sponsorships.filter(isOngoingSponsorship),
  );
  // Session 14.7: queued sponsorships go in their own "Upcoming
  // sponsorships" section. queued rows are status='active' but
  // queue_position>0; isOngoingSponsorship excludes them, so they
  // can't double-render. Sort by queue_position ASC (1, 2, 3...) so
  // the donor sees their next-to-activate at the top.
  const upcoming = sortByQueuePositionAsc(
    sponsorships.filter(isQueuedSponsorship),
  );
  const past = sortByDateCreatedDesc(
    sponsorships.filter(isPastGiftOrSponsorship),
  );
  const cancelled = sortSponsorshipsByEnded(
    sponsorships.filter(isCancelledSponsorship),
  );
  const pending = sponsorships.filter((s) => s.status === "pending_payment");

  return (
    <div className="space-y-12">
      {pending.length > 0 ? (
        <section>
          <h2 className="font-display text-[22px] text-tangerine-deep leading-tight tracking-[-0.01em] m-0 flex items-center gap-3">
            Awaiting payment
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse"
            />
          </h2>
          <Group items={pending} />
        </section>
      ) : null}

      <section>
        <header>
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Children you support
          </div>
          <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
            Currently sponsoring
          </h1>
          {ongoing.length > 0 ? (
            <p className="mt-2 text-[15px] text-slate italic">
              {ongoing.length} active{" "}
              {ongoing.length === 1 ? "sponsorship" : "sponsorships"}
            </p>
          ) : null}
        </header>
        {ongoing.length > 0 ? (
          <Group items={ongoing} />
        ) : (
          <p className="mt-6 text-[14.5px] text-slate-soft leading-[1.6] max-w-[560px]">
            You aren&apos;t sponsoring anyone yet.{" "}
            <a
              href="/children"
              className="text-tangerine-deep underline-offset-4 hover:underline"
            >
              Browse children awaiting a sponsor →
            </a>
          </p>
        )}
      </section>

      {upcoming.length > 0 ? (
        <section>
          <header>
            <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
              Upcoming sponsorships
            </h2>
            <p className="mt-2 text-[14px] text-slate italic">
              {upcoming.length}{" "}
              {upcoming.length === 1 ? "queued sponsorship" : "queued sponsorships"}{" "}
              — paid up front, will activate when the current sponsor&rsquo;s
              term ends.
            </p>
          </header>
          <Group items={upcoming} />
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <header>
            <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
              Past gifts and sponsorships
            </h2>
            <p className="mt-2 text-[14px] text-slate italic">
              {past.length}{" "}
              {past.length === 1
                ? "gift or sponsorship"
                : "gifts and sponsorships"}
            </p>
          </header>
          <Group items={past} />
        </section>
      ) : null}

      <CollapsibleSection
        count={cancelled.length}
        showLabel="Show cancelled"
        hideLabel="Hide cancelled"
      >
        <Group items={cancelled} />
      </CollapsibleSection>
    </div>
  );
}

// Most-recent-first by created date. Used only for the "Past gifts and
// sponsorships" section, where the donor cares about chronology of
// what they've given/finished — not the priority shape used for the
// "Currently sponsoring" tier ordering.
function sortByDateCreatedDesc<T extends Sponsorship>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = a.date_created ?? "";
    const db = b.date_created ?? "";
    return db.localeCompare(da);
  });
}

// Position-ascending sort for the Upcoming sponsorships section.
// Position 1 (next to activate) at the top; position 3 last. Within
// the same position (shouldn't happen unless data integrity drift),
// secondary sort by date_created ASC so first-paid wins.
function sortByQueuePositionAsc<T extends Sponsorship>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = a.queue_position ?? 0;
    const pb = b.queue_position ?? 0;
    if (pa !== pb) return pa - pb;
    const da = a.date_created ?? "";
    const db = b.date_created ?? "";
    return da.localeCompare(db);
  });
}

function Group({ items }: { items: Sponsorship[] }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <VertSponsorshipCard key={s.id} s={s} />
      ))}
    </ul>
  );
}
