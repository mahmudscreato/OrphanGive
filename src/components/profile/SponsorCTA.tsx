// Session 57.1 — Bottom CTA in the reference's `cta-band` shape.
//
// Replaces the Session 57 single-column warm-tinted card with a
// richer 3-column layout on desktop that uses the homepage's
// brand vocabulary:
//
//   [ PhotoBlob ]  [ Headline + CTA ]  [ Pull-quote attribution ]
//
// All three columns sit on a sunset-toned warm band (orange-pale
// gradient into warmth-100) so the section reads as the page's
// emotional close, not another white card.
//
// Mobile collapses to a vertical stack in the order:
//   PhotoBlob → Headline + CTA → Pull-quote
//
// Pull-quote sourcing: if the child's story alludes to a stated
// aspiration ("wants to be a teacher", "dreams of …"), we extract
// that fragment and use it attributed as "{Name}, age {age}".
// Falls back to a warm generic line composed from the support
// type / first-name when no aspiration is detectable.

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import { DottedArc, PenSwoosh } from "@/components/decorations/InspoDecor";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

// Same OG mark Hero uses — repeated here as a small signoff stamp
// in the cta band, mirroring the homepage closing pattern.
const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

const TRUST_NOTES = [
  "Cancel anytime",
  "100% reaches the child's care",
  "Verified by Children's Heaven Trust",
];

/**
 * Try to extract a stated aspiration from the child's story.
 * Looks for the first matching pattern:
 *   "wants to be a {something}"
 *   "wants to become a {something}"
 *   "dreams of {something}"
 *   "hopes to {something}"
 * Returns null if nothing matches — the caller falls back to a
 * generic warm line.
 */
function extractAspiration(story: string | null): string | null {
  if (!story) return null;
  const patterns = [
    /\b(?:wants|hopes) to become an? ([a-z][a-z\s]+?)(?=[.,;!?]|$)/i,
    /\bwants to be an? ([a-z][a-z\s]+?)(?=[.,;!?]|$)/i,
    /\bdreams? of (?:becoming|being) an? ([a-z][a-z\s]+?)(?=[.,;!?]|$)/i,
    /\bdreams? of ([a-z][a-z\s]+?)(?=[.,;!?]|$)/i,
    /\bhopes to ([a-z][a-z\s]+?)(?=[.,;!?]|$)/i,
  ];
  for (const re of patterns) {
    const m = story.match(re);
    if (m && m[1]) {
      const phrase = m[1].trim().replace(/\s+/g, " ");
      if (phrase.length >= 3 && phrase.length <= 50) {
        return phrase;
      }
    }
  }
  return null;
}

function buildPullQuote(child: ChildProfile): {
  quote: string;
  byline: string;
} | null {
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const aspiration = extractAspiration(child.story);
  if (aspiration) {
    // Most aspirations read naturally as "I want to be a teacher"
    // — wrap accordingly with a determiner.
    const needsArticle = !/^an? /i.test(aspiration);
    const phrase = needsArticle ? `a ${aspiration}` : aspiration;
    return {
      quote: `I want to be ${phrase} someday.`,
      byline:
        child.age !== null
          ? `— ${firstName}, age ${child.age}`
          : `— ${firstName}`,
    };
  }
  // No aspiration in the story. Skip the pull-quote rather than
  // fake one — sponsors deserve the genuine voice or nothing.
  return null;
}

