import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { BrowseChildCard } from "@/components/children/BrowseChildCard";
import { BrowseEmptyState } from "@/components/children/BrowseEmptyState";
import { BrowseClosingStrip } from "@/components/children/BrowseClosingStrip";
import { ChildrenFilterBar } from "@/components/children/ChildrenFilterBar";
import type { FramePathKey } from "@/components/decorations/HandDrawnPhotoFrame";
import {
  applyBrowseFilters,
  categorizeChild,
  getActiveChildrenForBrowse,
  isAnyBrowseFilterActive,
  parseBrowseFilters,
  sortChildrenByCategory,
} from "@/lib/children-data";
import { getMonthlyQueueStateByChild } from "@/lib/sponsorship-data";
// Session 64 — see faq/page.tsx for the same migration rationale.
import { buildPageMetadata } from "@/lib/page-metadata";

/**
 * Session 17 — public `/children` browse list, brand-aligned with
 * the Session 16 homepage redesign.
 *
 * Tier 1 privacy contract (every card):
 *   - Full display_name (Session 16 P1 policy update)
 *   - Bangladesh DIVISION (region) — district hidden
 *   - Age in years — DOB hidden
 *   - Photo (with dignified placeholder when missing)
 *   - Verified + Privacy-protected micro-badges
 *   - Status overlay if monthly-sponsored or queue-full
 *   - "Support [first name] →" CTA → /sponsor/[id]
 *   - "View profile →" link → /children/[id]  (Session 36)
 *
 * Session 36 additions:
 *   - URL-driven filters: status / division / age (see ChildrenFilterBar
 *     and parseBrowseFilters in lib/children-data.ts).
 *   - Sort order Awaiting → Prepaid → Monthly within the grid; longest-
 *     waiting profile first within each category. See sortChildrenByCategory.
 *   - Dynamic count callout that reflects filter state truthfully
 *     (e.g. "X of Y children match your filters" when narrowed).
 */

export const dynamic = "force-dynamic";

// P1.1 — child profile routes are noindex'd to keep verified named
// children out of search-engine results. Mirrors Lot 4's exact
// pattern on admin/di/dashboard layouts: `index: false, follow: false`
// (consistent grep-able pattern across all noindex'd surfaces; no
// PageRank passed from these pages). robots.ts also disallows the
// path, and sitemap.ts excludes child URLs — three-layer defense.
// The page itself remains fully accessible to human visitors; this
// only affects crawlers.
export const metadata = {
  ...buildPageMetadata({
    path: "/children",
    title: "Children waiting for sponsors",
    description:
      "Browse verified profiles of orphaned and vulnerable children in Bangladesh waiting for monthly sponsorship. Each profile is reviewed with their guardian's consent and verified by our field team.",
  }),
  robots: { index: false, follow: false },
};

