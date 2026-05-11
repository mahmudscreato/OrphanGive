"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

/**
 * Session 16 Part 3 Item 8 — Promise rebuilt as
 * "Four principles. No exceptions."
 *
 * Centered eyebrow + dual-font H2 followed by a 2×2 grid of
 * principle cards. Each card: icon tile left, title + body
 * right. Apricot-soft icon backgrounds with terracotta glyphs.
 *
 * Framer Motion: section scroll-reveal + per-card staggered
 * reveal (staggerChildren 0.1).
 */

type PrincipleKind = "dignity" | "verified" | "transparent" | "privacy";

type Principle = {
  kind: PrincipleKind;
  title: string;
  body: string;
};

const PRINCIPLES: Principle[] = [
  {
    kind: "dignity",
    title: "Dignity first",
    body: "We portray every child as a learner, a dreamer, a sibling — never a statistic.",
  },
  {
    kind: "verified",
    title: "Verified partners only",
    body: "We work exclusively with trusted local organisations who are on the ground.",
  },
  {
    kind: "transparent",
    title: "Transparent every taka",
    body: "Donors see exactly where their money goes, with quarterly reports.",
  },
  {
    kind: "privacy",
    title: "Privacy protected",
    body: "Children's identities are masked. We never compromise on safeguarding.",
  },
];

function PrincipleIcon({ kind }: { kind: PrincipleKind }) {
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
  if (kind === "dignity") {
    // Filled heart — solid fill, no stroke.
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="w-7 h-7"
      >
        <path
          d="M12 21 Q3 14 4 8 Q5 3 9 4 Q11 4 12 8 Q13 4 15 4 Q19 3 20 8 Q21 14 12 21 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (kind === "verified") {
    return (
      <svg {...common}>
        <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === "transparent") {
    // Two hands cradling a heart.
    return (
      <svg {...common}>
        <path d="M3 13 L 3 18 C 3 20 5 21 7 21 L 17 21 C 19 21 21 20 21 18 L 21 13" />
        <path d="M12 16 Q 8 13 9 10 Q 10 8 12 9 Q 14 8 15 10 Q 16 13 12 16 Z" />
      </svg>
    );
  }
  // privacy — lock
  return (
    <svg {...common}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

export function Promise() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-16"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Our principles
          </div>
          <h2 className="mt-3">
            <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              Four principles.
            </span>{" "}
            <span className="font-script text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)]">
              No exceptions.
            </span>
          </h2>
          {/* Part 4 Fix 9 — section subtext. */}
          <p className="mt-4 text-base text-ink-soft max-w-2xl mx-auto leading-[1.55]">
            Every decision at OrphanGive runs through these four lines.
          </p>
        </div>

        <motion.div
          className="grid grid-cols-2 gap-6 max-md:grid-cols-1"
          initial={reduced ? false : "hidden"}
          whileInView={reduced ? undefined : "visible"}
          viewport={{ once: true, margin: "-80px" }}
          variants={reduced ? undefined : containerVariants}
        >
          {PRINCIPLES.map((p) => (
            <motion.div
              key={p.kind}
              className="flex gap-5 bg-white rounded-2xl p-7"
              style={{
                boxShadow:
                  "0 1px 2px rgba(42,42,44,0.04), 0 8px 20px -10px rgba(237,139,63,0.18)",
              }}
              variants={reduced ? undefined : cardVariants}
              whileHover={
                reduced
                  ? undefined
                  : { y: -2, boxShadow: "0 4px 8px rgba(42,42,44,0.05), 0 14px 30px -10px rgba(237,139,63,0.28)" }
              }
              transition={{ duration: 0.25 }}
            >
              <div className="flex-shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-pale text-tangerine-deep">
                <PrincipleIcon kind={p.kind} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-ink mb-2 leading-tight">
                  {p.title}
                </h3>
                <p className="text-sm text-ink-soft leading-[1.55]">
                  {p.body}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  );
}

export default Promise;
