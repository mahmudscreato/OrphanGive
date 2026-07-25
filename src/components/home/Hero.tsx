"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import {
  ConfettiDots,
  DottedArc,
} from "@/components/decorations/InspoDecor";

export type HeroProps = {
  listedCount: number | null;
};

// Part 5.9 Fix A.4 — small decorative OG icon in the hero.
const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

/**
 * Session 16 Part 5.10 Fix A — Hero final composition polish.
 *
 *  A.1 — Section top padding trimmed asymmetrically (pt-6
 *        lg:pt-8, pb-10 lg:pb-12). Nav already provides
 *        breathing room above; the bottom keeps a softer ramp.
 *        Goal: fit H1 + body + CTAs at 1440×900 first paint.
 *  A.2 — Main hero photo nudged ~32px left on desktop only via
 *        `lg:-translate-x-[calc(50%+32px)]` so it overlaps into
 *        the column gap. Mobile keeps the centered position.
 *  A.3 — Bottom-right secondary nudged another 20px right
 *        (-80 → -100) so the blob curve is visibly bleeding
 *        past the section edge.
 *
 *  Preserved from 5.7–5.9:
 *    - Main photo 570×620 with `broken` pathKey, z-10, 4s float
 *      + 6s breathing.
 *    - Top-right secondary 320×320 at right:-60 (Part 5.9 A.2).
 *    - Bottom-right secondary 360×360 at z-0 so main sits in
 *      front (Part 5.9 A.3 z-swap).
 *    - Small OG-icon signoff mark behind CTAs (Part 5.9 A.4).
 *    - Trust card "Safe children. / Stronger tomorrow.".
 *    - Support → /children CTA, icon-only play button.
 */
