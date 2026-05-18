// Session 57 — Children profile redesign: warm card-styled story.
//
// Replaces the prior full-width `bg-linen` band + giant generic
// "A story still being written" headline with a quieter, child-
// centric heading ("{Name}'s story") inside a WarmCard. Body type
// is slightly larger (17-18px / line-height 1.7) for comfortable
// long reading.
//
// If the story has at least two sentences, we pull the FIRST
// sentence out into a serif italic blockquote with a warm
// border-left, then render the remainder as paragraphs below.
// This gives a visual entry point without duplicating the hero's
// blockquote (which we removed in this session) — the story is
// where the emotional pull-quote now lives.
//
// Public viewers with `story_truncated=true` still see the
// existing sign-in prompt; it's restyled as a small warmth-tinted
// strip below the body rather than a separate floating card.

import Link from "next/link";
import { WarmCard, CardHeader } from "./WarmCard";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

/**
 * Split a long story into { pullQuote, body[] }.
 *
 * - Pull-quote = the first sentence ONLY if the story has at
 *   least two paragraphs OR at least three sentences. If the story
 *   is a single short sentence, we don't pull anything — the body
 *   is the story.
 * - Body = remaining paragraphs (paragraph 1 minus its first
 *   sentence, then paragraphs 2+).
 */
function splitStoryForPullQuote(story: string): {
  pullQuote: string | null;
  body: string[];
} {
  const paras = story
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return { pullQuote: null, body: [] };

  const first = paras[0]!;
  const sentenceMatch = first.match(/^.+?[.!?](?=\s|$)/);
  // Need at least 3 sentences total (counted across all paras) for
  // the pull-quote to make sense — pulling 1 of 2 sentences leaves
  // a sad orphan body.
  const sentenceCountAll = (story.match(/[.!?](?=\s|$)/g) || []).length;
  if (
    !sentenceMatch ||
    sentenceMatch[0].length < 30 || // skip "Ok." / "He's seven."
    sentenceMatch[0].length > 220 || // skip giant run-ons
    sentenceCountAll < 3
  ) {
    return { pullQuote: null, body: paras };
  }

  const pullQuote = sentenceMatch[0].trim();
  const remainderOfFirst = first.slice(sentenceMatch[0].length).trim();
  const body = remainderOfFirst
    ? [remainderOfFirst, ...paras.slice(1)]
    : paras.slice(1);

  return { pullQuote, body };
}

export function StorySection({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  if (!child.story) return null;
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const { pullQuote, body } = splitStoryForPullQuote(child.story);

  return (
    <section id="story" className="px-4 md:px-6 py-6 md:py-8 bg-warmth-50">
      <div className="max-w-[760px] mx-auto">
        <WarmCard>
          <CardHeader title={`${firstName}'s story`} />

          {pullQuote ? (
            <blockquote
              className="mb-6 md:mb-7 pl-5 md:pl-6 border-l-[3px] border-warmth-accent
                         font-display italic text-[20px] md:text-[22px] leading-snug
                         text-warmth-text"
            >
              &ldquo;{pullQuote}&rdquo;
            </blockquote>
          ) : null}

          <div className="text-[17px] md:text-[18px] text-ink leading-[1.7] space-y-5">
            {body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {/* Public + truncated story: warm in-card prompt instead
              of the prior floating sub-card. Reads like a polite
              footnote, not a paywall. */}
          {tier === "public" && child.story_truncated ? (
            <div className="mt-7 md:mt-8 rounded-2xl bg-warmth-50 border border-warmth-accent/15 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13.5px] text-warmth-text leading-snug max-w-[440px]">
                You&apos;re reading the public preview. Sign in to a donor
                account to read {firstName}&apos;s full story.
              </p>
              <Link
                href={`/signin?from=/children/${child.id}`}
                className="inline-flex items-center gap-1.5 text-tangerine-deeper font-medium text-[13.5px] hover:gap-2.5 transition-[gap]"
              >
                Sign in to continue →
              </Link>
            </div>
          ) : null}
        </WarmCard>
      </div>
    </section>
  );
}

export default StorySection;
