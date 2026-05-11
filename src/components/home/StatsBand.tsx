"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import type { HomepageStats } from "@/lib/homepage-data";

/**
 * Session 16 Part 5.8 Fixes B + D — StatsBand reverted to cream
 * with bold typography.
 *
 *  B.1 — Section bg reverts to the page canvas (peach). The
 *        full-orange treatment from Part 5.7 felt too loud back-
 *        to-back with the ClosingCTA orange band. Big OG icon
 *        watermark stays but recolored from white-tint to pale
 *        OG-orange (`#ED8B3F` at ~10% opacity) so it reads on
 *        cream as a subtle brand mark.
 *  B.2 — Column layout preserved (no card wrappers). Dividers
 *        now ink/15 (was white/15). Icon tiles flip from
 *        white-on-white-tint to OG-orange-on-pale-orange.
 *  B.3 — Numbers: Fraunces 700 weight, NOT italic, ~120px on
 *        desktop (was Fraunces italic 400, ~96px). Confident
 *        statistical read instead of elegant magazine.
 *  B.4 — Category labels: bumped from ~13px white/70 mono to
 *        ~16px bold ink uppercase letterspaced. Reads as a
 *        section anchor, not whisper caption.
 *  B.5 — Sub copy preserved from 5.7; color flips to ink-soft.
 *  B.6 — Headline "today." uses tangerine-deep — cleaner on
 *        cream than the burnt-sienna chosen for the orange bg.
 *
 *  D.1/D.2 — Section vertical padding stays at py-20 (64-80px
 *        is the sweet spot for visual rhythm with TrustBar above
 *        and HowItWorks below). Internal spacing tightened:
 *        eyebrow → headline mt-3 → mt-4; headline → cards
 *        mb-16 → mb-14. Trims the cavernous-feeling whitespace
 *        from the 5.7 version without cramping.
 */

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) =>
    new Intl.NumberFormat("en-US").format(Math.round(v)),
  );

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.2, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, value, reduced, mv]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const tileVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

type TileKind = "people" | "verified" | "active" | "waiting";

function TileIcon({ kind }: { kind: TileKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-5 h-5",
  };
  if (kind === "people") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 21 v-2 c 0 -3 3 -5 6 -5 c 3 0 6 2 6 5 v2" />
        <path d="M15 21 v-1 c 0 -2 2 -3 4 -3 s 4 1 4 3 v1" />
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
  if (kind === "active") {
    // Filled heart for "active monthly support".
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="w-5 h-5"
      >
        <path
          d="M12 21 Q3 14 4 8 Q5 3 9 4 Q11 4 12 8 Q13 4 15 4 Q19 3 20 8 Q21 14 12 21 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  // waiting — clock
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7 v5 l3 3" />
    </svg>
  );
}

type Tile = {
  kind: TileKind;
  label: string;
  /** Numeric value when known — animates with CountUp. */
  value: number | null;
  /** Optional non-numeric override (e.g. "4.8M"). */
  staticValue?: string;
  sub: string;
};

export function StatsBand({ stats }: { stats: HomepageStats }) {
  const reduced = useReducedMotion();

  const tiles: Tile[] = [
    {
      kind: "people",
      label: "Bangladesh, total",
      staticValue: stats.bangladesh_total,
      value: null,
      sub: "orphan children across Bangladesh.",
    },
    {
      kind: "verified",
      label: "Listed with us",
      value: stats.listed,
      sub: "verified children ready to be supported.",
    },
    {
      kind: "active",
      label: "Active monthly sponsors",
      value: stats.sponsored,
      sub: "children receiving monthly support today.",
    },
    {
      kind: "waiting",
      label: "Waiting for a sponsor",
      value: stats.waiting,
      sub: "verified children waiting for their first sponsor.",
    },
  ];

  return (
    <motion.section
      className="relative px-6 py-20 max-md:py-16 overflow-hidden"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      {/* Big OG-favicon watermark. Part 5.8 Fix B.1 — recolored
          from white-tint (over orange) to pale OG-orange so it
          reads on cream as a subtle brand mark. The CSS
          `filter` chain converts the source PNG to a flat
          OG-orange silhouette regardless of the original
          pixel values. */}
      <Image
        src={FAVICON_URL}
        alt=""
        width={1080}
        height={1530}
        unoptimized
        aria-hidden="true"
        className="absolute -right-20 top-1/2 -translate-y-1/2 w-[450px] max-lg:w-[280px] h-auto pointer-events-none opacity-[0.10] z-0 max-md:hidden"
      />

      <div className="relative z-10 max-w-[1320px] mx-auto">
        {/* Eyebrow + headline. Part 5.8 D.2 — eyebrow→headline
            spacing tightened (mt-3 → mt-4); headline→cards
            mb-16 → mb-14. */}
        <div className="text-center mb-14 max-md:mb-10">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Live data
          </div>
          <h2 className="mt-4 max-w-3xl mx-auto text-balance">
            <span className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2.5rem,5vw,4rem)]">
              Where the work stands
            </span>{" "}
            <span className="font-script italic leading-[0.9] text-[clamp(3rem,6vw,5rem)] text-tangerine-deep">
              today.
            </span>
          </h2>
        </div>

        {/* 4-column stats — column-style, no card wrappers, thin
            vertical dividers on lg+. Part 5.8 Fix B.2: dividers
            flip from white/15 to ink/15. */}
        <motion.div
          className="grid grid-cols-4 max-md:grid-cols-1 gap-0 max-md:gap-10"
          initial={reduced ? false : "hidden"}
          whileInView={reduced ? undefined : "visible"}
          viewport={{ once: true, margin: "-80px" }}
          variants={reduced ? undefined : containerVariants}
        >
          {tiles.map((tile, i) => (
            <motion.div
              key={tile.kind}
              variants={reduced ? undefined : tileVariants}
              className={`px-8 max-md:px-0 ${
                i > 0 ? "lg:border-l lg:border-ink/[0.12]" : ""
              }`}
            >
              {/* Icon tile — Part 5.8 Fix B.2: OG-orange icon
                  on pale-orange tile (was white-on-white-tint
                  over orange bg). */}
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep">
                <TileIcon kind={tile.kind} />
              </div>

              {/* Big number. Part 5.10 Fix B — corrected from
                  the Part 5.9 Cormorant Garamond (formal serif)
                  to Roboto Black (formal sans-serif). The
                  heavyweight geometric sans reads as
                  institutional / financial-report. Color stays
                  on `text-tangerine-deep` to match the section's
                  orange motif. `tracking-tight` denses the
                  glyphs together for a stamped feel. */}
              <div className="mt-6 font-roboto font-black text-tangerine-deep leading-none tracking-tight text-[clamp(3.5rem,7vw,7.5rem)]">
                {tile.staticValue !== undefined
                  ? tile.staticValue
                  : tile.value === null
                    ? "—"
                    : <CountUp value={tile.value} />}
              </div>

              {/* Uppercase label. Part 5.8 Fix B.4: bumped from
                  ~13px mono white/70 to ~16px bold ink so it
                  reads as a section anchor. */}
              <div className="mt-4 font-display font-bold text-[16px] tracking-[0.14em] uppercase text-ink">
                {tile.label}
              </div>

              {/* Short emotional sub. Part 5.8 Fix B.5: white/60
                  → ink-soft on cream. */}
              <div className="mt-2 text-sm text-ink-soft leading-snug">
                {tile.sub}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  );
}

export default StatsBand;
