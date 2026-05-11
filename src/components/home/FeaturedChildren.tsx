import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { SketchDivider } from "@/components/decorations/Sketches";
import {
  type FeaturedChild,
  directusAssetUrl,
} from "@/lib/homepage-data";

// Session 16 — fixed-per-card tilts so the row reads like three
// Polaroids pinned at slightly different angles. Indexed by card
// position, not by child id, so the visual rhythm stays consistent
// even as featured children rotate.
const CARD_TILTS = [-1.5, 1, -0.8];

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

function ChildCard({
  child,
  preload,
  tilt,
}: {
  child: FeaturedChild;
  preload: boolean;
  tilt: number;
}) {
  const { label, dot } = statusLabel(child.status);
  const name = child.display_name ?? "A child awaiting sponsorship";
  // First name only for the handwritten label above the card —
  // mirrors how a real Polaroid might be annotated. Falls back
  // gracefully when display_name is missing.
  const firstName = (child.display_name?.trim() || "").split(/\s+/)[0] || null;
  const meta = [child.region ?? child.district, child.age !== null ? `Age ${child.age}` : null].filter(
    Boolean,
  );
  return (
    <Link
      href={`/children/${child.id}`}
      // Session 16 — per-card tilt + hover settle. Each card sits
      // like a Polaroid pinned to a corkboard. The Caveat label
      // above the card is positioned by the parent grid item.
      style={{ transform: `rotate(${tilt}deg)` }}
      className="group block bg-white rounded-[28px] overflow-hidden border border-ink/[0.05] transition-all duration-[400ms] ease-soft hover:-translate-y-1.5 hover:shadow-lift hover:rotate-0"
      data-first-name={firstName ?? undefined}
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

        {/* Session 16 — sketched divider between the heading row
            and the cards. Replaces the implicit "white space as
            separator" with a hand-drawn cue that the row is its
            own thing. */}
        <div className="mb-10 max-w-[420px]">
          <SketchDivider className="w-full h-2 text-tangerine-deep" />
        </div>
        {children.length > 0 ? (
          <div className="grid grid-cols-3 gap-y-12 gap-x-7 max-lg:grid-cols-2 max-md:grid-cols-1">
            {children.map((c, i) => {
              const firstName =
                (c.display_name?.trim() || "").split(/\s+/)[0] || null;
              // Alternate the label rotation so the row reads
              // like notes scribbled at different moments.
              const labelTilt = i % 2 === 0 ? -3 : 2;
              return (
                <div key={c.id} className="relative">
                  {firstName ? (
                    <span
                      className="absolute -top-6 left-4 font-script text-[26px] leading-none text-tangerine-deep pointer-events-none z-10"
                      style={{ transform: `rotate(${labelTilt}deg)` }}
                      aria-hidden="true"
                    >
                      {firstName}
                    </span>
                  ) : null}
                  <ChildCard
                    child={c}
                    preload={i < 3}
                    tilt={CARD_TILTS[i % CARD_TILTS.length]!}
                  />
                </div>
              );
            })}
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
