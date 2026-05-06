import Link from "next/link";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

export function StorySection({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  if (!child.story) return null;

  const paras = child.story
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section id="story" className="px-6 py-32 bg-linen max-md:py-20">
      <div className="max-w-[760px] mx-auto">
        <div className="eyebrow-tag">About {child.display_name.split(" ")[0]}</div>
        <h2 className="font-display font-normal mt-6 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
          A story still being written.
        </h2>
        <div className="mt-12 text-[19px] text-ink leading-[1.75]">
          {paras.map((p, i) => (
            <p key={i} className="mb-7">
              {p}
            </p>
          ))}
        </div>

        {tier === "public" && child.story_truncated ? (
          <div className="mt-8 rounded-[20px] bg-white border border-ink/[0.05] px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[14.5px] text-slate leading-snug max-w-[440px]">
              You&apos;re reading the public preview. Sign in to a donor account
              to read {child.display_name.split(" ")[0]}&apos;s full story.
            </p>
            <Link
              href={`/signin?from=/children/${child.id}`}
              className="inline-flex items-center gap-2.5 text-tangerine-deep font-medium text-[14px] border-b-[1.5px] border-tangerine pb-0.5 transition-[gap] duration-[250ms] hover:gap-3.5 shrink-0"
            >
              Sign in to read the full story →
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default StorySection;
