// Session 57 — shared card wrapper for the /children/[id] redesign.
//
// One consistent shape for every section card on the profile page:
// white surface (or warmth-tinted variant), generous padding,
// 24px radius, soft tangerine-tinted shadow, 1px warm-neutral
// border. Reused across Story, FirstMeeting (intake gallery),
// School & studies, Family situation, Moments, Updates, and
// Health & wellbeing so the page reads as a stack of related
// modules rather than a string of flat alternating-color bands.
//
// Variants:
//   - `surface="white"`  (default): bg-white, the standard module
//   - `surface="warm"`:   bg-warmth-100, used for sponsor-only or
//     "earned content" cards (family-narrative) so a viewer who's
//     unlocked them feels the page step up around them
//   - `surface="cream"`:  bg-warmth-50, used for the bottom
//     full-width CTA band where we want the warm context to bleed
//     past the card edges

import type { ReactNode } from "react";

export type WarmCardSurface = "white" | "warm" | "cream";

const SURFACE_CLASSES: Record<WarmCardSurface, string> = {
  white: "bg-white border-ink/[0.06]",
  warm: "bg-warmth-100 border-warmth-accent/20",
  cream: "bg-warmth-50 border-warmth-accent/15",
};

export function WarmCard({
  children,
  surface = "white",
  className = "",
  id,
}: {
  children: ReactNode;
  surface?: WarmCardSurface;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-3xl border ${SURFACE_CLASSES[surface]} shadow-card-warm p-6 md:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Section header used inside every WarmCard. Keeps spacing + type
 * consistent: 24px serif heading, optional eyebrow above. The
 * `eyebrow` line is the small font-mono uppercase tag we use
 * elsewhere on the site; making it a card-local helper keeps the
 * global eyebrow-tag color (tangerine) from being misapplied here
 * (we use the warmth-text brown for a softer reading inside cards).
 */
export function CardHeader({
  eyebrow,
  title,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  className?: string;
}) {
  return (
    <header className={`mb-5 md:mb-6 ${className}`}>
      {eyebrow ? (
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-warmth-accent font-medium mb-2">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-display text-[24px] md:text-[26px] font-medium text-ink leading-snug">
        {title}
      </h2>
    </header>
  );
}

export default WarmCard;
