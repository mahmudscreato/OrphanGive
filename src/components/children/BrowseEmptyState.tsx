import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

/**
 * Session 17 — empty state for the public `/children` browse list.
 *
 * Two flavours, picked by the `filtered` prop:
 *   • `filtered=false` (default) — genuine "no profiles published
 *     yet" state. Triggers when zero children are in `status="active"`.
 *     Rare but possible (e.g. between batches of guardian-approved
 *     profiles). Voice: dignified, present-tense, never apologetic
 *     about the absence — it reflects the verification floor we keep,
 *     not a product failure.
 *   • `filtered=true` (Session 36) — at least one filter is active
 *     and the combination matches zero children. Different copy +
 *     a "Clear filters" CTA so the user can recover with one click
 *     instead of guessing which filter to drop.
 */
export function BrowseEmptyState({
  filtered = false,
}: {
  filtered?: boolean;
}) {
  if (filtered) {
    return (
      <div className="rounded-[28px] border border-ink/[0.06] bg-white px-12 py-16 text-center max-md:px-6 max-md:py-12">
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          No matches
        </div>
        <h2 className="mt-3">
          <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
            No children match these filters.
          </span>
          <span className="block font-script text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2rem,4vw,3rem)] mt-2">
            Try widening your search.
          </span>
        </h2>
        <p className="mt-5 max-w-md mx-auto text-base text-ink-soft leading-[1.6]">
          Removing one filter usually does it — division and age range
          are the most narrowing.
        </p>
        <Link
          href="/children"
          className="group/clear mt-7 inline-flex items-center gap-2 rounded-full bg-white text-tangerine-deeper border-[1.5px] border-tangerine px-7 py-3 font-body font-medium transition-all duration-[250ms] ease-soft hover:bg-tangerine hover:text-ink hover:shadow-warm hover:-translate-y-px"
        >
          Clear all filters
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 group-hover/clear:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-ink/[0.06] bg-white px-12 py-16 text-center max-md:px-6 max-md:py-12">
      <div className="inline-flex items-center text-script-md text-tangerine-deep">
        <EyebrowIcon />
        Verification in progress
      </div>
      <h2 className="mt-3">
        <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
          New profiles are being prepared.
        </span>
        <span className="block font-script text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2rem,4vw,3rem)] mt-2">
          Please check back shortly.
        </span>
      </h2>
      <p className="mt-5 max-w-md mx-auto text-base text-ink-soft leading-[1.6]">
        Every child here has been verified with our field partners.
        Profiles appear on this page only after that review is
        complete.
      </p>
      <Link
        href="/about"
        className="group/about mt-7 inline-flex items-center gap-2 rounded-full bg-white text-tangerine-deeper border-[1.5px] border-tangerine px-7 py-3 font-body font-medium transition-all duration-[250ms] ease-soft hover:bg-tangerine hover:text-ink hover:shadow-warm hover:-translate-y-px"
      >
        Learn about OrphanGive
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-200 group-hover/about:translate-x-1"
        >
          →
        </span>
      </Link>
    </div>
  );
}

export default BrowseEmptyState;
