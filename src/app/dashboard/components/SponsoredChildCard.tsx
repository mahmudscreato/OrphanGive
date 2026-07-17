// feat/donor-dashboard-home — the hero card on the returning-donor home.
//
// Deliberately MINIMAL and relationship-led: photo, name, and ONE gentle
// line about how long they've supported this child. No amounts, no
// config, no status columns — that detail lives on the dense
// VertSponsorshipCard used by /dashboard/sponsorships (which stays as-is;
// it's the management view). This card is the "who you're walking with"
// view, so it stays warm and quiet.
//
// Reuses the existing primitives: childOf() for the child bits,
// ProtectedChildImage + directusAssetUrl for the photo, and the standard
// card conventions (rounded-3xl / bg-white / border-ink/[0.06] /
// hover:shadow-warm). Nothing new invented.

import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatDurationSince } from "@/lib/dashboard-data";
import type { Sponsorship } from "@/lib/sponsorship-data";
import { childOf } from "./sponsorshipCardHelpers";

export function SponsoredChildCard({
  s,
  startedAt,
}: {
  s: Sponsorship;
  /** Earliest start across this child's sponsorships — the longest-running
   *  relationship reads truest when a donor has supported them twice. */
  startedAt: string | null;
}) {
  const c = childOf(s);
  const photoSrc = directusAssetUrl(c.photoId);
  const firstName = c.name.split(" ")[0] || c.name;
  const duration = formatDurationSince(startedAt);
  // One gentle line — never a stat. Falls back to a warm line when we
  // have no usable start date (or it's paused).
  const line =
    s.status === "paused"
      ? `Your support for ${firstName} is paused`
      : duration
        ? `You've supported ${firstName} for ${duration}`
        : `You're supporting ${firstName}`;

  return (
    <li className="h-full">
      <Link
        href={`/dashboard/sponsorship/${s.id}`}
        className="group block h-full rounded-3xl bg-white border border-ink/[0.06] overflow-hidden hover:shadow-warm transition-all"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-tangerine-mist">
          {photoSrc ? (
            <ProtectedChildImage
              src={photoSrc}
              alt={c.name}
              width={640}
              height={480}
              quality={85}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[56px]">
              {c.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          <h3 className="font-display text-[22px] text-ink leading-tight tracking-[-0.01em] m-0 group-hover:text-tangerine-deeper transition-colors">
            {c.name}
          </h3>
          <p className="mt-1.5 text-[14px] text-slate leading-snug italic">
            {line}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default SponsoredChildCard;
