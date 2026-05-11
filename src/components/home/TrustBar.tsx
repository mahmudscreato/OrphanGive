"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Session 16 Part 3 Item 5 — TrustBar simplified.
 *
 * Replaces the previous 4-card bento with a single white card
 * holding a 4-column trust strip. On lg+ each column is
 * separated by a thin vertical divider in tangerine/15. On
 * mobile the columns stack with no dividers.
 *
 * Section padding py-12 keeps the strip a quiet trust signal,
 * not a hero element. Framer Motion scroll-reveal preserved on
 * the wrapper.
 */

type Pillar = {
  kind: "verified" | "privacy" | "transparent" | "impact";
  title: string;
  body: string;
};

const PILLARS: Pillar[] = [
  {
    kind: "verified",
    title: "Verified Profiles",
    body: "Every child and organisation is carefully verified.",
  },
  {
    kind: "privacy",
    title: "Privacy Protected",
    body: "Children's identities are kept safe and secure.",
  },
  {
    kind: "transparent",
    title: "Transparent Giving",
    body: "See how every taka creates real change.",
  },
  {
    kind: "impact",
    title: "Real Impact",
    body: "Support that transforms lives and communities.",
  },
];

function PillarIcon({ kind }: { kind: Pillar["kind"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-7 h-7",
  };
  if (kind === "verified") {
    return (
      <svg {...common}>
        <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === "privacy") {
    return (
      <svg {...common}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (kind === "transparent") {
    // Two hands cradling a heart.
    return (
      <svg {...common}>
        <path d="M3 12 L 3 18 C 3 20 5 21 7 21 L 17 21 C 19 21 21 20 21 18 L 21 12" />
        <path d="M12 16 Q 8 13 9 10 Q 10 8 12 9 Q 14 8 15 10 Q 16 13 12 16 Z" />
      </svg>
    );
  }
  // impact — ascending bars.
  return (
    <svg {...common}>
      <path d="M3 21h18" />
      <path d="M7 21V11" />
      <path d="M12 21V7" />
      <path d="M17 21V14" />
    </svg>
  );
}

export function TrustBar() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-12"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-md:p-6">
          <div className="grid grid-cols-4 gap-0 max-md:grid-cols-1 max-md:gap-6">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.kind}
                className={`flex flex-col items-start px-6 max-md:px-0 ${
                  // Vertical divider on lg+ between columns
                  // (skip on the first column). 1px line in
                  // tangerine at 0.15 opacity.
                  i > 0
                    ? "max-md:border-l-0 lg:border-l lg:border-tangerine/15"
                    : ""
                }`}
                whileHover={reduced ? undefined : { y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-tangerine-deep mb-3">
                  <PillarIcon kind={p.kind} />
                </div>
                <h3 className="font-display font-semibold text-[17px] tracking-[-0.005em] text-ink leading-tight">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {p.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default TrustBar;
