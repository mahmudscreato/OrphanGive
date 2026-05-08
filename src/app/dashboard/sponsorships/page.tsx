import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import {
  getDonorSponsorships,
  sortSponsorshipsByEnded,
  sortSponsorshipsByPriority,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import { VertSponsorshipCard } from "../components/VertSponsorshipCard";
import { isDisplaySponsorship } from "../components/sponsorshipCardHelpers";

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
  const displayable = sponsorships.filter(isDisplaySponsorship);

  // Three buckets:
  //   • Currently sponsoring — status='active' (includes prepaid in their
  //     paid window). Sorted by Part-C priority: prepaid → recurring →
  //     one-time, newest first within each tier.
  //   • Awaiting payment — status='pending_payment'. Rendered as a small
  //     transient block above "Currently sponsoring" so the donor can
  //     finish or cancel the checkout. Not part of the two main sections
  //     but kept for visibility.
  //   • Previously supported — status IN ('completed', 'cancelled').
  //     Sorted by most-recently-ended first.
  const active = sortSponsorshipsByPriority(
    displayable.filter((s) => s.status === "active"),
  );
  const pending = displayable.filter((s) => s.status === "pending_payment");
  const previously = sortSponsorshipsByEnded(
    displayable.filter(
      (s) => s.status === "completed" || s.status === "cancelled",
    ),
  );

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
          <h1 className="font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
            Currently sponsoring
          </h1>
          {active.length > 0 ? (
            <p className="mt-2 text-[15px] text-slate italic">
              {active.length} active{" "}
              {active.length === 1 ? "sponsorship" : "sponsorships"}
            </p>
          ) : null}
        </header>
        {active.length > 0 ? (
          <Group items={active} />
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

      {previously.length > 0 ? (
        <section>
          <header>
            <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
              Previously supported
            </h2>
            <p className="mt-2 text-[14px] text-slate italic">
              {previously.length}{" "}
              {previously.length === 1 ? "child" : "children"}
            </p>
          </header>
          <Group items={previously} />
        </section>
      ) : null}
    </div>
  );
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
