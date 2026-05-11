"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import {
  BrushWash,
  ConfettiDots,
  DottedArc,
  OliveSprig,
  PenSwoosh,
} from "@/components/decorations/InspoDecor";

/**
 * Session 16 Part 3 Item 6 — AboutSection.
 *
 * Two-column layout. Left: eyebrow + dual-font H2 + lede + a
 * small partner card crediting Goodverse Foundation and
 * Children's Heaven Trust. Right: decorative photo composition
 * with BrushWash backdrop, DottedArc + OliveSprig top-right,
 * ConfettiDots + PenSwoosh bottom-left, and a center PhotoBlob
 * using the `about` blob path.
 *
 * Lives between the dignity-promise card and the closing CTA in
 * the homepage flow.
 */

const GOODVERSE_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/Goodverse_Logo_draft_wqdolh.png";
const CH_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/CH_Logo_E_gsehzj.png";
const ABOUT_PHOTO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V2_10_ppnjjm.png";

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

          {/* Partner card */}
          <div className="mt-9 inline-block bg-white rounded-2xl p-5 border border-ink/[0.08] shadow-card">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-soft mb-3 font-medium">
              A project by
            </div>
            <div className="flex items-center gap-5">
              <Image
                src={GOODVERSE_LOGO}
                alt="Goodverse Foundation"
                width={160}
                height={64}
                unoptimized
                className="h-8 w-auto"
              />
              <div className="h-8 w-px bg-ink/15" aria-hidden="true" />
              <Image
                src={CH_LOGO}
                alt="Children's Heaven Trust"
                width={160}
                height={64}
                unoptimized
                className="h-8 w-auto"
              />
            </div>
          </div>
        </div>

        {/* Right column — decorative photo composition. */}
        <div
          className="relative w-full max-lg:max-w-[560px] max-lg:mx-auto"
          style={{ height: 540 }}
        >
          {/* BrushWash backdrop fills the container at 0.7 opacity. */}
          <BrushWash
            color="#FCE4D0"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: 0.7 }}
          />

          {/* OliveSprig top-right corner, rotated -15deg. Behind
              the DottedArc so the dots read above the leaves. */}
          <OliveSprig
            size={110}
            className="absolute top-4 right-12 pointer-events-none z-10"
            style={{ transform: "rotate(-15deg)" }}
          />

          {/* DottedArc top-right, layered above the sprig. */}
          <DottedArc
            size={120}
            color="#F5B07A"
            dots={14}
            className="absolute top-2 right-2 pointer-events-none z-10"
          />

          {/* PenSwoosh bottom-left (drawn under the confetti). */}
          <PenSwoosh
            width={280}
            color="#ED8B3F"
            className="absolute bottom-6 left-4 pointer-events-none z-10"
          />

          {/* ConfettiDots bottom-left, layered above the swoosh. */}
          <ConfettiDots
            count={12}
            area={[240, 80]}
            className="absolute bottom-2 left-2 pointer-events-none z-10"
          />

          {/* Center PhotoBlob using the `about` blob path. */}
          <div
            className="absolute"
            style={{ top: 30, right: 60, bottom: 30, left: 40, zIndex: 2 }}
          >
            <PhotoBlob
              pathKey="about"
              src={ABOUT_PHOTO}
              alt="A glimpse of OrphanGive's work in Bangladesh"
              ringColor="#ED8B3F"
              sizes="(max-width: 1024px) 100vw, 600px"
              className="w-full h-full"
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default AboutSection;
