import Image from "next/image";
import Link from "next/link";
import { directusAssetUrl } from "@/lib/homepage-data";
import type { ChildUpdate } from "@/lib/child-profile-data";

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function tagClasses(type: string | null) {
  switch ((type || "").toLowerCase()) {
    case "academic":
      return "bg-moss-soft text-moss";
    case "health":
      return "bg-tangerine-soft text-tangerine-deep";
    case "letter":
      return "bg-sky/30 text-sky";
    default:
      return "bg-tangerine-mist text-tangerine-deep";
  }
}

function UpdateCard({
  u,
  variant,
}: {
  u: ChildUpdate;
  variant: "large" | "medium" | "wide";
}) {
  const photoSrc = directusAssetUrl(u.photo);
  const colSpan =
    variant === "large"
      ? "col-span-8 max-lg:col-span-12"
      : variant === "medium"
        ? "col-span-4 max-lg:col-span-12"
        : "col-span-12";
  const titleSize =
    variant === "large"
      ? "text-[1.85rem]"
      : variant === "wide"
        ? "text-[2rem]"
        : "text-[1.5rem]";
  const bg = variant === "medium" ? "bg-tangerine-mist border-transparent" : "bg-white";
  return (
    <article
      className={`group relative ${colSpan} ${bg} rounded-[28px] p-8 border border-ink/[0.05] transition-all duration-[350ms] ease-soft hover:-translate-y-1 hover:shadow-lift hover:border-tangerine-soft min-h-[260px]`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`inline-flex items-center font-mono text-[11px] font-medium tracking-[0.12em] uppercase px-3 py-1.5 rounded-full ${tagClasses(u.type)}`}
        >
          {u.type ?? "Update"}
        </span>
        <span className="font-mono text-[11px] tracking-[0.1em] text-slate-soft">
          {formatDate(u.published_at)}
        </span>
      </div>
      <h3
        className={`font-display font-normal mt-4 text-ink leading-[1.15] tracking-[-0.015em] ${titleSize}`}
      >
        {u.title}
      </h3>
      {u.preview ? (
        <p className="mt-3.5 text-[15px] text-slate leading-[1.65] max-w-[540px]">
          {u.preview}
        </p>
      ) : null}
      {photoSrc && variant === "wide" ? (
        <div className="mt-6 aspect-[16/7] relative rounded-2xl overflow-hidden border border-ink/[0.06]">
          <Image
            src={photoSrc}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1100px"
            className="object-cover"
          />
        </div>
      ) : null}
    </article>
  );
}

export function UpdatesSection({
  childName,
  updates,
}: {
  childName: string;
  updates: ChildUpdate[];
}) {
  const firstName = childName.split(" ")[0];

  if (updates.length === 0) {
    return (
      <section className="px-6 py-28 bg-cream max-md:py-20">
        <div className="max-w-[1320px] mx-auto">
          <div className="flex justify-between items-end mb-12 gap-8 flex-wrap">
            <div>
              <div className="eyebrow-tag">Recent updates</div>
              <h2 className="font-display font-normal mt-4 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
                Updates from {firstName}&apos;s journey
              </h2>
            </div>
          </div>
          <div className="rounded-[28px] border border-ink/[0.05] bg-white px-12 py-16 text-center max-md:px-6 max-md:py-10">
            <div className="font-display text-[24px] text-ink leading-tight mb-3">
              Quarterly updates will appear here once {firstName} is sponsored.
            </div>
            <p className="text-[15px] text-slate max-w-[440px] mx-auto">
              Sponsors receive school reports, photos, and the child&apos;s
              actual handwritten letters — never edited, never staged.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Bento layout: first card large, second medium, the rest wide
  const [first, second, ...rest] = updates;
  return (
    <section className="px-6 py-28 bg-cream max-md:py-20">
      <div className="max-w-[1320px] mx-auto">
        <div className="flex justify-between items-end mb-12 gap-8 flex-wrap">
          <div>
            <div className="eyebrow-tag">Recent updates</div>
            <h2 className="font-display font-normal mt-4 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
              Updates from {firstName}&apos;s journey
            </h2>
          </div>
          <Link
            href={`/children/${first.id ? "" : ""}#updates`}
            className="hidden"
            aria-hidden="true"
          />
        </div>
        <div className="grid grid-cols-12 gap-6">
          {first ? <UpdateCard u={first} variant="large" /> : null}
          {second ? <UpdateCard u={second} variant="medium" /> : null}
          {rest.map((u) => (
            <UpdateCard key={u.id} u={u} variant="wide" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default UpdatesSection;
