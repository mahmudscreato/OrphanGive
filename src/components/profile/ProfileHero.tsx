import { Button } from "@/components/ui/Button";
import { PhotoBlob } from "@/components/profile/PhotoBlob";
import { Reveal } from "@/components/profile/Reveal";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";
// Session 50 — use the shared form-constants label helper instead of
// rendering the raw enum value (which after Session 48a's enum
// expansion would surface slugs like `primary_1_5` to donors).
// Session 52b — composeSchoolingLine collapses the prior redundant
// phrasing ("Class 7, Junior secondary (Class 6–8)") into the cleaner
// "Junior secondary, class 7" pattern.
import { composeSchoolingLine } from "@/lib/form-constants";

function MetaPillIcon({ kind }: { kind: "location" | "age" | "school" }) {
  if (kind === "location") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-tangerine">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "age") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-tangerine">
        <path d="M12 8v4l2 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-tangerine">
      <path d="M3 7v13h18V7M3 7l9-4 9 4M3 7h18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function pickFirstSentence(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  const m = trimmed.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : trimmed.slice(0, 140);
}

// Fact chip — label/value card adapted from the redesign prototype,
// rendered in OG tokens. Mono uppercase label over a Fraunces value,
// with the small tangerine meta icon. Purely presentational; the
// CALLER decides which (public-tier-safe) fields to pass.
function FactChip({
  icon,
  label,
  value,
}: {
  icon: "location" | "age" | "school";
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 bg-white border border-ink/[0.08] rounded-2xl px-4 py-2.5 shadow-[0_1px_2px_rgba(42,42,44,0.05)]">
      <MetaPillIcon kind={icon} />
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-slate-soft font-medium">
          {label}
        </span>
        <span className="font-display text-[16px] text-ink font-medium leading-tight">
          {value}
        </span>
      </span>
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
  const photoSrc = directusAssetUrl(child.photo);
  const subhead = pickFirstSentence(child.story);
  // First name for the hero headline + CTAs. For public viewers
  // `display_name` is already first_name only (P1.3); split() is a
  // backstop for non-public tiers where display_name may be fuller.
  const firstName = child.display_name.split(" ")[0]!;
  // Session 52b — single source of truth for the schooling line.
  // Empty string when both education_level and class_grade are
  // missing; we coerce to null below so the existing render-when-
  // truthy logic continues to work.
  const composed = composeSchoolingLine(
    child.education_level,
    child.class_grade,
  );
  const educationLine = composed.length > 0 ? composed : null;

  return (
    <section className="relative overflow-hidden bg-cream pt-4 pb-16 px-6 max-md:pt-2 max-md:pb-10">
      <div
        className="logo-motif"
        aria-hidden="true"
        style={{
          top: -100,
          left: -100,
          width: 500,
          height: 500,
          opacity: 0.04,
          transform: "rotate(-15deg)",
        }}
      />
      <div className="relative max-w-[1320px] mx-auto grid grid-cols-[1fr_1.15fr] gap-16 items-center max-lg:grid-cols-1 max-lg:gap-10">
        {/* Photo — organic PhotoBlob treatment (same already-public
            photo source + same ProtectedChildImage pipeline; only the
            shape changes). aspect-[4/5] keeps portrait framing; the
            blob stretches into it the way the reference does. */}
        {/* Square region so the organic blob reads ROUND (not the
            stretched egg an aspect-[4/5] box produced). object-cover
            keeps the face framed. */}
        <div className="relative aspect-square w-full max-w-[480px] mx-auto lg:max-w-[580px] lg:mx-0">
          <PhotoBlob photoSrc={photoSrc} alt={child.display_name} />
          {/* Verified badge — floats off the lower-right of the blob,
              like the reference's polaroid. */}
          <div className="absolute bottom-2 -right-2 max-w-[280px] flex items-center gap-3.5 bg-white rounded-[20px] px-5 py-4 shadow-lift max-md:right-1 max-md:bottom-1">
            <div className="w-10 h-10 rounded-full bg-moss-soft text-moss-deep flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="font-mono text-[10px] text-slate-soft tracking-[0.12em] uppercase">
                Verified by
              </div>
              <div className="font-display text-sm text-ink mt-0.5">
                Field officer team
              </div>
              <div className="text-[11px] text-slate mt-0.5">
                Children&apos;s Heaven Trust
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <Reveal>
          <div className="eyebrow-tag">Awaiting sponsorship</div>
          {/* Hero name + script accent. The name renders ONLY the
              public-tier `display_name` (= first_name for public
              viewers, per P1.3). The script accent is a universal,
              non-identifying, hopeful line — it invents no fact about
              the child. Caveat (`font-script`) over `tangerine-deep`
              for AA contrast on cream. */}
          {/* Name uses the SAME serif treatment as the sponsor-CTA
              title ("Walk with {name}…"): Fraunces, weight 400,
              tracking -0.03em. */}
          <h1 className="font-display font-normal mt-5 text-ink leading-[0.95] tracking-[-0.03em] text-[clamp(3rem,6vw,5.5rem)]">
            {firstName}
            {/* Larger script accent — the hand-drawn line is the
                dominant note here (Caveat has a small x-height, so it
                needs more px to read as big as the serif name). */}
            <span className="block font-script text-tangerine-deep leading-[0.85] tracking-normal mt-2 text-[clamp(3.5rem,7.5vw,7rem)]">
              ready to grow.
            </span>
          </h1>
          {subhead ? (
            <p className="mt-8 font-display italic text-[22px] leading-[1.5] text-ink max-w-[480px] pl-6 relative">
              <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-tangerine rounded-full" />
              &ldquo;{subhead}&rdquo;
            </p>
          ) : null}

          {/* Fact chips — label/value treatment adapted from the
              prototype, in OG tokens. Shows ONLY public-tier fields;
              gating is unchanged from the prior pills. */}
          <div className="mt-9 flex gap-3 flex-wrap">
            {/* Hotfix R1 — public viewers see DIVISION only.
                fix/donor-small-batch — DONORS now also see division
                only: the district + division composite is ADMIN-only
                (district is one level too specific for child safety
                outside the org). Defense-in-depth: child-profile-data
                returns district=null for public AND donor tiers, so
                this render gate is a backstop against a data-layer
                regression. */}
            {tier === "admin" && child.district ? (
              <FactChip
                icon="location"
                label="Location"
                value={`${child.district}${child.region ? `, ${child.region}` : ""}`}
              />
            ) : child.region ? (
              <FactChip icon="location" label="Region" value={child.region} />
            ) : null}
            {child.age !== null ? (
              <FactChip icon="age" label="Age" value={`${child.age} years`} />
            ) : null}
            {educationLine ? (
              <FactChip icon="school" label="Schooling" value={educationLine} />
            ) : null}
          </div>

          <div className="mt-10 flex gap-3.5 items-center flex-wrap">
            {tier === "public" ? (
              // fix/child-profile-support-cta — no sign-in wall. Public
              // visitors go straight into the guest one-time gift flow for
              // this child (account optional, offered after payment).
              <Button
                href={`/sponsor/${child.id}`}
                variant="tangerine"
                size="lg"
              >
                Support {firstName}
              </Button>
            ) : (
              <Button
                href={`/sponsor/${child.id}`}
                variant="tangerine"
                size="lg"
              >
                Sponsor {firstName} — from BDT 1,500/mo
              </Button>
            )}
            <Button href="#story" variant="outline">
              Read the story
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default ProfileHero;
