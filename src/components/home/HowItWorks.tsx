"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

/**
 * Session 16 Part 3 Item 7 — HowItWorks as Simple Steps.
 *
 * Five steps in a horizontal row inside a rounded-3xl gradient
 * card. Each step has:
 *   - A circular step-number badge offset outside the top-left
 *     corner of its card.
 *   - An icon tile (apricot-soft bg, terracotta icon).
 *   - A short Fraunces title and supporting sentence.
 *
 * Between consecutive cards on lg+ there's a small dashed arrow
 * pointing to the next step. Last card omits its arrow.
 *
 * Section heading mirrors the dual-font pattern: Fraunces serif
 * line + Caveat script line in terracotta.
 *
 * Framer Motion: section scroll-reveal + staggered card reveal
 * (staggerChildren 0.1). Reduced-motion respected throughout.
 */

type StepKind = "identify" | "safe" | "package" | "deliver" | "updates";

type Step = {
  kind: StepKind;
  num: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    kind: "identify",
    num: "01",
    title: "Identify & Verify",
    body: "We identify vulnerable children and verify every profile with our partners.",
  },
  {
    kind: "safe",
    num: "02",
    title: "Safe Profile",
    body: "A privacy-protected profile is created to ensure their safety.",
  },
  {
    kind: "package",
    num: "03",
    title: "Choose a Package",
    body: "You choose a cause or sponsor a child with a package.",
  },
  {
    kind: "deliver",
    num: "04",
    title: "Deliver Support",
    body: "We deliver your support through trusted local partners on the ground.",
  },
  {
    kind: "updates",
    num: "05",
    title: "Donor Updates",
    body: "Receive regular updates and see the impact of your kindness.",
  },
];

function StepIcon({ kind }: { kind: StepKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-6 h-6",
  };
  if (kind === "identify") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="M16 16 L 21 21" />
      </svg>
    );
  }
  if (kind === "safe") {
    return (
      <svg {...common}>
        <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
        <rect x="9.25" y="11" width="5.5" height="5" rx="1" />
        <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
      </svg>
    );
  }
  if (kind === "package") {
    return (
      <svg {...common}>
        <rect x="3" y="8" width="18" height="13" rx="1" />
        <path d="M3 12h18" />
        <path d="M12 8v13" />
        <path d="M12 8c-1.5-3-5-3-5-1s2 2 5 1z" />
        <path d="M12 8c1.5-3 5-3 5-1s-2 2-5 1z" />
      </svg>
    );
  }
  if (kind === "deliver") {
    return (
      <svg {...common}>
        <path d="M3 13 L 3 18 C 3 20 5 21 7 21 L 17 21 C 19 21 21 20 21 18 L 21 13" />
        <path d="M12 16 Q 8 13 9 10 Q 10 8 12 9 Q 14 8 15 10 Q 16 13 12 16 Z" />
      </svg>
    );
  }
  // updates — envelope
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/**
 * Part 5.7 Fix C — bolder hand-drawn arrow between steps.
 *
 * Solid (not dashed) shaft with a slight wobble baked into the
 * path so it reads as drawn, not vector-perfect. A turbulence
 * filter further roughens the edge — same technique as
 * PhotoBlob's ring. OG orange (#ED8B3F), 3.5px stroke, full
 * opacity. Arrowhead drawn as two strokes meeting at a point
 * (no closed polygon) so the brush feel carries through.
 */
function StepArrow() {
  const rawId = useId();
  const filterId = `arrow-rough-${rawId.replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 60 24"
      fill="none"
      aria-hidden="true"
      className="w-14 h-6"
    >
      <defs>
        <filter id={filterId} x="-10%" y="-30%" width="120%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves="2"
            seed="3"
          />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} stroke="#ED8B3F" fill="none">
        {/* Shaft — slight downward dip mid-path so it reads as
            drawn by hand, not perfectly horizontal. */}
        <path
          d="M 2 12 Q 18 14 32 11 T 50 12"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* Arrowhead — two strokes meeting at a point. */}
        <path
          d="M 44 5 L 52 12 L 44 19"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function HowItWorks() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      id="how-it-works"
      className="px-6 py-12 max-md:py-10"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Part 4 Fix 10 — gradient backdrop card removed. The
            section now sits on the page canvas; the 5 step
            cards keep their own white bg + soft shadow so they
            read clearly against peach. */}
        <div className="relative">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              How It Works
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
                Simple steps.
              </span>{" "}
              <span className="font-script text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)]">
                Lasting change.
              </span>
            </h2>
            {/* Part 4 Fix 8 — section subtext. */}
            <p className="mt-4 text-base text-ink-soft max-w-2xl mx-auto leading-[1.55]">
              From verification to delivery, the journey is short and
              accountable.
            </p>
          </div>

          <motion.div
            className="grid grid-cols-5 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1 max-lg:gap-y-12"
            initial={reduced ? false : "hidden"}
            whileInView={reduced ? undefined : "visible"}
            viewport={{ once: true, margin: "-80px" }}
            variants={reduced ? undefined : containerVariants}
          >
            {STEPS.map((step, i) => (
              <motion.div
                key={step.kind}
                className="relative bg-white rounded-2xl px-5 pt-6 pb-5"
                style={{
                  boxShadow:
                    "0 1px 2px rgba(42,42,44,0.04), 0 8px 20px -10px rgba(237,139,63,0.18)",
                }}
                variants={reduced ? undefined : cardVariants}
              >
                {/* Step number badge — offset outside the top-left
                    corner. Terracotta bg, white Fraunces semibold. */}
                <div
                  className="absolute flex items-center justify-center w-9 h-9 rounded-full font-display font-semibold text-[15px] text-white"
                  style={{
                    top: -14,
                    left: -10,
                    background: "var(--orange-solid)",
                    boxShadow: "0 4px 12px rgba(237,139,63,0.35)",
                  }}
                >
                  {step.num}
                </div>

                {/* Icon tile — apricot-soft bg, terracotta icon. */}
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-pale text-tangerine-deep">
                  <StepIcon kind={step.kind} />
                </div>

                <h3 className="mt-4 font-display font-semibold text-[17px] text-ink leading-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-ink-soft leading-[1.5]">
                  {step.body}
                </p>

                {/* Part 5.7 Fix C — bolder hand-drawn arrow.
                    Hidden on the last card and on mobile/tablet
                    (where cards stack). */}
                {i < STEPS.length - 1 ? (
                  <div
                    className="absolute hidden lg:block pointer-events-none"
                    style={{ top: "50%", right: -34, transform: "translateY(-50%)" }}
                    aria-hidden="true"
                  >
                    <StepArrow />
                  </div>
                ) : null}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default HowItWorks;
