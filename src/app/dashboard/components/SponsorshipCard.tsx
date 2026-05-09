// Big horizontal sponsorship card. The whole surface is a link to
// /dashboard/sponsorship/[id] except for the pending-payment variant
// where the inline action buttons need to remain independently clickable.

import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { labelForCause } from "@/lib/cause";
import { effectiveVisibility } from "@/lib/visibility";
import type { Sponsorship } from "@/lib/sponsorship-data";
import {
  SponsorshipStatusBadge,
  bottomInfo,
  childOf,
  coverageLine,
  describeConfig,
  pillVariantFor,
} from "./sponsorshipCardHelpers";

type Props = {
  s: Sponsorship;
};

export function SponsorshipCard({ s }: Props) {
  const c = childOf(s);
  const photoSrc = directusAssetUrl(c.photoId);
  const config = describeConfig(s);
  const coverage = coverageLine(s);
  const cols = bottomInfo(s);
  const variant = pillVariantFor(s);

  const cardBody = (
    <div className="flex items-stretch gap-6 max-md:flex-col max-md:gap-4">
      <div className="relative w-[120px] h-[140px] rounded-xl overflow-hidden bg-tangerine-mist shrink-0 max-md:w-full max-md:h-[180px]">
        {photoSrc ? (
          <ProtectedChildImage
            src={photoSrc}
            alt={c.name}
            width={240}
            height={280}
            quality={85}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[42px]">
            {c.name.charAt(0)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-tangerine-deep mb-1">
                {labelForCause(s.cause)}
              </div>
              <h3 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
                {c.name}
              </h3>
              <div className="mt-0.5 font-mono text-[10.5px] tracking-[0.12em] uppercase text-slate-soft">
                {[c.district, c.age != null ? `age ${c.age}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <SponsorshipStatusBadge s={s} />
          </div>
          <div className="mt-3 text-[14px] text-ink/80 leading-snug">
            {config}
          </div>
          {coverage ? (
            <div className="mt-1.5 text-[12.5px] text-slate italic leading-snug">
              {coverage}
            </div>
          ) : null}
          {effectiveVisibility(s.visibility) === "named" ? (
            <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] uppercase text-moss-deep">
              <span aria-hidden="true">●</span>
              Shown publicly
            </div>
          ) : null}
        </div>

        <div className="mt-5 pt-4 border-t border-ink/[0.06]">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {cols.map((col, i) => (
                <div key={i} className="min-w-0">
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate-soft mb-0.5">
                    {col.label}
                  </div>
                  <div className="text-ink">{col.value}</div>
                </div>
              ))}
            </div>
            {variant !== "pending" ? (
              <span className="font-body text-[12px] text-tangerine-deep underline-offset-4 group-hover:underline whitespace-nowrap">
                View details →
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (variant === "pending") {
    return (
      <li className="rounded-[18px] bg-ink/[0.025] border border-ink/[0.06] p-5 opacity-90 max-md:p-4">
        {cardBody}
      </li>
    );
  }

  const surfaceClass =
    variant === "cancelled"
      ? "rounded-[18px] bg-cream border border-ink/[0.06] p-5 opacity-80 hover:opacity-100 hover:shadow-warm transition-all max-md:p-4"
      : variant === "completed"
        ? "rounded-[18px] bg-white border border-moss/25 p-5 hover:shadow-warm transition-all max-md:p-4"
        : "rounded-[18px] bg-white border border-ink/[0.06] p-5 hover:shadow-warm transition-all max-md:p-4";

  return (
    <li>
      <Link
        href={`/dashboard/sponsorship/${s.id}`}
        className={`group block ${surfaceClass}`}
      >
        {cardBody}
      </Link>
    </li>
  );
}

export default SponsorshipCard;
