// Session 57.1 — Profile hero with OG brand vocabulary.
//
// Discovery from this session: the homepage already ships every
// vocabulary piece this hero needs — PhotoBlob (organic-blob
// photo with brushed turbulent ring), InspoDecor primitives
// (DottedArc / ConfettiDots / OliveSprig / BrushWash) for the
// hand-drawn decorations, the `.text-script-hero` Caveat
// utility, and the OG favicon Cloudinary URL as a signoff stamp.
// This hero composes those existing parts rather than introducing
// new primitives.
//
// What changed from Session 57:
//   - PhotoBlob (`broken` path) replaces the rectangle frame.
//   - Photo container constrained to `max-h-[70vh]`, with
//     aspect-[4/5] on mobile and aspect-[3/4] on desktop — name +
//     CTAs no longer get pushed below the fold on a 1366×768.
//   - 2-part h1: serif "{Name}'s" + Caveat-script "story." (or
//     "dream." when the story alludes to an aspiration).
//   - DottedArc + ConfettiDots + BrushWash placed behind the
//     photo (homepage decoration density), all aria-hidden.
//   - Metric strip (Age / District / With us since / Class)
//     replacing the pill row. Falls back gracefully when one of
//     the cells has no data.
//   - Small OG-icon stamp tucked next to the Verified pill.
//   - When `priority_support === 'urgent'`, an extra warm
//     "Urgent need" pill renders alongside Verified — colored
//     via the new NEED_COLOR_MAP.

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
import {
  ConfettiDots,
  DottedArc,
  BrushWash,
} from "@/components/decorations/InspoDecor";
import { directusAssetUrl } from "@/lib/homepage-data";
import { composeSchoolingLine, getNeedColor } from "@/lib/form-constants";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

// Cloudinary OG mark — same asset the homepage Hero uses as a
// signoff stamp. Imported as a string constant rather than a
// module so this hero can stay a server component (no `use client`).
const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

/**
 * Decide the script-accent word that closes the h1. If the
 * child's story alludes to an aspiration ("wants to be …",
 * "dreams of …", "hopes to …"), we lead with "dream." for a
 * warmer emotional read. Otherwise the safe default is "story."
 */
function pickScriptWord(story: string | null): string {
  if (!story) return "story.";
  const lower = story.toLowerCase();
  if (
    lower.includes("wants to be") ||
    lower.includes("dreams of") ||
    lower.includes("hopes to") ||
    lower.includes("aspires") ||
    lower.includes("dream")
  ) {
    return "dream.";
  }
  return "story.";
}

/**
 * One cell in the metric-strip. Mobile collapses to a 2×2 grid;
 * desktop renders 4-up (or 3-up when one cell is missing). The
 * label is a small uppercase font-mono tag in warm-grey, value
 * is the brand serif in ink.
 */
function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-warmth-text/70">
        {label}
      </p>
      <p className="mt-1 font-display font-semibold text-[20px] md:text-[22px] text-ink leading-snug">
        {value}
      </p>
    </div>
  );
}

function VerifiedPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft/80 text-moss-deep
                 px-3 py-1.5 text-[12px] font-medium"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-3.5 h-3.5"
        aria-hidden="true"
      >
        <path
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Verified profile
    </span>
  );
}

