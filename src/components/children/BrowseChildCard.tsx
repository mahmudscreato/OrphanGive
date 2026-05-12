"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import {
  HandDrawnPhotoFrame,
  type FramePathKey,
} from "@/components/decorations/HandDrawnPhotoFrame";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildSummary } from "@/lib/children-data";

/**
 * Session 17 — BrowseChildCard.
 *
 * Variant of the homepage `FeaturedChildren` card scaled up for the
 * dedicated `/children` browse grid. Tier 1 privacy:
 *   - Full `display_name` ✓ (Session 16 P1 policy update)
 *   - Bangladesh division (e.g. "Chittagong") ✓
 *   - Age in years ✓
 *   - District / DOB / school / guardian — NOT shown
 *
 * Card composition:
 *   1. PhotoBlob photo (varied silhouette per `pathKey`).
 *   2. Status overlay top-right (Sponsored monthly / Queue full /
 *      omitted when neither — keeps load-bearing UX from the legacy
 *      card so donors don't click into a no-op state).
 *   3. Verified + Privacy-protected micro-badges below the photo.
 *   4. Full name (Fraunces semibold).
 *   5. Division • Age meta row (ink-soft).
 *   6. Support type tag (OG-orange).
 *   7. Cost line (BDT/month).
 *   8. Full-width "Support [first name] →" CTA → /sponsor/[id].
 *
 * Click model:
 *   - Card body / photo wraps a Link → /children/[id] (profile).
 *   - "Support" button is its own Link → /sponsor/[id], rendered
 *     OUTSIDE the profile-link wrapper so the buttons don't bubble
 *     into the profile route.
 */

const CARD_SIZES = "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 440px";

const BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23e8e2d8'/%3E%3C/svg%3E";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

function safeDisplayName(display: string | null): string {
  const trimmed = display?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "A child";
}

function firstNameOnly(display: string | null): string {
  if (!display) return "a child";
  const parts = display.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "a child";
}

function ShieldCheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ChildPhoto({
  photo,
  name,
  preload,
}: {
  photo: string | null;
  name: string;
  preload: boolean;
}) {
  const src = directusAssetUrl(photo);
  if (src) {
    return (
      <ProtectedChildImage
        src={src}
        alt={name}
        width={720}
        height={720}
        sizes={CARD_SIZES}
        quality={85}
        preload={preload}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className="w-full h-full object-cover transition-transform duration-[800ms] ease-soft group-hover:scale-[1.06]"
      />
    );
  }
  // Dignified placeholder — OG favicon centered + caption.
  // Mirrors the homepage FeaturedChildren placeholder exactly.
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-cream transition-transform duration-[800ms] ease-soft group-hover:scale-[1.06]"
      aria-hidden="true"
    >
      <Image
        src={FAVICON_URL}
        alt=""
        width={120}
        height={170}
        unoptimized
        className="w-[36%] h-auto opacity-90 mb-3"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        Photo coming soon
      </span>
    </div>
  );
}

export function BrowseChildCard({
  child,
  preload,
  pathKey,
  monthlySponsored = false,
  queueFull = false,
}: {
  child: ChildSummary;
  preload: boolean;
  pathKey: FramePathKey;
  /** Active monthly sponsor exists. Card stays clickable
   * (one-time gifts welcome) but a quiet badge surfaces the state. */
  monthlySponsored?: boolean;
  /** Active sponsor + queue full (3 donors waiting). Tone shifts to
   * a muted "come back later" badge. */
  queueFull?: boolean;
}) {
  const reduced = useReducedMotion();
  const safeName = safeDisplayName(child.display_name);
  const first = firstNameOnly(child.display_name);
  // Tier 1 shows Bangladesh DIVISION (region) only, NOT district —
  // district is a level too specific for the public surface.
  const divisionLabel = child.region ?? null;
  const ageLabel = child.age !== null ? `Age ${child.age}` : null;
  const metaParts = [divisionLabel, ageLabel].filter(Boolean) as string[];

  return (
    <motion.div
      className="group block"
      whileHover={
        reduced
          ? undefined
          : { y: -6, scale: 1.02, boxShadow: "0 14px 34px rgba(0,0,0,0.08)" }
      }
      transition={{ duration: 0.25 }}
    >
      <Link
        href={`/children/${child.id}`}
        className="block"
        aria-label={`See ${safeName}'s profile`}
      >
        <div className="relative aspect-square">
          <div className="absolute inset-0">
            <HandDrawnPhotoFrame className="w-full h-full" pathKey={pathKey}>
              <ChildPhoto
                photo={child.photo}
                name={safeName}
                preload={preload}
              />
            </HandDrawnPhotoFrame>
          </div>

          {/* Status overlay top-right. Suppressed when neither
              sponsored nor queue-full so the typical "available"
              card stays clean. */}
          {queueFull ? (
            <div
              className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink/[0.08] backdrop-blur-md font-mono text-[10px] tracking-[0.1em] uppercase text-slate-soft font-medium"
              title="Sponsor queue is full. One-time gifts welcome anytime."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-soft" />
              Queue full
            </div>
          ) : monthlySponsored ? (
            <div className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-moss-soft/95 backdrop-blur-md font-mono text-[10px] tracking-[0.1em] uppercase text-moss-deep font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-moss" />
              Sponsored monthly
            </div>
          ) : null}
        </div>
      </Link>

      <div className="px-1 pt-6">
        {/* Trust micro-badges row. */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream text-tangerine-deep text-[11px] font-medium tracking-wide">
            <ShieldCheckIcon className="w-3 h-3" />
            Verified
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink/[0.06] text-ink-soft text-[11px] font-medium tracking-wide">
            <LockIcon className="w-3 h-3" />
            Privacy protected
          </span>
        </div>

        {/* Full display name — Tier 1 policy update. */}
        <Link
          href={`/children/${child.id}`}
          className="font-display font-semibold text-xl tracking-[-0.005em] text-ink hover:text-tangerine-deep transition-colors duration-200"
        >
          {safeName}
        </Link>

        {metaParts.length > 0 ? (
          <div className="mt-1 text-sm text-ink-soft">
            {metaParts.join("  •  ")}
          </div>
        ) : null}

        {/* TODO: swap to `child.support_type` / `child.monthly_cost_bdt`
            once the Directus `child` schema adds these fields.
            Mahmud's Session 17 review (decision #3) confirmed
            deferring the schema change — until then both values are
            hardcoded to the homepage defaults so every card reads
            consistently rather than randomly varying. Both belong to
            the public-tier `SAFE_FIELDS` set when added (see
            src/lib/children-data.ts). */}
        <div className="mt-3 text-sm text-tangerine-deep font-medium">
          Education support
        </div>
        <div className="mt-1 text-base text-ink font-medium">
          From BDT 1,500/month
        </div>

        {/* Support button — sits OUTSIDE the profile link wrapper so
            its click target routes to /sponsor/[id], not the profile.
            See the click-model note in the file docstring. */}
        <Link
          href={`/sponsor/${child.id}`}
          className="group/cta mt-4 inline-flex items-center justify-center w-full gap-2 rounded-full bg-orange-solid text-white font-body font-semibold py-3 px-5 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
        >
          Support {first}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 group-hover/cta:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>
    </motion.div>
  );
}

export default BrowseChildCard;
