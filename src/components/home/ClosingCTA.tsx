"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";

/**
 * Session 16 Part 5.7 Fix G — ClosingCTA full-bleed.
 *
 *  - Outer `max-w-6xl mx-auto` wrapper + the rounded-3xl card
 *    are gone. Orange now bleeds edge-to-edge across the
 *    viewport so the section reads as a true closing band, not
 *    a card sitting on the peach canvas.
 *  - Content is centered inside an inner `max-w-6xl mx-auto`
 *    wrapper at increased vertical padding (py-20) for visual
 *    weight.
 *  - Photo URL swapped to v1778529921 per spec.
 *  - The two-column grid + photo bleed pattern is preserved.
 *
 *  Preserved from 5.5 Fix B:
 *    - PhotoBlob wrapper-div fix (no className-positioning
 *      collision).
 *    - 3-item trust badge row (Secure / Zakat / Cancel).
 *    - OG favicon icon (not heart) on the white pill CTA.
 *    - One-shot entry pulse on the CTA.
 */

const TRUST_ITEMS = [
  "Secure payment",
  "Zakat-eligible",
  "Cancel anytime",
];

const CTA_PHOTO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778529921/_OrphanGive_CG_V2_25_khxro8.png";
const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

export function ClosingCTA() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="bg-orange-solid text-white px-6 py-20 max-md:py-14 max-md:px-5 overflow-hidden"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div
        className="relative max-w-6xl mx-auto grid grid-cols-2 max-md:grid-cols-1 gap-8 max-md:gap-6 items-center"
        style={{ minHeight: 480 }}
      >
        {/* LEFT — PhotoBlob. Part 5.7 Fix G — full-bleed section
            means we don't need to push the photo past a card
            edge anymore. Photo sits inside its column with a
            small top/bottom inset so the brush ring breathes.
            Part 5.10 Fix C — mobile height reduced 380 → 300
            so the photo column doesn't squeeze the right-side
            text on 390px viewports. */}
        <div className="relative max-md:h-[300px] h-[520px]">
          {/* Wrapper div for absolute positioning — keeps
              PhotoBlob's baked `relative` class from colliding
              with positioning classes here. */}
          <div className="absolute inset-0">
            <PhotoBlob
              pathKey="story1"
              src={CTA_PHOTO}
              alt="A child supported by OrphanGive"
              ringColor="#FFFFFF"
              objectPosition="center 10%"
              sizes="(max-width: 768px) 100vw, 50vw"
              className="w-full h-full"
            />
          </div>

          {/* OG favicon watermark in the photo half. */}
          <Image
            src={FAVICON_URL}
            alt=""
            width={56}
            height={80}
            unoptimized
            aria-hidden="true"
            className="absolute top-6 right-4 w-7 h-auto opacity-50 pointer-events-none z-10"
          />
        </div>

        {/* RIGHT — heading, body, CTA, trust row. */}
        <div className="relative p-6 max-md:p-2 flex flex-col justify-center">
            <div className="relative z-10">
              <h2>
                <span className="block font-display font-normal text-white leading-[1.05] tracking-[-0.025em] text-[clamp(2.5rem,5vw,3.5rem)]">
                  Be the reason
                </span>
                <span className="block font-script text-white leading-[0.95] tracking-[-0.005em] text-[clamp(3rem,6vw,4rem)] mt-1">
                  a child smiles today.
                </span>
              </h2>
              <p className="mt-6 text-lg text-white/95 leading-[1.6] max-w-md">
                Your kindness can open doors, change lives, and build a better
                tomorrow.
              </p>

              {/* White pill CTA — OG icon mark left (replaces the
                  heart from Fix 6), arrow circle right. One-time
                  entry pulse via the absolute motion.span layer. */}
              <div className="relative inline-flex mt-8">
                <motion.span
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    boxShadow: "0 0 0 0 rgba(237,139,63,0.55)",
                  }}
                  aria-hidden="true"
                  initial={
                    reduced
                      ? false
                      : {
                          scale: 1,
                          boxShadow: "0 0 0 0 rgba(237,139,63,0.55)",
                        }
                  }
                  whileInView={
                    reduced
                      ? undefined
                      : {
                          scale: 1.15,
                          boxShadow: "0 0 0 22px rgba(237,139,63,0)",
                        }
                  }
                  transition={{ duration: 1.8, ease: "easeOut" }}
                  viewport={{ once: true, margin: "-80px" }}
                />
                <Link
                  href="/children"
                  className="relative z-10 inline-flex items-center gap-3 rounded-full bg-white text-tangerine-deep px-10 py-5 font-semibold text-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-px"
                >
                  <Image
                    src={FAVICON_URL}
                    alt=""
                    width={36}
                    height={50}
                    unoptimized
                    aria-hidden="true"
                    className="w-[18px] h-auto shrink-0"
                  />
                  <span>Support a Child Now</span>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-cream text-tangerine-deep shrink-0">
                    →
                  </span>
                </Link>
              </div>

              {/* Trust badges row — three items now (Verified
                  profiles dropped per Fix B.2). */}
              <div className="mt-10 flex gap-4 flex-wrap text-sm font-medium text-white/85 tracking-wide">
                {TRUST_ITEMS.map((t, i) => (
                  <span key={t} className="inline-flex items-center gap-4">
                    {t}
                    {i < TRUST_ITEMS.length - 1 ? (
                      <span aria-hidden="true" className="text-white/70">
                        •
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
    </motion.section>
  );
}

export default ClosingCTA;
