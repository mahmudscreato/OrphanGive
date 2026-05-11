"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import {
  ConfettiDots,
  DottedArc,
  HeartOutline,
} from "@/components/decorations/InspoDecor";

export type HeroProps = {
  listedCount: number | null;
};

/**
 * Session 16 FINAL Hero — Part 4 polish.
 *
 * Part 4 Fix 3 — photos enlarged so the main photo dominates the
 * right column:
 *   - hero1 (Rana): 380×400 → 460×500
 *   - hero2 (top-right): 200×200 → 240×240
 *   - hero3 (bottom-right): 240×240 → 280×280
 * Right column switched from aspect-square to an explicit
 * min-height ~680 to accommodate the larger composition.
 *
 * Part 4 Fix 4 — OliveSprig removed; all PhotoBlob ringColors
 * set explicitly to --orange-solid (#ED8B3F); trust card text
 * replaced with "Every child verified. / Every taka tracked."
 * with the word `tracked.` in Caveat tangerine-deep.
 */
export function Hero(_props: HeroProps) {
  const reduced = useReducedMotion();
  const float = (duration: number) =>
    reduced
      ? undefined
      : ({
          animate: { y: [0, -8, 0] as number[] },
          transition: {
            duration,
            repeat: Infinity,
            ease: "easeInOut" as const,
          },
        } as const);

  return (
    <motion.section
      className="relative overflow-hidden pt-12 pb-20 px-6 max-md:pt-8 max-md:pb-14 max-md:px-5"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="relative max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-16 items-start max-lg:gap-12">
        {/* Left column — copy. Top-aligned with the right column
            (no pt offset). */}
        <div className="relative">
          {/* HeartOutline decoration peeking near the H1 */}
          <HeartOutline
            size={22}
            color="#ED8B3F"
            className="absolute -top-1 -left-2 pointer-events-none -rotate-[8deg]"
          />
          <h1>
            <span className="block font-display font-normal text-ink leading-[0.98] tracking-[-0.035em] text-[clamp(2.75rem,6vw,5.5rem)]">
              Give with trust.
            </span>
            <span className="block mt-1 max-md:mt-2 leading-[0.95]">
              <span className="text-script-hero">
                Change a child&apos;s tomorrow.
              </span>{" "}
              <HeartOutline
                size={36}
                color="#ED8B3F"
                stroke={3}
                className="inline-block align-baseline -translate-y-3 max-md:-translate-y-2"
              />
            </span>
          </h1>
          <p className="mt-7 text-[19px] leading-[1.6] text-slate max-w-[520px]">
            OrphanGive connects verified vulnerable and orphaned children with
            donors through transparent, privacy-protected giving. Every profile
            is reviewed with care, so your support reaches a real need with
            dignity.
          </p>
          <div className="mt-4 mb-6 text-sm text-ink-soft opacity-80 flex flex-wrap gap-x-3 gap-y-1 items-center">
            <span>Verified profiles</span>
            <span aria-hidden="true" className="tracking-widest">
              •
            </span>
            <span>Privacy protected</span>
            <span aria-hidden="true" className="tracking-widest">
              •
            </span>
            <span>Transparent support</span>
          </div>
          <div className="flex gap-4 items-center flex-wrap">
            <Button href="/sponsor" variant="tangerine" size="lg">
              Support a Child →
            </Button>
            <Button href="/how-it-works" variant="white" size="lg">
              How It Works
            </Button>
          </div>
        </div>

        {/* Right column — photo collage. Explicit min-height fits
            the enlarged main + corner photos + trust card. */}
        <div
          className="relative w-full max-lg:max-w-[600px] max-lg:mx-auto"
          style={{ minHeight: 680 }}
        >
          {/* DottedArc top-left of cluster, rotated -30deg. */}
          <DottedArc
            size={110}
            color="#ED8B3F"
            dots={11}
            className="absolute -top-4 -left-4 pointer-events-none z-0"
            style={{ transform: "rotate(-30deg)" }}
          />

          {/* ConfettiDots bottom-left of cluster. */}
          <ConfettiDots
            count={10}
            area={[200, 100]}
            className="absolute -bottom-2 -left-2 pointer-events-none z-0"
          />

          {/* Main center photo — Rana (460×500). Floats at 4s. */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ width: 460, height: 500 }}
            {...(float(4) ?? {})}
          >
            <PhotoBlob
              pathKey="hero1"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490185/_OrphanGive_CG_V1__32_suehjj.png"
              alt="A child carrying a story still being written"
              ringColor="#ED8B3F"
              priority
              sizes="460px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Top-right photo — child + mother (240×240). 5s float. */}
          <motion.div
            className="absolute z-30"
            style={{ top: -10, right: -10, width: 240, height: 240 }}
            {...(float(5) ?? {})}
          >
            <PhotoBlob
              pathKey="hero2"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V1__22_in48ah.png"
              alt="A child with their mother"
              ringColor="#ED8B3F"
              sizes="240px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Bottom-right photo — supporting (280×280), shifted
              right -40px to poke past the column edge. 6s float. */}
          <motion.div
            className="absolute z-30"
            style={{ bottom: 10, right: -40, width: 280, height: 280 }}
            {...(float(6) ?? {})}
          >
            <PhotoBlob
              pathKey="hero3"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490182/_OrphanGive_CG_V1__11_pp331u.png"
              alt="A child supported by OrphanGive"
              ringColor="#ED8B3F"
              sizes="280px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Floating trust card — "Every child verified. / Every
              taka tracked." with Caveat tangerine-deep accent on
              `tracked.` */}
          <motion.div
            className="absolute z-40 bg-white rounded-2xl p-4 max-w-xs"
            style={{
              bottom: -10,
              left: 0,
              boxShadow: "var(--shadow-warm), 0 8px 24px rgba(42,42,44,0.08)",
            }}
            animate={reduced ? undefined : { scale: [1, 1.02, 1] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-tangerine shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <div className="leading-tight">
                <div className="text-sm font-medium text-ink">
                  Every child verified.
                </div>
                <div className="text-sm text-ink-soft">
                  Every taka{" "}
                  <span className="font-script text-tangerine-deep text-lg">
                    tracked.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default Hero;
