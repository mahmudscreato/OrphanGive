import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildMoment } from "@/lib/child-profile-data";

const TILE_SIZES =
  "(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw";

const BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23e8e2d8'/%3E%3C/svg%3E";

function formatTakenAt(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function MomentTile({
  moment,
  childName,
}: {
  moment: ChildMoment;
  childName: string;
}) {
  const src = directusAssetUrl(moment.photo);
  const dateLabel = formatTakenAt(moment.taken_at);
  // Use the caption (or a generic fallback) as the alt text — moments are
  // public-tier so descriptive alts are appropriate.
  const alt = moment.caption ?? `A moment from ${childName}'s journey`;
  return (
    <li className="relative aspect-square rounded-2xl overflow-hidden border border-ink/[0.05] group cursor-default">
      {src ? (
        <ProtectedChildImage
          src={src}
          alt={alt}
          width={600}
          height={600}
          sizes={TILE_SIZES}
          quality={85}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className="w-full h-full object-cover transition-transform duration-[450ms] ease-soft group-hover:scale-[1.02]"
        />
      ) : (
        <div className="child-photo-placeholder" aria-hidden="true" />
      )}
      {moment.caption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pt-[40%] bg-gradient-to-t from-ink/85 via-ink/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-[300ms] ease-soft">
          <div className="px-4 pb-4">
            <p className="font-display italic text-[14.5px] leading-snug text-cream">
              {moment.caption}
            </p>
            {dateLabel ? (
              <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-cream/70 mt-1">
                {dateLabel}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function MomentsGallery({
  childName,
  moments,
}: {
  childName: string;
  moments: ChildMoment[];
}) {
  if (moments.length === 0) return null;
  const firstName = childName.split(" ")[0];
  return (
    <section className="px-6 py-20 bg-cream max-md:py-14">
      <div className="max-w-[1320px] mx-auto">
        <div className="max-w-[640px]">
          <div className="eyebrow-tag">Moments</div>
          <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
            Moments from {firstName}&apos;s journey
          </h2>
          <p className="mt-3 text-[15px] text-slate leading-[1.65]">
            Curated by our field team. New moments added regularly.
          </p>
        </div>

        <ul className="mt-8 grid grid-cols-4 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2 max-md:gap-3">
          {moments.map((m) => (
            <MomentTile key={m.id} moment={m} childName={childName} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export default MomentsGallery;
