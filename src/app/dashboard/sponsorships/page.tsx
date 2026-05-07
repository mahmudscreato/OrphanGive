import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import {
  getDonorSponsorships,
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

  const active = displayable.filter((s) => s.status === "active");
  const completed = displayable.filter((s) => s.status === "completed");
  const pending = displayable.filter((s) => s.status === "pending_payment");
  const cancelled = displayable.filter((s) => s.status === "cancelled");

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Children you support
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
        <p className="text-[14.5px] text-slate-soft leading-[1.6] max-w-[560px]">
          You don&apos;t have any active sponsorships yet.{" "}
          <a
            href="/children"
            className="text-tangerine-deep underline-offset-4 hover:underline"
          >
            Browse children →
          </a>
        </p>
      )}

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

      {completed.length > 0 ? (
        <section>
          <h2 className="font-display text-[22px] text-moss leading-tight tracking-[-0.01em] m-0">
            Completed sponsorships
          </h2>
          <Group items={completed} />
        </section>
      ) : null}

      {cancelled.length > 0 ? (
        <details className="group">
          <summary className="list-none cursor-pointer flex items-center gap-2 text-[12.5px] font-mono uppercase tracking-[0.12em] text-slate-soft hover:text-slate transition-colors">
            <span className="inline-block w-2 transition-transform group-open:rotate-90">
              ▸
            </span>
            <span>Cancelled sponsorships ({cancelled.length})</span>
          </summary>
          <div className="mt-5">
            <Group items={cancelled} />
          </div>
        </details>
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
