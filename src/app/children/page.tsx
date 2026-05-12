import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { BrowseChildCard } from "@/components/children/BrowseChildCard";
import { BrowseEmptyState } from "@/components/children/BrowseEmptyState";
import { BrowseClosingStrip } from "@/components/children/BrowseClosingStrip";
import type { FramePathKey } from "@/components/decorations/HandDrawnPhotoFrame";
import { getActiveChildrenForBrowse } from "@/lib/children-data";
import { getHomepageStats } from "@/lib/homepage-data";
import { getMonthlyQueueStateByChild } from "@/lib/sponsorship-data";

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
 *
 * Out of scope this pass (intentional, per Session 17 spec):
 *   - TODO: filtering UI when child count > ~25. The legacy
 *     FilterBar + multi-facet filter machinery in
 *     `src/components/children/{FilterBar,LoadMore}.tsx` and
 *     `getChildrenPage` in `lib/children-data.ts` is preserved
 *     and can be re-wired in one import.
 *   - TODO: pagination / load-more when child count > 30.
 *     Current scale (~10 active) renders all in a single grid.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Children waiting for sponsors",
  description:
    "Browse verified profiles of orphaned and vulnerable children in Bangladesh waiting for monthly sponsorship. Each profile is reviewed with their guardian's consent and verified by our field team.",
  openGraph: {
    title: "Children waiting for sponsors — OrphanGive",
    description:
      "Browse verified profiles of orphaned and vulnerable children in Bangladesh waiting for monthly sponsorship.",
  },
};

const CARD_PATH_KEYS: FramePathKey[] = [
  "circleA",
  "circleB",
  "circleC",
  "circleD",
];

export default async function BrowseChildrenPage() {
  const [children, stats] = await Promise.all([
    getActiveChildrenForBrowse(),
    getHomepageStats(),
  ]);

  // Bulk-resolve queue state per visible child so cards can render
  // the "Sponsored monthly" / "Queue full" status badges. Single
  // round-trip against the visible page IDs (matches the legacy
  // page's pattern from Session 14.7).
  const queueStateByChild = await getMonthlyQueueStateByChild(
    children.map((c) => c.id),
  );

  const fmt = new Intl.NumberFormat("en-US");
  const waitingCount = stats.waiting;

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
          {/* Session 17.5 (review answer #6) — differentiated from
              the homepage Featured Children section ("Verified
              profiles. / Real stories. Real care.") so this page
              reads as a sibling, not a clone. */}
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

          {/* Live "currently waiting" callout. Suppressed when the
              count isn't available (Directus query fallback). */}
          {waitingCount !== null && waitingCount > 0 ? (
            <div className="mt-7 inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.1em] uppercase text-ink-soft">
              <span className="w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse-dot" />
              <span>
                <span className="text-ink font-semibold">
                  {fmt.format(waitingCount)}
                </span>{" "}
                {waitingCount === 1 ? "child" : "children"} currently
                waiting
              </span>
            </div>
          ) : null}
        </div>
      </header>

      {/* TODO: filtering UI when child count > ~25. Legacy FilterBar
          + getChildrenPage filter parsers preserved in
          src/components/children/FilterBar.tsx + lib/children-data.ts. */}

      <section className="px-6 pb-16 max-md:pb-12">
        <div className="max-w-[1320px] mx-auto">
          {children.length === 0 ? (
            <BrowseEmptyState />
          ) : (
            <div className="grid grid-cols-3 gap-10 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-12">
              {children.map((c, i) => {
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

          {/* TODO: pagination / load-more when child count > 30.
              Legacy LoadMore component preserved at
              src/components/children/LoadMore.tsx. */}
        </div>
      </section>

      <BrowseClosingStrip />
    </div>
  );
}