export function ProfileHero({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const photoSrc = directusAssetUrl(child.photo);
  const educationLine = composeSchoolingLine(
    child.education_level,
    child.class_grade,
  );
  const scriptWord = pickScriptWord(child.story);

  // ─── Metric strip values ──────────────────────────────────────
  // Each cell only renders if its source field is populated; the
  // grid auto-collapses (3-up or 2-up) so the row never has a
  // visible blank.
  type Metric = { label: string; value: string };
  const metrics: Metric[] = [];
  if (child.age !== null) {
    metrics.push({ label: "Age", value: `${child.age}` });
  }
  if (child.district) {
    metrics.push({ label: "District", value: child.district });
  }
  // "With us since" — best available proxy for the original
  // reference's wording is `birth_year`-derived "since {year}",
  // but that's the wrong semantic. Without a dedicated
  // intake/onboarding date on the donor profile shape, we omit
  // this cell and render 3-up. Documented for follow-up: surface
  // child.submission_date (Tier 3) into a Tier 1 "verified since"
  // approximation when the schema audit allows.
  if (educationLine) {
    metrics.push({ label: "Class", value: educationLine });
  }

  // Metric grid layout: 2-col on mobile (always), then mirrors
  // count on desktop. 4-up → grid-cols-4, 3-up → grid-cols-3.
  const metricGridDesktop =
    metrics.length >= 4
      ? "md:grid-cols-4"
      : metrics.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";

  // ─── Urgent-need pill (priority_support === 'urgent') ─────────
  // Uses the new NEED_COLOR_MAP under the `healthcare` keying so
  // an urgent-need pill picks up the same peach palette as the
  // healthcare bucket. This is intentional: urgency reads as a
  // softer red-orange than the default tangerine.
  const showUrgentPill =
    (child.priority_support || "").toLowerCase() === "urgent";
  const urgentColor = getNeedColor("healthcare");

  return (
    <section
      className="relative overflow-hidden bg-warmth-50
                 pt-8 md:pt-12 pb-12 md:pb-16 px-4 md:px-6"
    >
      {/* ─── Decorations that don't depend on the photo column ──
          DottedArc lives high-right of the *content container*.
          ConfettiDots tucks under the bottom edge as the homepage
          Hero does. Both `max-md:hidden` to keep mobile airy.
          BrushWash now lives INSIDE the photo column (below) so
          it actually backdrops the photo rather than floating
          at the viewport edge. */}
      <DottedArc
        color="var(--orange-solid)"
        size={200}
        className="absolute top-10 right-[6%] pointer-events-none max-lg:hidden"
        style={{ opacity: 0.4, transform: "rotate(14deg)" }}
      />
      {/* ConfettiDots auto-generates from its own brand palette
          (CONFETTI_PALETTE inside InspoDecor.tsx); it takes
          `count` + `area` rather than a `color` prop. */}
      <ConfettiDots
        count={12}
        area={[180, 120]}
        className="absolute bottom-4 left-6 pointer-events-none max-md:hidden"
        style={{ opacity: 0.55 }}
      />

      <div className="relative max-w-[1180px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 md:gap-12 items-center">
          {/* ─── Photo: PhotoBlob with brand orange ring ────────
              Session 57.2 fix:
              The outer wrapper is `relative` and sized by the
              aspect-ratio utility on a `w-full max-w-[420px]`
              constraint. Inside, BrushWash sits absolute behind
              everything so the photo gets a soft peach backdrop
              (matches the homepage hero/about wash pattern).
              The PhotoBlob is given `w-full h-full` (NOT
              `absolute inset-0`, which the prior session passed
              and which lost the cascade — `relative` declared
              later in Tailwind's stylesheet won over `absolute`,
              collapsing the blob to 0×0 and rendering an empty
              column. The homepage Hero uses the same w-full
              h-full pattern.) */}
          <div className="order-1 relative w-full max-w-[420px] lg:max-w-[460px] mx-auto lg:mx-0 aspect-[4/5] md:aspect-[3/4]">
            {/* Backdrop wash — bleeds past the blob's edges to
                give it a soft peach halo. Pure decoration. */}
            <BrushWash
              color="var(--orange-soft)"
              className="absolute -top-8 -right-8 w-[120%] h-[60%] pointer-events-none max-md:hidden"
              style={{ opacity: 0.35 }}
            />
            <PhotoBlob
              pathKey="broken"
              src={photoSrc ?? undefined}
              alt={`Portrait of ${child.display_name}`}
              ringColor="#ED8B3F"
              fallbackGrad={["#FAEFE0", "#F9D4B1"]}
              priority
              objectPosition="center 18%"
              sizes="(max-width: 768px) 90vw, 460px"
              className="relative z-10 w-full h-full"
            />
          </div>

          {/* ─── Content ──────────────────────────────────────── */}
          <div className="order-2 relative">
            {/* Two-part headline: serif possessive + Caveat-script
                accent. Sizes mirror the homepage's text-script-hero
                / Fraunces pairing but trimmed down a couple of
                steps so a profile page reads more intimate than a
                marketing band. */}
            <h1 className="leading-[0.95]">
              <span className="block font-display font-medium text-ink text-[44px] md:text-[56px] tracking-tight">
                {firstName}&apos;s{" "}
                <span
                  className="font-script font-normal text-tangerine-deep
                             text-[52px] md:text-[68px]"
                >
                  {scriptWord}
                </span>
              </span>
            </h1>

            {/* Optional urgent + always-present verified pill.
                The OG favicon stamp sits to the right of the
                Verified pill — small, peach, decorative. */}
            <div className="mt-5 flex items-center gap-2 flex-wrap">
              {showUrgentPill ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full
                              px-3 py-1.5 text-[12px] font-medium
                              ${urgentColor.bg} ${urgentColor.text}
                              ring-1 ${urgentColor.ring}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Urgent need
                </span>
              ) : null}
              <VerifiedPill />
              <Image
                src={FAVICON_URL}
                alt=""
                width={26}
                height={26}
                className="opacity-70"
                aria-hidden="true"
              />
            </div>

            {/* Metric strip — 2x2 on mobile, 3- or 4-up on
                desktop depending on which cells have data. */}
            {metrics.length > 0 ? (
              <div
                className={`mt-7 md:mt-8 grid grid-cols-2 ${metricGridDesktop} gap-x-6 gap-y-4 md:gap-x-8`}
              >
                {metrics.map((m) => (
                  <MetricCell key={m.label} label={m.label} value={m.value} />
                ))}
              </div>
            ) : null}

            {/* CTAs — primary tangerine, secondary scroll link. */}
            <div className="mt-7 md:mt-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              {tier === "public" ? (
                <Button
                  href={`/signin?from=/children/${child.id}`}
                  variant="tangerine"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Sign in to sponsor {firstName}
                </Button>
              ) : (
                <Button
                  href={`/sponsor/${child.id}`}
                  variant="tangerine"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Sponsor {firstName}
                </Button>
              )}
              <a
                href="#story"
                className="inline-flex items-center justify-center gap-2 text-[14px] text-warmth-text font-medium hover:text-tangerine-deeper transition-colors"
              >
                Read {firstName}&apos;s {scriptWord.replace(".", "")}
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProfileHero;
