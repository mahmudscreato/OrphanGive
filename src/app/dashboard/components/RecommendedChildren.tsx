import { ChildCard } from "@/components/children/ChildCard";
import type { ChildSummary } from "@/lib/children-data";

type Props = {
  items: ChildSummary[];
  // Pass true for the first-time-approved donor experience to show
  // the wider 6-up layout instead of the calm 3-up. Default false.
  expanded?: boolean;
};

export function RecommendedChildren({ items, expanded = false }: Props) {
  if (items.length === 0) return null;
  // Cap depending on layout. The page passes pre-sliced lists, but we
  // defensively trim here too so a stray over-fetch doesn't bloat the
  // dashboard.
  const cap = expanded ? 6 : 3;
  const visible = items.slice(0, cap);

  return (
    <section>
      <div className="max-w-[640px]">
        <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
          More children you could support
        </h2>
        <p className="mt-2 text-[14px] text-slate italic">
          {visible.length} {visible.length === 1 ? "child" : "children"} awaiting sponsors
        </p>
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
