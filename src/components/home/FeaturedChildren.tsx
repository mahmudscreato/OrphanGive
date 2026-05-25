"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import {
  HandDrawnPhotoFrame,
  type FramePathKey,
} from "@/components/decorations/HandDrawnPhotoFrame";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";
import {
  type FeaturedChild,
  directusAssetUrl,
} from "@/lib/homepage-data";

// Part 5.7 Fix D.2 — each card gets a distinct near-circle
// pathKey so the row reads as four hand-cut shapes, not four
// identical ones. Cycle through if more than 4 cards.
const CARD_PATH_KEYS: FramePathKey[] = [
  "circleA",
  "circleB",
  "circleC",
  "circleD",
];

/**
 * FeaturedChildren — conversion-focused cards.
 *
 * Each card now reads as a profile-ready package:
 *   1. Organic-framed photo (HandDrawnPhotoFrame, children mode).
 *   2. Two micro trust badges directly under the photo:
 *      - Verified (shield-check, tangerine-deep on cream)
 *      - Privacy protected (lock, ink-soft on light grey)
 *   3. Full display_name (Part 5.8 Fix P1 — privacy truncation
 *      removed; the three-tier privacy model still applies to
 *      other identifying fields, but display_name is now full
 *      on Tier 1).
 *   4. Region + age meta row.
 *   5. Support category (currently a single sane default — could
 *      be wired to a Directus field later).
 *   6. Package amount line.
 *   7. Full-width orange CTA "Support [FirstName] →".
 *
 * The previous "AWAITING SPONSOR" pill on top of the photo is
 * dropped — the trust badges replace it.
 *
 * The 4-card grid is followed by an outline "Browse More
 * Children →" button (Part 5.7 Fix D.3), centered.
 */

const CARD_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px";

const BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23e8e2d8'/%3E%3C/svg%3E";

/**
 * Part 5.8 Fix P1 — `privacySafeName` removed. Per the policy
 * change confirmed by Mahmud, full `display_name` values now
 * appear on Tier 1 (public) homepage surfaces. The three-tier
 * privacy model still applies to other identifying fields
 * (school, exact location, identifying photographs, guardian-
 * approved updates) — this change is scoped to display_name only.
 *
 * Display fallback: if `display_name` is null we fall through to
 * "A child" via the same default that `firstNameOnly` uses.
 */
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
        width={600}
        height={600}
        sizes={CARD_SIZES}
        quality={85}
        preload={preload}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className="w-full h-full object-cover transition-transform duration-[800ms] ease-soft group-hover:scale-[1.06]"
      />
    );
  }
  // Part 5 Fix 3 — placeholder rebuilt. HandDrawnPhotoFrame
  // (parent) provides the organic blob shape + OG-orange brush
  // ring (matching the photo cards). Inside, we render a cream
  // background + the OG favicon mark at ~40% of the visible area
  // + a "Photo coming soon" caption. Replaces the previous
  // `.child-photo-placeholder` CSS-only div which used a flat
  // tangerine circle as the brand mark — the favicon is more
  // recognisable + scales with the blob.
  //
  // We use HandDrawnPhotoFrame (not PhotoBlob) here because it
  // accepts children, which lets us keep ProtectedChildImage's
  // watermarking on real photo cards in the sibling branch above.
  // The ring stroke color is already #ED8B3F (Part 5 Fix 3 earlier),
  // so visual consistency with hero photos is preserved.
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
        className="w-[40%] h-auto opacity-90 mb-3"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        Photo coming soon
      </span>
    </div>
  );
}

