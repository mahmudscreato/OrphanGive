import { ChildCard } from "@/components/children/ChildCard";
import type { ChildSummary } from "@/lib/children-data";

export function RelatedChildren({
  items,
}: {
  items: ChildSummary[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="px-6 py-24 bg-moss-soft/40 max-md:py-16">
      <div className="max-w-[1320px] mx-auto">
        <div className="max-w-[640px]">
          <div className="eyebrow-tag">Browse more</div>
          <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
            Other children awaiting sponsorship
          </h2>
          <p className="mt-3 text-[15px] text-slate leading-[1.65]">
            Each one has a story worth telling.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-4 gap-6 max-lg:grid-cols-3 max-md:grid-cols-2 max-md:gap-4">
          {items.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default RelatedChildren;