const CARD_PATH_KEYS: FramePathKey[] = [
  "circleA",
  "circleB",
  "circleC",
  "circleD",
];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BrowseChildrenPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a promise that must be awaited.
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseBrowseFilters(sp);

  // Fetch all active children + their queue state. Both queries run
  // in parallel; current data volume (~10 children) keeps this fast.
  const allChildren = await getActiveChildrenForBrowse();
  const queueStateByChild = await getMonthlyQueueStateByChild(
    allChildren.map((c) => c.id),
  );

  // Sort first (Awaiting → Prepaid → Monthly), then filter. Order
  // matters: filtering preserves the input ordering, so the sort has
  // to be the input.
  const sorted = sortChildrenByCategory(allChildren, queueStateByChild);
  const visible = applyBrowseFilters(sorted, queueStateByChild, filters);

  // Awaiting total derived from the UNFILTERED sorted list so the
  // "no filter" callout can read "X children featured · Y awaiting"
  // truthfully — independent of any filters the user might apply.
  const awaitingTotal = sorted.filter(
    (c) => categorizeChild(queueStateByChild.get(c.id)) === "awaiting",
  ).length;

  const fmt = new Intl.NumberFormat("en-US");
  const anyFilterActive = isAnyBrowseFilterActive(filters);

  // Dynamic count callout (Session 36 Change 5).
  //
  //   • no filter             → "X children featured · Y awaiting"
  //   • status=awaiting       → "Y children currently waiting"
  //   • status=sponsored      → "Z children currently sponsored"
  //   • division/age only     → "X of Y children match your filters"
  //
  // The point is to never let the callout lie about what the grid
  // shows. Hidden when the source list is empty (Directus failure
  // fallback).
  let callout: { dotClass: string; body: React.ReactNode } | null = null;
  if (sorted.length > 0) {
    const dotPulse = "bg-tangerine animate-pulse-dot";
    const dotMoss = "bg-moss";
    if (filters.status === "awaiting") {
      callout = {
        dotClass: dotPulse,
        body: (
          <>
            <span className="text-ink font-semibold">
              {fmt.format(visible.length)}
            </span>{" "}
            {visible.length === 1 ? "child" : "children"} currently waiting
          </>
        ),
      };
    } else if (filters.status === "sponsored") {
      callout = {
        dotClass: dotMoss,
        body: (
          <>
            <span className="text-ink font-semibold">
              {fmt.format(visible.length)}
            </span>{" "}
            {visible.length === 1 ? "child" : "children"} currently sponsored
          </>
        ),
      };
    } else if (anyFilterActive) {
      callout = {
        dotClass: dotPulse,
        body: (
          <>
            <span className="text-ink font-semibold">
              {fmt.format(visible.length)}
            </span>{" "}
            of {fmt.format(sorted.length)} children match your filters
          </>
        ),
      };
    } else {
      callout = {
        dotClass: dotPulse,
        body: (
          <>
            <span className="text-ink font-semibold">
              {fmt.format(sorted.length)}
            </span>{" "}
            {sorted.length === 1 ? "child" : "children"} featured ·{" "}
            <span className="text-ink font-semibold">
              {fmt.format(awaitingTotal)}
            </span>{" "}
            awaiting
          </>
        ),
      };
    }
  }

  return (
    <div className="bg-cream">
      <div className="px-6 pt-8 max-md:pt-6">
        <div className="max-w-[1320px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { label: "Children" },
            ]}
          />
        </div>
      </div>

      {/* Page header — matches the homepage eyebrow + dual-font
          headline + sub-copy pattern. Centered, generous breathing
          room, but lighter than the homepage hero (this page is a
          gallery, not a landing). */}
      <header className="px-6 pt-10 pb-12 max-md:pt-8 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Meet the children
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Every face.
            </span>
            <span className="block font-script text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Every story matters.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Every profile is reviewed before publication. Each child
            here is waiting for someone to begin.
          </p>

          {/* Live count callout — see comment block above for the
              filter-state-driven copy variants. */}
          {callout ? (
            <div className="mt-7 inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.1em] uppercase text-ink-soft">
              <span className={`w-1.5 h-1.5 rounded-full ${callout.dotClass}`} />
              <span>{callout.body}</span>
            </div>
          ) : null}
        </div>
      </header>

      {/* Filter bar — URL-param driven. Empty by default; selecting any
          filter writes to the URL and re-renders this server component
          with the new filters parsed. */}
      <ChildrenFilterBar />

      <section className="px-6 pb-16 max-md:pb-12">
        <div className="max-w-[1320px] mx-auto">
          {visible.length === 0 ? (
            // Empty state branches:
            //   - sorted.length === 0   → genuine "no profiles published yet"
            //   - sorted.length > 0 but
            //     visible.length === 0  → filters narrowed to zero results
            <BrowseEmptyState filtered={anyFilterActive} />
          ) : (
            <div className="grid grid-cols-3 gap-10 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-12">
              {visible.map((c, i) => {
                const q = queueStateByChild.get(c.id);
                return (
                  <BrowseChildCard
                    key={c.id}
                    child={c}
                    preload={i < 3}
                    pathKey={CARD_PATH_KEYS[i % CARD_PATH_KEYS.length]!}
                    monthlySponsored={Boolean(q?.hasActiveSponsor)}
                    queueFull={Boolean(q?.hasActiveSponsor && q.isFull)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      <BrowseClosingStrip />
    </div>
  );
}