export function SponsorCTA({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const photoSrc = directusAssetUrl(child.photo);
  const pull = buildPullQuote(child);

  return (
    <section
      className="relative overflow-hidden px-4 md:px-6 py-16 md:py-20
                 bg-gradient-to-br from-orange-pale via-warmth-100 to-tangerine-soft/60"
    >
      {/* Soft decorative strokes — DottedArc on the right edge,
          PenSwoosh tucked low-left. Both desktop-only to keep
          the mobile stack airy. */}
      <DottedArc
        color="var(--tangerine-deep)"
        size={200}
        className="absolute top-8 right-8 pointer-events-none max-md:hidden"
        style={{ opacity: 0.4, transform: "rotate(22deg)" }}
      />
      <PenSwoosh
        color="var(--tangerine-deep)"
        className="absolute bottom-12 left-12 pointer-events-none max-lg:hidden"
        style={{ opacity: 0.35 }}
      />

      <div className="relative max-w-[1100px] mx-auto">
        <div
          className={`grid gap-8 md:gap-10 items-center
                       ${pull ? "lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.5fr)]"}`}
        >
          {/* ─── Photo column ──────────────────────────────────
              Small PhotoBlob, same `broken` path as the hero so
              the page reads cohesive — different size, same
              brushed ring vocabulary.
              Session 57.2 — same className fix as the hero blob:
              PhotoBlob takes `w-full h-full` on a sized parent
              instead of `absolute inset-0` (which collapsed it
              to 0×0 via the relative/absolute cascade conflict). */}
          <div className="order-1 mx-auto lg:mx-0 w-full max-w-[220px] lg:max-w-[240px] aspect-[4/5]">
            <PhotoBlob
              pathKey="broken"
              src={photoSrc ?? undefined}
              alt=""
              ringColor="#ED8B3F"
              fallbackGrad={["#FAEFE0", "#F9D4B1"]}
              outerStrokeWidth={10}
              innerStrokeWidth={6}
              objectPosition="center 18%"
              sizes="(max-width: 768px) 50vw, 240px"
              className="relative w-full h-full"
            />
          </div>

          {/* ─── Text + CTA column ─────────────────────────────
              Headline pairs serif possessive with Caveat script
              "today." for warm punctuation. Trust notes sit
              below the CTA on a single row. */}
          <div className="order-2 text-center lg:text-left">
            <h2 className="font-display font-medium text-ink leading-[1.05]">
              <span className="block text-[32px] md:text-[40px]">
                Walk with {firstName}
              </span>
              <span
                className="block font-script font-normal text-tangerine-deep
                           text-[40px] md:text-[52px]"
              >
                this year.
              </span>
            </h2>
            <p className="mt-4 md:mt-5 text-[16.5px] md:text-[17.5px] text-ink/85 leading-[1.7] max-w-[520px] mx-auto lg:mx-0">
              A monthly commitment of BDT 1,500 covers {firstName}&apos;s
              school fees, books, meals, and routine medical care. Sponsors
              receive quarterly updates and the child&apos;s own letters —
              never edited, never staged.
            </p>

            <div className="mt-7 md:mt-8 flex flex-col sm:flex-row sm:items-center gap-3 justify-center lg:justify-start">
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
                    className="text-[13.5px] text-warmth-text hover:text-tangerine-deeper underline-offset-4 hover:underline"
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
              <Image
                src={FAVICON_URL}
                alt=""
                width={28}
                height={28}
                className="hidden sm:inline-block opacity-70"
                aria-hidden="true"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 font-mono text-[11px] tracking-[0.1em] uppercase text-warmth-text/80">
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

          {/* ─── Pull-quote column ─────────────────────────────
              Only renders when we extracted a real aspiration
              from the child's story. Fake quotes would be worse
              than no quote here. */}
          {pull ? (
            <aside className="order-3 relative">
              <div
                className="relative rounded-3xl bg-white/85 backdrop-blur
                           border border-warmth-accent/15 p-6 md:p-7
                           shadow-card-warm"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="absolute -top-3 -left-2 w-9 h-9 text-tangerine-deep/70"
                  aria-hidden="true"
                >
                  <path
                    d="M7 7h4v4H7c0 3 1.5 4.5 4.5 4.5V18C6 18 4 15 4 11V7zm9 0h4v4h-4c0 3 1.5 4.5 4.5 4.5V18c-5.5 0-7.5-3-7.5-7V7z"
                    fill="currentColor"
                  />
                </svg>
                <blockquote className="font-display italic text-[19px] md:text-[20px] leading-[1.4] text-warmth-text">
                  {pull.quote}
                </blockquote>
                <cite
                  className="block mt-3 not-italic font-mono text-[11px]
                             tracking-[0.12em] uppercase text-warmth-text/75"
                >
                  {pull.byline}
                </cite>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default SponsorCTA;
