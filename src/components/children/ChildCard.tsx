import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildSummary } from "@/lib/children-data";

const CARD_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px";

const BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23e8e2d8'/%3E%3C/svg%3E";

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
  return (
    <div
      className="child-photo-placeholder transition-transform duration-[800ms] ease-soft group-hover:scale-[1.06]"
      aria-hidden="true"
    />
  );
}

export function ChildCard({
  child,
  preload = false,
}: {
  child: ChildSummary;
  preload?: boolean;
}) {
  const name = child.display_name ?? "A child awaiting sponsorship";
  const districtLine = child.district ?? child.region ?? null;
  const ageLine = child.age !== null ? `Age ${child.age}` : null;
  return (
    <Link
      href={`/children/${child.id}`}
      className="group block bg-white rounded-[28px] overflow-hidden border border-ink/[0.05] transition-all duration-[400ms] ease-soft hover:-translate-y-1.5 hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden">
        <ChildPhoto photo={child.photo} name={name} preload={preload} />
        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream/95 backdrop-blur-md font-mono text-[10px] tracking-[0.1em] uppercase text-ink font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-tangerine" />
          Awaiting
        </div>
      </div>
      <div className="p-6">
        <div className="flex justify-between items-center font-mono text-[11px] text-slate tracking-[0.1em] uppercase">
          {districtLine ? <span>{districtLine}</span> : <span />}
          {ageLine ? <span>{ageLine}</span> : null}
        </div>
        <h3 className="font-display font-normal text-2xl tracking-[-0.01em] mt-2 text-ink">
          {name}
        </h3>
        {child.story_preview ? (
          <p className="mt-3 font-display italic text-[14.5px] text-slate leading-[1.55]">
            “{child.story_preview}”
          </p>
        ) : null}
        <div className="mt-5 pt-4 border-t border-ink/[0.06] flex justify-between items-center">
          <span className="text-[13px] font-medium text-tangerine-deep">
            Begin to sponsor →
          </span>
          <span className="w-8 h-8 rounded-full bg-cream flex items-center justify-center transition-all duration-[250ms] ease-soft group-hover:bg-tangerine group-hover:text-white group-hover:-rotate-45">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default ChildCard;
