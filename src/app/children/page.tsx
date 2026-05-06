import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ChildCard } from "@/components/children/ChildCard";
import { EmptyState } from "@/components/children/EmptyState";
import { FilterBar } from "@/components/children/FilterBar";
import { LoadMore } from "@/components/children/LoadMore";
import {
  getActiveDistricts,
  getChildrenPage,
  parseFilters,
} from "@/lib/children-data";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BrowseChildrenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [page, districts] = await Promise.all([
    getChildrenPage(filters),
    getActiveDistricts(),
  ]);

  const fmt = new Intl.NumberFormat("en-US");

  return (
    <div className="bg-cream">
      <div className="px-6 pt-32 max-md:pt-28">
        <div className="max-w-[1320px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { label: "Children" },
            ]}
          />
        </div>
      </div>

      {/* Header */}
      <header className="px-6 pt-10 pb-12 max-md:pt-8 max-md:pb-8">
        <div className="max-w-[1320px] mx-auto">
          <div className="eyebrow-tag">Children awaiting sponsorship</div>
          <h1 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.5rem,5.5vw,4.5rem)] max-w-[20ch]">
            Find a child whose{" "}
            <em className="painterly-underline italic font-light text-tangerine">
              story
            </em>{" "}
            moves you
          </h1>
          <p className="mt-6 max-w-[640px] text-[18px] text-slate leading-[1.6]">
            Each profile has been registered with their guardian&apos;s consent
            and verified by our field team. Sensitive details stay private to
            protect them.
          </p>
          <div className="mt-7 inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.1em] text-slate">
            <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse-dot" />
            Showing{" "}
            <span className="text-ink font-semibold">
              {fmt.format(Math.min(page.children.length, page.filteredCount))}
            </span>{" "}
            of{" "}
            <span className="text-ink font-semibold">
              {fmt.format(page.totalActiveCount)}
            </span>{" "}
            verified children
          </div>
        </div>
      </header>

      <FilterBar districts={districts} />

      <section className="px-6 pt-10 pb-24 max-md:pt-8 max-md:pb-16">
        <div className="max-w-[1320px] mx-auto">
          {page.children.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1">
              {page.children.map((c, i) => (
                <ChildCard key={c.id} child={c} preload={i < 3} />
              ))}
            </div>
          )}

          {page.hasMore ? <LoadMore nextPage={filters.page + 1} /> : null}
        </div>
      </section>
    </div>
  );
}
