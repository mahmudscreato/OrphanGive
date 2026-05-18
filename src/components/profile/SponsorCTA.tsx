// Session 57 — Children profile redesign: warm-tinted bottom CTA.
//
// Replaces the prior dark-gradient SponsorCTA ("Walk with X for the
// next year" on bg-ink) with a warm-cream full-bleed band. Reads
// as a natural close to the warm card stack above rather than a
// stark sales pitch.
//
// Layout: centered, max-720px column. Large serif heading,
// 2-3 line emotional copy, primary tangerine CTA, soft footnote.
// No more dark mode reversal — keeps the page in one emotional key
// from hero to footer.

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

const TRUST_NOTES = [
  "Cancel anytime",
  "100% reaches the child's care",
  "Verified by Children's Heaven Trust",
];

export function SponsorCTA({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  const firstName = child.display_name.split(" ")[0] || child.display_name;

  return (
    <section className="relative px-4 md:px-6 py-16 md:py-24 bg-warmth-100 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full
                   bg-tangerine-soft/30 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full
                   bg-warmth-accent/15 blur-3xl pointer-events-none"
      />

      <div className="relative max-w-[640px] mx-auto text-center">
        <h2 className="font-display font-medium text-warmth-text leading-tight
                       text-[32px] md:text-[40px]">
          Sponsor {firstName} today
        </h2>
        <p className="mt-4 md:mt-5 text-[16.5px] md:text-[17.5px] text-ink/85 leading-[1.7]">
          A monthly commitment of BDT 1,500 covers {firstName}&apos;s
          school fees, books, meals, and routine medical care. Sponsors
          receive quarterly updates and the child&apos;s own letters —
          never edited, never staged.
        </p>

        <div className="mt-8 md:mt-10 flex flex-col items-center gap-3">
          {tier === "public" ? (
            <>
              <Button
                href={`/signin?from=/children/${child.id}`}
                variant="tangerine"
                size="lg"
                className="w-full sm:w-auto"
              >
                Sign in to begin sponsorship →
              </Button>
              <Link
                href={`/signup?from=/children/${child.id}`}
                className="text-[13.5px] text-warmth-text hover:text-warmth-accent underline-offset-4 hover:underline"
              >
                Or create a donor account
              </Link>
            </>
          ) : (
            <Button
              href={`/sponsor/${child.id}`}
              variant="tangerine"
              size="lg"
              className="w-full sm:w-auto"
            >
              Become {firstName}&apos;s sponsor — from BDT 1,500/mo
            </Button>
          )}
        </div>

        <div className="mt-7 flex justify-center gap-x-5 gap-y-2 flex-wrap font-mono text-[11px] tracking-[0.1em] uppercase text-warmth-text/80">
          {TRUST_NOTES.map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-moss"
                aria-hidden="true"
              />
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SponsorCTA;