export function Hero(_props: HeroProps) {
  const reduced = useReducedMotion();

  // Combined y-float + breathing scale per photo.
  const floatBreathe = (yDuration: number) =>
    reduced
      ? undefined
      : ({
          animate: {
            y: [0, -8, 0] as number[],
            scale: [1, 1.02, 1] as number[],
          },
          transition: {
            y: {
              duration: yDuration,
              repeat: Infinity,
              ease: "easeInOut" as const,
            },
            scale: {
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut" as const,
            },
          },
        } as const);

  return (
    <motion.section
      className="relative overflow-hidden pt-6 lg:pt-8 pb-10 lg:pb-12 px-6 max-md:pt-4 max-md:pb-8 max-md:px-5"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="relative z-10 max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-16 items-center max-lg:gap-12">
        {/* Left column — copy. */}
        <div className="relative">
          <h1>
            <span className="block font-display font-normal text-ink leading-[0.98] tracking-[-0.035em] text-[clamp(2.75rem,6vw,5.5rem)]">
              Give with trust.
            </span>
            <span className="block mt-1 max-md:mt-2 leading-[0.95] text-script-hero">
              Change a child&apos;s tomorrow.
            </span>
          </h1>
          <p className="mt-7 text-[19px] leading-[1.6] text-slate max-w-[480px]">
            OrphanGive connects verified vulnerable and orphaned children with
            donors through transparent, privacy-protected giving. Every profile
            is reviewed with care, so your support reaches a real need with
            dignity.
          </p>

          {/* Part 5.6 Fix A.2 — dual-tone trust line removed. The
              trust message now lives on the right-side trust
              card (Fix B). */}

          <div className="relative mt-9 flex gap-4 items-center flex-wrap">
            {/* Part 5.9 Fix A.4 — small decorative OG icon
                tucked behind the CTAs as a signoff mark. ~100px,
                OG-orange at 30% opacity, subtle 5px drift over
                6s. Sits behind the buttons via `z-0`; CTAs sit
                in their natural flow above it. Hidden on mobile
                where vertical space is too tight. */}
            <motion.div
              className="absolute pointer-events-none z-0 max-md:hidden"
              style={{ right: -36, bottom: -22 }}
              aria-hidden="true"
              animate={reduced ? undefined : { x: [0, 5, 0], y: [0, -4, 0] }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Image
                src={FAVICON_URL}
                alt=""
                width={200}
                height={284}
                unoptimized
                className="w-[100px] h-auto opacity-30"
              />
            </motion.div>

            {/* Primary CTA → /children. */}
            <Button href="/children" variant="tangerine" size="lg">
              Support a Child →
            </Button>

            {/* feat/donate-strip — the quiet quick-donate link the founder
                couldn't find was removed here; the global DonateStrip (mounted
                in the root layout, above the footer on every page) is now the
                persistent entry to guest cause donation. */}

            {/* Icon-only circular play button with one-shot pulse
                ring on viewport entry. TODO: Mahmud to provide
                video URL; wire to modal lightbox in follow-up
                pass. */}
            <div className="relative inline-flex">
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: "2px solid #ED8B3F" }}
                aria-hidden="true"
                initial={reduced ? false : { scale: 1, opacity: 0.6 }}
                whileInView={
                  reduced ? undefined : { scale: 1.6, opacity: 0 }
                }
                transition={{ duration: 2, ease: "easeOut" }}
                viewport={{ once: true, margin: "-80px" }}
              />
              <motion.span
                className="inline-block"
                whileHover={reduced ? undefined : { scale: 1.05 }}
                whileTap={reduced ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                <Link
                  href="#how-it-works"
                  aria-label="Watch how OrphanGive works"
                  title="Watch how OrphanGive works"
                  className="group inline-flex items-center justify-center w-[52px] h-[52px] rounded-full border-2 border-[#ED8B3F] bg-transparent text-[#ED8B3F] transition-colors duration-200 hover:bg-[#ED8B3F] hover:text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="w-7 h-7"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polygon
                      points="10 8 16 12 10 16 10 8"
                      fill="currentColor"
                    />
                  </svg>
                </Link>
              </motion.span>
            </div>
          </div>
        </div>

        {/* Right column — photo collage. Part 5.9 Fix A.1 —
            column min-height drops to 700 (main photo height
            shrunk, viewport-fit goal). */}
        {/* Fix 3 + Fix 5 (mobile): below lg the right column becomes a
            clean single photo box (aspect-[5/6], a touch bigger than
            before) — the bleeding secondary photos + decorations that
            collided on small screens are hidden, leaving the main
            photo intentional and uncramped. Desktop collage unchanged. */}
        <div className="relative w-full max-lg:max-w-[440px] max-lg:mx-auto max-lg:aspect-[5/6] lg:min-h-[700px]">
          {/* DottedArc top-left, rotated -30deg. (desktop only) */}
          <DottedArc
            size={110}
            color="#ED8B3F"
            dots={11}
            className="absolute -top-4 -left-4 pointer-events-none z-0 max-lg:hidden"
            style={{ transform: "rotate(-30deg)" }}
          />

          {/* ConfettiDots bottom-left of cluster. (desktop only) */}
          <ConfettiDots
            count={10}
            area={[200, 100]}
            className="absolute -bottom-2 -left-2 pointer-events-none z-0 max-lg:hidden"
          />

          {/* Main center photo — Rana, using the `broken`
              pathKey. Part 5.10 Fix A.2 — pushed ~32px left on
              desktop so it overlaps into the column gap (more
              layered scene, less two-column slabs). Mobile keeps
              the centered position. Part 5.9 Fix A.3 — z-index
              z-10 so the bottom-right secondary (z-0) sits
              behind it. Thinner ring (10/6). 4s float + 6s
              breathing. */}
          <motion.div
            className="z-10 max-lg:absolute max-lg:inset-0 lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-y-1/2 lg:-translate-x-[calc(50%+32px)] lg:w-[570px] lg:h-[620px]"
            {...(floatBreathe(4) ?? {})}
          >
            {/* Founder direction: the MAIN hero photo keeps its
                ORIGINAL frame — the `broken` rect-derived hand-drawn
                shape with the thinner ring (10/6) it carried before
                fb4bf36. Only the main photo reverts; the two secondary
                collage photos + the rest of the site stay on the
                story1 brush. (Reverses the fb4bf36 broken→story1 swap
                for this one element.) */}
            <PhotoBlob
              pathKey="broken"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490185/_OrphanGive_CG_V1__32_suehjj.png"
              alt="A child carrying a story still being written"
              ringColor="#ED8B3F"
              outerStrokeWidth={10}
              innerStrokeWidth={6}
              priority
              sizes="(max-width: 1024px) 100vw, 570px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Top-right photo — child + mother. Part 5.9 Fix A.2
              — pushed ~40px further right (-20 → -60) so it
              half-bleeds toward the viewport edge. */}
          <motion.div
            className="absolute z-30 max-lg:hidden"
            style={{ top: 10, right: -60, width: 320, height: 320 }}
            {...(floatBreathe(5) ?? {})}
          >
            <PhotoBlob
              pathKey="story1"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V1__22_in48ah.png"
              alt="A child with their mother"
              ringColor="#ED8B3F"
              sizes="320px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Bottom-right photo — supporting. Part 5.10 Fix A.3
              — nudged another 20px right (-80 → -100) so the
              blob curve is visibly bleeding past the section's
              right edge. Sits at z-0 behind the main photo. */}
          <motion.div
            className="absolute z-0 max-lg:hidden"
            style={{ bottom: 20, right: -100, width: 360, height: 360 }}
            {...(floatBreathe(6) ?? {})}
          >
            <PhotoBlob
              pathKey="story1"
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490182/_OrphanGive_CG_V1__11_pp331u.png"
              alt="A child supported by OrphanGive"
              ringColor="#ED8B3F"
              sizes="360px"
              className="w-full h-full"
            />
          </motion.div>

          {/* Trust card — Part 5.6 Fix B: text swapped to
              "Safe children. / Stronger tomorrow." (Caveat
              tangerine accent on the second clause). */}
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
                  Safe children.
                </div>
                <div className="text-sm text-ink-soft">
                  <span className="font-script text-tangerine-deep text-lg">
                    Stronger tomorrow.
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
