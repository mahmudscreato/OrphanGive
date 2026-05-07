import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { Donor } from "@/lib/donor-data";
import type { DonorImpact } from "@/lib/dashboard-data";

type ChildBubble = {
  id: string;
  name: string;
  photoId: string | null;
};

type Props = {
  donor: Donor;
  impact: DonorImpact;
  // Unique active sponsored children for the montage. Empty means
  // no montage (first-time approved donors, or those whose only
  // sponsorships are completed/cancelled).
  activeChildren: ChildBubble[];
};

const QUOTES = [
  "A small act today becomes the foundation for someone's tomorrow.",
  "Every child carries a story still being written. You're helping shape the next chapter.",
  "Generosity is the bridge between what someone has and what someone needs.",
  "When kindness becomes a habit, hope becomes a future.",
  "The quiet gift of showing up is what changes the most.",
] as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickQuote(seed: string): string {
  return QUOTES[hashStr(seed) % QUOTES.length]!;
}

export function ImpactHero({ donor, impact, activeChildren }: Props) {
  const firstName =
    donor.first_name?.trim() || donor.email.split("@")[0] || "friend";
  const subline = computeSubline(impact);
  const quote = pickQuote(donor.id);
  const isFirstTime =
    !impact.hasAnyActive && !impact.hasOnlyCompletedOrCancelled;

  return (
    <section
      className="rounded-[28px] bg-ink text-cream relative overflow-hidden"
      aria-labelledby="impact-hero-heading"
    >
      <div className="px-10 py-12 max-md:px-6 max-md:py-9">
        <h1
          id="impact-hero-heading"
          className="font-display font-normal text-cream text-[32px] leading-[1.1] tracking-[-0.02em]"
        >
          Hello, {firstName}.
        </h1>
        <p className="mt-3 font-display italic text-[22px] leading-[1.35] text-cream/80 max-w-[640px]">
          {subline}
        </p>

        {activeChildren.length > 0 ? (
          <PhotoMontage bubbles={activeChildren} />
        ) : null}

        <blockquote className="mt-8 max-w-[640px] border-l-2 border-tangerine/60 pl-5">
          <p className="font-display italic text-[16px] leading-[1.55] text-cream/70">
            {quote}
          </p>
        </blockquote>

        {isFirstTime ? (
          <Link
            href="/children"
            className="inline-flex mt-8 items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-cream px-6 py-3 text-[14px] hover:bg-tangerine-deep hover:shadow-warm transition-all"
          >
            Browse children →
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function PhotoMontage({ bubbles }: { bubbles: ChildBubble[] }) {
  const VISIBLE = 5;
  const visible = bubbles.slice(0, VISIBLE);
  const extra = Math.max(0, bubbles.length - VISIBLE);

  return (
    <div className="mt-7 flex items-center gap-3">
      <div className="flex">
        {visible.map((c, i) => (
          <ChildBubbleAvatar
            key={c.id}
            bubble={c}
            offsetLeft={i === 0 ? 0 : -15}
          />
        ))}
        {extra > 0 ? (
          <div
            className="relative w-[50px] h-[50px] rounded-full bg-cream/15 border-2 border-ink flex items-center justify-center font-mono text-[11px] tracking-[0.05em] text-cream/85"
            style={{ marginLeft: -15 }}
            aria-hidden="true"
          >
            +{extra}
          </div>
        ) : null}
      </div>
      <span className="font-body text-[12.5px] text-cream/55 tracking-[0.02em]">
        {bubbles.length === 1
          ? "the child you support"
          : `the ${bubbles.length} children you support`}
      </span>
    </div>
  );
}

function ChildBubbleAvatar({
  bubble,
  offsetLeft,
}: {
  bubble: ChildBubble;
  offsetLeft: number;
}) {
  const photoSrc = directusAssetUrl(bubble.photoId);
  return (
    <div
      className="relative w-[50px] h-[50px] rounded-full overflow-hidden bg-tangerine-mist border-2 border-ink"
      style={{ marginLeft: offsetLeft }}
      title={bubble.name}
    >
      {photoSrc ? (
        <ProtectedChildImage
          src={photoSrc}
          alt={bubble.name}
          width={100}
          height={100}
          quality={85}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-tangerine-deep font-display text-[18px]">
          {bubble.name.charAt(0)}
        </div>
      )}
    </div>
  );
}

function computeSubline(impact: DonorImpact): string {
  if (!impact.hasAnyActive && !impact.hasOnlyCompletedOrCancelled) {
    return "Welcome. Take your time finding the right child for you.";
  }
  if (impact.hasOnlyCompletedOrCancelled) {
    return "Welcome back. Ready to begin again?";
  }
  if (impact.primaryActiveChildName) {
    const others = impact.totalActiveSponsorships - 1;
    if (others <= 0) {
      return `Welcome back. ${impact.primaryActiveChildName} is growing in your support.`;
    }
    return `Welcome back. ${impact.primaryActiveChildName} and ${others} ${
      others === 1 ? "other" : "others"
    } are growing in your support.`;
  }
  return "Welcome back.";
}

export default ImpactHero;
