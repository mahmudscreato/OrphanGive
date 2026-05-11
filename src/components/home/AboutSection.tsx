"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import {
  ConfettiDots,
  DottedArc,
  PenSwoosh,
} from "@/components/decorations/InspoDecor";

/**
 * Session 16 Part 5.7 Fix E — AboutSection revert to peach.
 *
 *  - Removed the full orange bg introduced in 5.6 Fix D. Orange
 *    was meant for ClosingCTA alone; having two back-to-back
 *    orange bands (About + ClosingCTA) felt repetitive. The
 *    section now sits on the page canvas (peach) again.
 *  - Text colors reverted: white → ink, white/95 → ink-soft.
 *  - Partner card style restored (cream-on-canvas, no contrast
 *    pop needed).
 *  - Decorations recolored back to OG-orange tones from the
 *    cream/white set used over the orange bg.
 *  - PhotoBlob ring color reverts to OG orange.
 *
 *  Preserved from 5.6: `tilted` pathKey on PhotoBlob, the
 *  positioning wrapper that fixed the photo render, the linked
 *  partner logos at 3× size, the ±1deg rotation drift on the
 *  photo, the floating favicon, the dotted arc + pen-swoosh +
 *  confetti decorations (now recolored).
 */

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

const GOODVERSE_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/Goodverse_Logo_draft_wqdolh.png";
const CH_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/CH_Logo_E_gsehzj.png";
const ABOUT_PHOTO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778521851/_OrphanGive_CG_V2_10_ppnjjm.png";

const GOODVERSE_URL = "https://www.goodverse.org";
const CH_URL = "https://childrensheaventrust.org/";

export function AboutSection() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-20"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-16 items-center max-lg:gap-12">
        {/* Left column — copy + partner card. */}
        <div>
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            About OrphanGive
          </div>
          <h2 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.5rem)]">
              A bridge of hope.
            </span>
            <span
              className="block font-script text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.75rem,5.5vw,4rem)]"
              style={{ marginTop: 6 }}
            >
              A future of dignity.
            </span>
          </h2>
          <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-[520px]">
            OrphanGive is a trusted child support and donation platform
            dedicated to creating opportunities for vulnerable and orphaned
            children in Bangladesh. A project by Goodverse Foundation and
            Children&apos;s Heaven Trust, we ensure every act of giving is
            transparent, responsible, and impactful.
          </p>

          {/* Partner card — cream container on the page canvas
              (peach). Logos linked, hover-scaled. */}
          <div className="mt-10 inline-block bg-white rounded-3xl px-10 py-8 max-md:px-6 max-md:py-6 border border-ink/[0.06] shadow-md">
            <div className="text-[12px] uppercase tracking-[0.18em] text-ink-soft mb-5 font-medium">
              A project by
            </div>
            <div className="flex items-center gap-10 max-md:gap-6">
              <motion.a
                href={GOODVERSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Goodverse Foundation"
                className="inline-flex"
                whileHover={reduced ? undefined : { scale: 1.04 }}
                transition={{ duration: 0.2 }}
              >
                <Image
                  src={GOODVERSE_LOGO}
                  alt="Goodverse Foundation"
                  width={360}
                  height={180}
                  unoptimized
                  className="h-[90px] max-md:h-[64px] w-auto"
                />
              </motion.a>
              <div
                className="h-[80px] max-md:h-[60px] w-px bg-ink/15"
                aria-hidden="true"
              />
              <motion.a
                href={CH_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Children's Heaven Trust"
                className="inline-flex"
                whileHover={reduced ? undefined : { scale: 1.04 }}
                transition={{ duration: 0.2 }}
              >
                <Image
                  src={CH_LOGO}
                  alt="Children's Heaven Trust"
                  width={360}
                  height={180}
                  unoptimized
                  className="h-[90px] max-md:h-[64px] w-auto"
                />
              </motion.a>
            </div>
          </div>
        </div>

        {/* Right column — decorative photo composition. */}
        <div
          className="relative w-full max-lg:max-w-[560px] max-lg:mx-auto"
          style={{ height: 540 }}
        >
          {/* Floating OG favicon — subtle x/y drift in the
              top-right corner (replaces the green leaf). */}
          <motion.div
            className="absolute top-3 right-14 pointer-events-none z-10"
            aria-hidden="true"
            animate={reduced ? undefined : { x: [0, 4, 0], y: [0, -5, 0] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Image
              src={FAVICON_URL}
              alt=""
              width={56}
              height={80}
              unoptimized
              className="w-7 h-auto opacity-80"
            />
          </motion.div>

          {/* DottedArc top-right — OG orange on peach canvas. */}
          <DottedArc
            size={120}
            color="#ED8B3F"
            dots={14}
            className="absolute top-2 right-2 pointer-events-none z-10 opacity-80"
          />

          {/* Second smaller DottedArc — adds rhythm. */}
          <DottedArc
            size={70}
            color="#ED8B3F"
            dots={8}
            className="absolute top-20 right-20 pointer-events-none z-10 opacity-60"
            style={{ transform: "rotate(40deg)" }}
          />

          {/* PenSwoosh bottom-left — tangerine-deep brushstroke. */}
          <PenSwoosh
            width={280}
            color="#C95A18"
            className="absolute bottom-6 left-4 pointer-events-none z-10 opacity-70"
          />

          {/* ConfettiDots bottom-left. */}
          <ConfettiDots
            count={12}
            area={[240, 80]}
            className="absolute bottom-2 left-2 pointer-events-none z-10 opacity-90"
          />

          {/* Center PhotoBlob — Part 5.6 D.2 render fix preserved.
              Part 5.7 Fix E — ring reverts to OG orange. */}
          <motion.div
            className="absolute"
            style={{ top: 30, right: 60, bottom: 30, left: 40, zIndex: 2 }}
            animate={reduced ? undefined : { rotate: [-1, 1, -1] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <PhotoBlob
              pathKey="tilted"
              src={ABOUT_PHOTO}
              alt="A glimpse of OrphanGive's work in Bangladesh"
              ringColor="#ED8B3F"
              outerStrokeWidth={12}
              innerStrokeWidth={7}
              objectPosition="center 15%"
              sizes="(max-width: 1024px) 100vw, 600px"
              className="w-full h-full"
            />
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default AboutSection;
