import { ChildCard } from "@/components/children/ChildCard";
import type { ChildSummary } from "@/lib/children-data";

export function RecommendedChildren({ items }: { items: ChildSummary[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="max-w-[640px]">
        <div className="eyebrow-tag">Recommended</div>
        <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.5rem)]">
          Children you might consider sponsoring.
        </h2>
        <p className="mt-2 text-[15px] text-slate leading-[1.6]">
          These children are still seeking a sponsor.
        </p>
      </div>

      {/* Horizontal scroller — overflow-x for mobile/tablet, grid on desktop */}
      <div className="mt-7 -mx-6 px-6 overflow-x-auto scroll-pl-6 snap-x snap-mandatory max-md:pb-2 lg:overflow-x-visible lg:px-0 lg:mx-0">
        <ul className="flex gap-5 lg:grid lg:grid-cols-4 lg:gap-6">
          {items.map((c) => (
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
