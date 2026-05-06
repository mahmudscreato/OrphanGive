import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import {
  type FeaturedChild,
  directusAssetUrl,
} from "@/lib/homepage-data";

const CARD_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px";

const BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23e8e2d8'/%3E%3C/svg%3E";

function statusLabel(status: string | null) {
  if (status === "active") return { label: "Awaiting", dot: "bg-tangerine" };
  if (status === "sponsored") return { label: "Sponsored", dot: "bg-moss" };
  return { label: "Awaiting", dot: "bg-tangerine" };
}

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
      <Image
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

function ChildCard({
  child,
  preload,
}: {
  child: FeaturedChild;
  preload: boolean;
}) {
  const { label, dot } = statusLabel(child.status);
  const name = child.display_name ?? "A child awaiting sponsorship";
  const meta = [child.region ?? child.district, child.age !== null ? `Age ${child.age}` : null].filter(
    Boolean,
  );
  return (
    <Link
      href={`/children/${child.id}`}
      className="group block bg-white rounded-[28px] overflow-hidden border border-ink/[0.05] transition-all duration-[400ms] ease-soft hover:-translate-y-1.5 hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden">
        <ChildPhoto photo={child.photo} name={name} preload={preload} />
        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream/95 backdrop-blur-md font-mono text-[10px] tracking-[0.1em] uppercase text-ink font-medium">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          {label}
        </div>
      </div>
      <div className="p-6">
        <div className="flex justify-between items-center font-mono text-[11px] text-slate tracking-[0.1em] uppercase">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
        <h3 className="font-display font-normal text-2xl tracking-[-0.01em] mt-2 text-ink">
          {name}
        </h3>
        {child.story ? (
          <p className="mt-3 font-display italic text-[14.5px] text-slate leading-[1.55] line-clamp-2">
            “{child.story}”
          </p>
        ) : null}
        <div className="mt-5 pt-4 border-t border-ink/[0.06] flex justify-between items-center">
          <div className="text-[13px] text-slate">
            From <strong className="text-ink font-semibold">BDT 1,500</strong>
            /month
          </div>
          <div className="w-8 h-8 rounded-full bg-cream flex items-center justify-center transition-all duration-[250ms] ease-soft group-hover:bg-tangerine group-hover:text-white group-hover:-rotate-45">
            →
          </div>
        </div>
      </div>
    </Link>
  );
}

export function FeaturedChildren({
  children,
  totalListed,
}: {
  children: FeaturedChild[];
  totalListed: number | null;
}) {
  return (
    <section className="bg-linen px-6 py-[140px] max-md:py-24">
      <div className="max-w-[1320px] mx-auto">
        <div className="flex justify-between items-end mb-14 gap-10 flex-wrap">
          <div className="max-w-[640px]">
            <div className="eyebrow-tag">Awaiting sponsorship</div>
            <h2 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.75rem)]">
              Three children.{" "}
              <em className="italic text-tangerine">Each one</em> a story still
              being written.
            </h2>
          </div>
          <Button href="/children" variant="outline">
            {totalListed !== null
              ? `Browse all ${new Intl.NumberFormat("en-US").format(totalListed)} children →`
              : "Browse all children →"}
          </Button>
        </div>

        {children.length > 0 ? (
          <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1">
            {children.map((c, i) => (
              <ChildCard key={c.id} child={c} preload={i < 3} />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/[0.05] bg-white p-12 text-center text-slate">
            New profiles are being verified. Check back shortly.
          </div>
        )}

        <div className="mt-14 text-center">
          <Link
            href="/children"
            className="inline-flex items-center gap-2.5 text-tangerine-deep font-medium text-[15px] border-b-[1.5px] border-tangerine pb-1 transition-[gap] duration-[250ms] ease-soft hover:gap-3.5"
          >
            View all children awaiting sponsorship →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default FeaturedChildren;
