import Link from "next/link";
import { ChildCard } from "@/components/children/ChildCard";
import type { ChildSummary } from "@/lib/children-data";

type Props = {
  items: ChildSummary[];
  // Total count of children currently awaiting a sponsor across the
  // whole platform — drives the subtitle ("N children awaiting") and
  // the "See all (N) →" link target. Comes from
  // getAwaitingChildrenCount() in children-data.ts. Not the same as
  // items.length (which is just the random preview cap).
  totalAwaiting: number;
  // Pass true for the first-time-approved donor experience to show
  // the wider 6-up layout instead of the calm 3-up. Default false.
  expanded?: boolean;
};

export function RecommendedChildren({
  items,
  totalAwaiting,
  expanded = false,
}: Props) {
  // No awaiting children at all → render the celebratory empty state.
  // (The dashboard's "Children you support" + previously-supported
  // sections still surface the donor's own sponsorships above us.)
  if (totalAwaiting === 0) {
    return (
      <section>
        <div className="max-w-[640px]">
          <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
            More children you could support
          </h2>
          <p className="mt-2 text-[14px] text-slate italic">
            Every child currently has a sponsor — alhamdulillah.
          </p>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    // Defensive: count > 0 but the random preview fetch returned
    // nothing (network blip). Surface the count + link anyway so the
    // donor still has a path forward.
    return (
      <section>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="max-w-[640px]">
            <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
              More children you could support
            </h2>
            <p className="mt-2 text-[14px] text-slate italic">
              {totalAwaiting} {totalAwaiting === 1 ? "child" : "children"}{" "}
              awaiting sponsors
            </p>
          </div>
          <Link
            href="/children"
            className="text-[13px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
          >
            See all ({totalAwaiting}) →
          </Link>
        </div>
      </section>
    );
  }

  // Cap depending on layout. The page passes pre-sliced lists, but we
  // defensively trim here too so a stray over-fetch doesn't bloat the
  // dashboard.
  const cap = expanded ? 6 : 3;
  const visible = items.slice(0, cap);

  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-[640px]">
          <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
            More children you could support
          </h2>
          <p className="mt-2 text-[14px] text-slate italic">
            {totalAwaiting} {totalAwaiting === 1 ? "child" : "children"}{" "}
            awaiting sponsors
          </p>
        </div>
        <Link
          href="/children"
          className="text-[13px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
        >
          See all ({totalAwaiting}) →
        </Link>
      </div>

      {/* Horizontal scroller on small screens, grid on desktop. The
          grid column count flexes with `expanded` so first-timers see
          a denser invitation while existing donors see a calmer 3-up. */}
      <div className="mt-6 -mx-6 px-6 overflow-x-auto scroll-pl-6 snap-x snap-mandatory max-md:pb-2 lg:overflow-x-visible lg:px-0 lg:mx-0">
        <ul
          className={
            "flex gap-5 lg:grid lg:gap-6 " +
            (expanded ? "lg:grid-cols-3" : "lg:grid-cols-3")
          }
        >
          {visible.map((c) => (
            <li
              key={c.id}
              className="snap-start shrink-0 w-[78%] sm:w-[44%] md:w-[33%] lg:w-auto"
            >
              <ChildCard child={c} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default RecommendedChildren;
