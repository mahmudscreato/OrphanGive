import { Button } from "@/components/ui/Button";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

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

export function ProfileHero({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  const photoSrc = directusAssetUrl(child.photo);
  const subhead = pickFirstSentence(child.story);
  const educationLine = child.class_grade
    ? `Class ${child.class_grade}, ${child.education_level ?? "school"}`
    : child.education_level
      ? `${child.education_level} education`
      : null;

  return (
    <section className="relative overflow-hidden bg-cream pt-12 pb-24 px-6 max-md:pt-8 max-md:pb-16">
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
      <div className="relative max-w-[1320px] mx-auto grid grid-cols-[1fr_1.1fr] gap-20 items-center max-lg:grid-cols-1 max-lg:gap-12">
        {/* Photo */}
        <div className="relative aspect-[4/5]">
          <div className="absolute inset-0 rounded-[28px] overflow-hidden shadow-lift">
            {photoSrc ? (
              <ProtectedChildImage
                src={photoSrc}
                alt={child.display_name}
                width={800}
                height={1000}
                quality={85}
                className="w-full h-full object-cover"
                priority
              />
            ) : (
              <div className="child-photo-placeholder" aria-hidden="true" />
            )}
            <div className="absolute top-6 left-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-cream/95 backdrop-blur-md font-mono text-[11px] tracking-[0.12em] uppercase text-ink font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse-dot" />
              Awaiting sponsorship
            </div>
          </div>
          {/* Verified badge */}
          <div className="absolute -bottom-6 -right-6 max-w-[280px] flex items-center gap-3.5 bg-white rounded-[20px] px-5 py-4 shadow-lift max-md:right-3 max-md:-bottom-3">
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
        <div>
          <div className="eyebrow-tag">Awaiting sponsorship</div>
          <h1 className="font-display font-normal mt-6 text-ink leading-[0.95] tracking-[-0.04em] text-[clamp(3.5rem,7vw,6.5rem)]">
            {child.display_name}
          </h1>
          {subhead ? (
            <p className="mt-8 font-display italic text-[22px] leading-[1.5] text-ink max-w-[480px] pl-6 relative">
              <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-tangerine rounded-full" />
              &ldquo;{subhead}&rdquo;
            </p>
          ) : null}

          <div className="mt-9 flex gap-3 flex-wrap">
            {child.district ? (
              <span className="inline-flex items-center gap-2 bg-white border border-ink/[0.08] rounded-full px-4 py-2.5 text-[13px] text-ink font-medium">
                <MetaPillIcon kind="location" />
                {child.district}
                {child.region ? `, ${child.region}` : ""}
              </span>
            ) : null}
            {child.age !== null ? (
              <span className="inline-flex items-center gap-2 bg-white border border-ink/[0.08] rounded-full px-4 py-2.5 text-[13px] text-ink font-medium">
                <MetaPillIcon kind="age" />
                {child.age} years old
              </span>
            ) : null}
            {educationLine ? (
              <span className="inline-flex items-center gap-2 bg-white border border-ink/[0.08] rounded-full px-4 py-2.5 text-[13px] text-ink font-medium">
                <MetaPillIcon kind="school" />
                {educationLine}
              </span>
            ) : null}
          </div>

          <div className="mt-10 flex gap-3.5 items-center flex-wrap">
            {tier === "public" ? (
              <Button
                href={`/signin?from=/children/${child.id}`}
                variant="tangerine"
                size="lg"
              >
                Sign in to learn more →
              </Button>
            ) : (
              <Button
                href={`/sponsor/${child.id}`}
                variant="tangerine"
                size="lg"
              >
                Sponsor {child.display_name.split(" ")[0]} — from BDT 1,500/mo
              </Button>
            )}
            <Button href="#story" variant="outline">
              Read the story
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProfileHero;
