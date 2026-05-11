"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import { HeartOutline } from "@/components/decorations/InspoDecor";

/**
 * Session 16 Part 3 Item 10 — ClosingCTA rebuilt as a photo-led
 * "Be the reason" band.
 *
 * Layout: orange-solid rounded-3xl band with a 2-column grid.
 * Left holds a PhotoBlob (story1 path, white brush ring) that
 * bleeds left + slightly past every other edge so it pokes into
 * the orange interior. Right holds the dual-font heading +
 * body + a white pill CTA + trust-badges row.
 *
 * A circular wreath badge sits absolute in the top-right of the
 * right column at z-0 (behind the text content at z-10),
 * carrying the Caveat "Small act. / Big impact." note + a small
 * heart. The wreath outline uses a turbulence filter so its
 * ring reads as painted, not vector-clean.
 *
 * Framer Motion: section scroll-reveal + a slow rotation on the
 * wreath for a subtle "breathing" feel. Reduced-motion
 * respected.
 */

const TRUST_ITEMS = [
  "Verified profiles",
  "Secure payment",
  "Zakat-eligible",
  "Cancel anytime",
];

const HERO_PHOTO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V2_14_glfz6v.png";

// Part 4 Fix 1 — WreathBadge removed entirely. It was sitting in
// the top-right of the right column and visually competing with
// the white "Be the reason / a child smiles today." headline
// (white-on-orange ↔ white-on-orange overlap rendered the
// headline unreadable). Moving the wreath to bottom-right
// instead would collide with the trust-badges row. Cleanest
// fix: drop it. The headline + CTA + trust badges read clearly
// on their own.

export function ClosingCTA() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-16 max-md:py-12"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-6xl mx-auto">
        <div
          className="relative grid grid-cols-2 max-md:grid-cols-1 rounded-3xl overflow-hidden bg-orange-solid text-white"
          style={{ minHeight: 480 }}
        >
          {/* LEFT — PhotoBlob that bleeds toward the orange
              interior. Negative left inset is largest so the
              photo's left edge extends past the band edge. */}
          <div className="relative max-md:h-[360px]">
            <PhotoBlob
              pathKey="story1"
              src={HERO_PHOTO}
              alt="A child smiling — the reason behind every sponsorship"
              ringColor="#FFFFFF"
              sizes="(max-width: 768px) 100vw, 50vw"
              className="absolute"
              style={{ top: -20, right: -20, bottom: -20, left: -80 }}
            />
          </div>

          {/* RIGHT — heading, body, CTA, trust row. */}
          <div className="relative p-12 max-md:p-8 flex flex-col justify-center">
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

              {/* White pill CTA — small heart left, arrow circle
                  right. */}
              <Link
                href="/sponsor"
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-white text-tangerine-deep px-10 py-5 font-semibold text-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-px"
              >
                <HeartOutline
                  size={18}
                  color="#ED8B3F"
                  stroke={2.5}
                  className="shrink-0"
                />
                <span>Support a Child Now</span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-cream text-tangerine-deep shrink-0">
                  →
                </span>
              </Link>

              {/* Trust badges row — bottom. */}
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
      </div>
    </motion.section>
  );
}

export default ClosingCTA;
