"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  DottedArc,
  HeartOutline,
} from "@/components/decorations/InspoDecor";

/**
 * Session 16 Part 3 Item 9 — DignityPromise.
 *
 * Replaces the previous "Clear from the beginning." cost note
 * with the inspiration's compact "Dignity. Privacy.
 * Transparency." promise card. Single white card holding a
 * 40/60 grid: shield-heart anchor + heading on the left, a 2×2
 * checklist of brand commitments on the right. Decorative
 * DottedArc bottom-left + a small "Safe children. Stronger
 * tomorrow." caption with a heart in the top-right corner.
 *
 * Framer Motion scroll-reveal on the wrapper section.
 */

const PROMISES: string[] = [
  "We respect every child's dignity.",
  "We protect identities and personal data.",
  "We are transparent in how funds are used.",
  "We work only with trusted and vetted partners.",
];

function ShieldHeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="w-12 h-12"
    >
      <path
        d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 18 Q 8 14 8.5 11 Q 9 8.5 11 9 Q 12 9 12 11 Q 12 9 13 9 Q 15 8.5 15.5 11 Q 16 14 12 18 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckBadge() {
  return (
    <div className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-tangerine-deep mt-0.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-3.5 h-3.5"
      >
        <path
          d="M5 13l4 4L19 7"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function DignityPromise() {
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
        <div
          className="relative bg-white rounded-3xl p-12 max-md:p-8 overflow-hidden"
          style={{ boxShadow: "var(--shadow-warm), 0 10px 30px rgba(42,42,44,0.06)" }}
        >
          {/* Top-right caption with a small heart. */}
          <div className="absolute top-6 right-8 inline-flex items-center gap-2 text-xs text-ink-soft tracking-wide max-md:hidden">
            <span>Safe children. Stronger tomorrow.</span>
            <HeartOutline size={16} color="#ED8B3F" stroke={2} />
          </div>

          {/* Decorative dotted arc bottom-left. */}
          <DottedArc
            size={90}
            color="#F5B07A"
            dots={12}
            className="absolute -bottom-2 -left-2 pointer-events-none opacity-60"
          />

          <div className="relative grid grid-cols-[40fr_60fr] gap-12 items-center max-lg:grid-cols-1 max-lg:gap-8">
            {/* Left column — shield-heart anchor + heading. */}
            <div className="flex items-center gap-6 max-md:gap-4">
              <div className="shrink-0 inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-orange-pale text-tangerine-deep">
                <ShieldHeartIcon />
              </div>
              <div>
                <h2 className="font-display font-semibold text-ink leading-[1.15] tracking-[-0.015em] text-[clamp(1.75rem,3vw,2.375rem)]">
                  Dignity. Privacy. Transparency.
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  That&apos;s our promise.
                </p>
              </div>
            </div>

            {/* Right column — 2×2 checklist. */}
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              {PROMISES.map((text) => (
                <div key={text} className="flex items-start gap-3">
                  <CheckBadge />
                  <p className="text-sm text-ink leading-[1.5]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default DignityPromise;
