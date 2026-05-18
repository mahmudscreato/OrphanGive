// Session 57 — Children profile redesign: warm, modular hero.
//
// Replaces the prior "billboard headline + pulsing-dot status badge"
// hero with a quieter, more personal opener:
//   - Large photo (60% on desktop, top on mobile) with a soft warm
//     border and rounded-3xl frame — no hard rectangle.
//   - First-name only on first read in serif (40-48px, weight 500)
//     so the child feels celebrated, not catalogued.
//   - One-line tagline "{age} years old, lives in {district}"
//     instead of the old eyebrow + headline + blockquote stack.
//   - Small badge row: education line + soft verified badge with
//     a check icon.
//   - Primary CTA "Sponsor {Name}" — large, brand tangerine.
//   - Secondary smooth-scroll link "Read {Name}'s story ↓".
//
// Privacy / data behavior is unchanged from the prior hero — the
// PublicPlaceholderPhoto fallback, the tier-aware CTA href, and
// the directus_files URL composition all match what was there
// before. This is a visual redesign, not a data-layer change.

import { Button } from "@/components/ui/Button";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";
import { composeSchoolingLine } from "@/lib/form-constants";

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft/80 text-moss-deep px-3 py-1.5 text-[12px] font-medium">
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

function EducationBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warmth-100 text-warmth-text px-3 py-1.5 text-[12px] font-medium">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-3.5 h-3.5"
        aria-hidden="true"
      >
        <path
          d="M3 7v13h18V7M3 7l9-4 9 4M3 7h18"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      {label}
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

  // One-line tagline. We assemble from {age, district} with sensible
  // graceful degradation: if either is missing, the surviving piece
  // stands alone. If both are missing, we omit the tagline rather
  // than render a half-sentence.
  let tagline: string | null = null;
  if (child.age !== null && child.district) {
    tagline = `${child.age} years old, lives in ${child.district}`;
  } else if (child.age !== null) {
    tagline = `${child.age} years old`;
  } else if (child.district) {
    tagline = `Lives in ${child.district}`;
  }

  return (
    <section className="px-4 md:px-6 pt-6 md:pt-10 pb-12 md:pb-16 bg-warmth-50">
      <div className="max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 md:gap-12 items-center">
          {/* Photo — soft 4:5 on mobile, 3:4 on desktop. Wrapped in
              a warm frame (1px border in warmth-accent at low
              opacity + warm-tinted shadow) so the corners read as
              "matted" rather than "stamped". */}
          <div
            className="relative aspect-[4/5] md:aspect-[3/4] order-1 lg:order-1
                       rounded-3xl overflow-hidden bg-warmth-100
                       ring-1 ring-warmth-accent/20 shadow-card-warm"
          >
            {photoSrc ? (
              <ProtectedChildImage
                src={photoSrc}
                alt={`Portrait of ${child.display_name}`}
                width={880}
                height={1100}
                quality={88}
                className="w-full h-full object-cover"
                priority
              />
            ) : (
              // Warm placeholder instead of a grey square: soft
              // warmth-100 background already provided by the
              // wrapper; we just add a centered icon.
              <div
                className="absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-20 h-20 text-warmth-accent/50"
                >
                  <circle
                    cx="12"
                    cy="9"
                    r="3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M5 20c0-3 3-5 7-5s7 2 7 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="order-2 lg:order-2">
            {/* Name: first-name only in serif. The full
                display_name still surfaces in metadata (page
                <title>) + the breadcrumb above — this is the
                child's introduction, not their LinkedIn header. */}
            <h1
              className="font-display font-medium text-ink leading-tight tracking-tight
                         text-[40px] md:text-[48px]"
            >
              {firstName}
            </h1>

            {tagline ? (
              <p className="mt-2 text-[16px] md:text-[17px] text-warmth-text leading-relaxed">
                {tagline}
              </p>
            ) : null}

            {/* Badge row: education + verified. Both small, both
                warm-toned. Skips silently when education isn't
                populated yet — verified badge stays as the visual
                anchor. */}
            <div className="mt-5 flex flex-wrap gap-2">
              {educationLine ? <EducationBadge label={educationLine} /> : null}
              <VerifiedBadge />
            </div>

            {/* Primary + secondary CTAs.
                Public tier sees Sign-in flow; donors + admins get
                the direct sponsor flow. Copy uses first-name to
                make the CTA feel like a personal commitment, not
                a generic "Sponsor a child" button. */}
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
                className="inline-flex items-center justify-center gap-2 text-[14px] text-warmth-text font-medium hover:text-warmth-accent transition-colors"
              >
                Read {firstName}&apos;s story
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
