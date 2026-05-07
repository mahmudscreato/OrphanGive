// Vertical sponsorship card for the /dashboard/sponsorships grid layout.
// Same data + variants as the horizontal SponsorshipCard but optimised
// for a 3-up grid: photo on top, text and bottom info stacked beneath.

import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { Sponsorship } from "@/lib/sponsorship-data";
import {
  StatusPill,
  bottomInfo,
  childOf,
  describeConfig,
  pillVariantFor,
} from "./sponsorshipCardHelpers";

type Props = {
  s: Sponsorship;
};

export function VertSponsorshipCard({ s }: Props) {
  const c = childOf(s);
  const photoSrc = directusAssetUrl(c.photoId);
  const config = describeConfig(s);
  const cols = bottomInfo(s);
  const variant = pillVariantFor(s);

  const body = (
    <div className="flex flex-col h-full">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-tangerine-mist">
        {photoSrc ? (
          <ProtectedChildImage
            src={photoSrc}
            alt={c.name}
            width={520}
            height={400}
            quality={85}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[56px]">
            {c.name.charAt(0)}
          </div>
        )}
        <div className="absolute top-3 right-3">
          <StatusPill s={s} />
        </div>
      </div>

      <div className="flex flex-col flex-1 px-5 py-4">
        <div>
          <h3 className="font-display text-[20px] text-ink leading-tight tracking-[-0.01em] m-0">
            {c.name}
          </h3>
          <div className="mt-0.5 font-mono text-[10px] tracking-[0.12em] uppercase text-slate-soft">
            {[c.district, c.age != null ? `age ${c.age}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-2.5 text-[13px] text-ink/80 leading-snug">
            {config}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-ink/[0.06] flex flex-col gap-2">
          {cols.map((col, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-slate-soft">
                {col.label}
              </div>
              <div className="text-ink text-right">{col.value}</div>
            </div>
          ))}
        </div>

        {variant !== "pending" ? (
          <div className="mt-3 text-right">
            <span className="font-body text-[12px] text-tangerine-deep underline-offset-4 group-hover:underline">
              View details →
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (variant === "pending") {
    return (
      <li className="rounded-[18px] bg-ink/[0.025] border border-ink/[0.06] overflow-hidden opacity-90">
        {body}
      </li>
    );
  }

  const surfaceClass =
    variant === "cancelled"
      ? "rounded-[18px] bg-cream border border-ink/[0.06] overflow-hidden opacity-80 hover:opacity-100 hover:shadow-warm transition-all"
      : variant === "completed"
        ? "rounded-[18px] bg-white border border-moss/25 overflow-hidden hover:shadow-warm transition-all"
        : "rounded-[18px] bg-white border border-ink/[0.06] overflow-hidden hover:shadow-warm transition-all";

  return (
    <li className="h-full">
      <Link
        href={`/dashboard/sponsorship/${s.id}`}
        className={`group block h-full ${surfaceClass}`}
      >
        {body}
      </Link>
    </li>
  );
}

export default VertSponsorshipCard;
