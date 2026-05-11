"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { HandDrawnPhotoFrame } from "@/components/decorations/HandDrawnPhotoFrame";

/**
 * Session 16 FINAL Part 2 Item 5 — Real moments band.
 *
 * Four small organic-framed photos with short field captions.
 * Sits between Promise and HowItWorks as a quiet "this is what
 * we actually do on the ground" beat — no specific child names,
 * just generic delivery contexts.
 *
 * Photos sourced from the supporting Cloudinary set provided
 * with this spec. If this section ever feels heavy / lengthens
 * the page too much, drop it from page.tsx — the rest of the
 * homepage flow doesn't depend on it.
 */

type Moment = {
  src: string;
  alt: string;
  caption: string;
};

const MOMENTS: Moment[] = [
  {
    src: "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490184/_OrphanGive_CG_V1__30_rkztod.png",
    alt: "Education delivery in Chittagong",
    caption: "Education delivery — Chittagong",
  },
  {
    src: "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490184/_OrphanGive_CG_V1__9_s75ylm.png",
    alt: "School visit in Barisal",
    caption: "School visit — Barisal",
  },
  {
    src: "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490177/_OrphanGive_CG_V1__17_p3q5wv.png",
    alt: "Care package delivery in Dhaka",
    caption: "Care package — Dhaka",
  },
  {
    src: "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V2_14_glfz6v.png",
    alt: "Field check-in in Sylhet",
    caption: "Field check-in — Sylhet",
  },
];

export function RealMoments() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-12"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-[1320px] mx-auto">
        <div className="text-center mb-10">
          <div className="text-script-md text-tangerine-deep inline-flex items-center">
            <EyebrowIcon />
            Real moments
          </div>
          <h3 className="mt-3 font-display text-3xl font-semibold text-ink tracking-[-0.015em]">
            From the field.
          </h3>
        </div>

        <div className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-lg:gap-10 max-md:grid-cols-1">
          {MOMENTS.map((m) => (
            <div key={m.src} className="flex flex-col items-center">
              <HandDrawnPhotoFrame
                src={m.src}
                alt={m.alt}
                width={280}
                height={320}
              />
              <p className="mt-5 text-sm text-ink-soft text-center tracking-wide">
                {m.caption}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

export default RealMoments;