function ChildCard({
  child,
  preload,
  pathKey,
}: {
  child: FeaturedChild;
  preload: boolean;
  pathKey: FramePathKey;
}) {
  const safeName = safeDisplayName(child.display_name);
  const first = firstNameOnly(child.display_name);
  // Hotfix R1 — homepage `/` is Tier 1 (public). Show DIVISION only;
  // the prior `?? child.district` fallback could leak district when
  // region was null. district is now always null on FeaturedChild
  // (homepage-data.ts stripped from fetch), but the fallback is
  // removed here too as defense-in-depth.
  const locationLabel = child.region ?? null;
  const ageLabel = child.age !== null ? `Age ${child.age}` : null;
  const metaParts = [locationLabel, ageLabel].filter(Boolean) as string[];

  return (
    <div className="group block">
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
        </div>
      </Link>

      {/* Info block — sits directly on the canvas. */}
      <div className="px-1 pt-5">
        {/* Trust micro-badges row. */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream text-tangerine-deeper text-[11px] font-medium tracking-wide">
            <ShieldCheckIcon className="w-3 h-3" />
            Verified
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink/[0.06] text-ink-soft text-[11px] font-medium tracking-wide">
            <LockIcon className="w-3 h-3" />
            Privacy protected
          </span>
        </div>

        <h3 className="font-display font-semibold text-lg tracking-[-0.005em] text-ink inline-flex items-center gap-1">
          {safeName}
          {/* Tiny brand mark next to the name — replaces the
              prior decorative heart per Part 4 Fix 7. */}
          <EyebrowIcon className="!h-4 !w-auto !mr-0 !ml-1 opacity-80" />
        </h3>

        {metaParts.length > 0 ? (
          <div className="mt-1 text-sm text-ink-soft">
            {metaParts.join("  •  ")}
          </div>
        ) : null}

        <div className="mt-2 text-sm text-tangerine-deep font-medium">
          Education support
        </div>

        <div className="mt-2 text-base text-ink font-medium">
          From BDT 1,500/month
        </div>

        <Link
          href={`/sponsor/${child.id}`}
          className="group/cta mt-4 inline-flex items-center justify-center w-full gap-2 rounded-full bg-orange-solid text-ink font-body font-semibold py-3 px-5 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
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
    </div>
  );
}

const fcContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

const fcCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export function FeaturedChildren({
  children,
  totalListed: _totalListed,
}: {
  children: FeaturedChild[];
  totalListed: number | null;
}) {
  const reduced = useReducedMotion();
  // Fix C (tightened) — see homepage-data.ts for the server-side
  // `_nnull` filter on `Photo`. Frontend recheck:
  //   1. Reject null / undefined / empty / whitespace-only photo.
  //   2. Reject photos shorter than 8 chars (Directus UUIDs are
  //      36 chars; anything shorter is almost certainly garbage).
  //   3. Reject photos in the NEXT_PUBLIC_PLACEHOLDER_ASSET_IDS
  //      env-var blocklist so ops can exclude a known
  //      logo-as-placeholder asset without a code change.
  const placeholderIds = (
    process.env.NEXT_PUBLIC_PLACEHOLDER_ASSET_IDS ?? ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const photographed = children.filter((c) => {
    const p = c.photo;
    if (typeof p !== "string") return false;
    const trimmed = p.trim();
    if (trimmed.length < 8) return false;
    if (placeholderIds.includes(trimmed)) return false;
    return true;
  });

  return (
    <motion.section
      className="px-6 py-14 max-md:py-10"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-[1320px] mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12 max-lg:mb-10">
          <div className="text-script-md text-tangerine-deep inline-flex items-center">
            <EyebrowIcon />
            Meet some of our children
          </div>
          <h2 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-4xl lg:text-5xl">
              Verified profiles.
            </span>
            {/* Part 5 Fix 7 — force single-line on md+ via
                whitespace-nowrap. Mobile wraps naturally. Slightly
                tighter font-size cap so the line clears the
                container at typical desktop widths. */}
            <span className="block font-script text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(3rem,6vw,5.25rem)] mt-2 md:whitespace-nowrap">
              Real stories. Real care.
            </span>
          </h2>
          <p className="mt-6 text-lg text-ink-soft max-w-2xl mx-auto leading-[1.65]">
            Every child profile is reviewed before publication. Browse their
            stories with the same dignity with which we present them.
          </p>
        </div>

        {photographed.length > 0 ? (
          <motion.div
            className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-10"
            initial={reduced ? false : "hidden"}
            whileInView={reduced ? undefined : "visible"}
            viewport={{ once: true, margin: "-80px" }}
            variants={reduced ? undefined : fcContainerVariants}
          >
            {photographed.slice(0, 4).map((c, i) => (
              <motion.div
                key={c.id}
                variants={reduced ? undefined : fcCardVariants}
                whileHover={
                  reduced
                    ? undefined
                    : {
                        y: -6,
                        scale: 1.02,
                        boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                      }
                }
                transition={{ duration: 0.25 }}
              >
                <ChildCard
                  child={c}
                  preload={i < 4}
                  pathKey={CARD_PATH_KEYS[i % CARD_PATH_KEYS.length]!}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="rounded-[28px] border border-ink/[0.08] bg-white p-12 text-center text-slate">
            New profiles are being verified. Check back shortly.
          </div>
        )}

        {/* Fix 7 — stronger Browse button, replacing the previous
            outline + count link. White bg with a tangerine border,
            hovers into solid tangerine. */}
        <div className="mt-10 text-center">
          <Link
            href="/children"
            className="group/browse inline-flex items-center gap-2 rounded-full bg-white text-tangerine-deep border-[1.5px] border-tangerine px-8 py-4 font-body font-medium transition-all duration-[250ms] ease-soft hover:bg-tangerine hover:text-ink hover:shadow-warm hover:-translate-y-px"
          >
            Browse More Children
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover/browse:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

export default FeaturedChildren;
