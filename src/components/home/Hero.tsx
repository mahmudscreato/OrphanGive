import Image from "next/image";
import { Button } from "@/components/ui/Button";

export type HeroProps = {
  listedCount: number | null;
};

export function Hero({ listedCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-cream pt-[140px] pb-20 px-6 max-md:pt-[120px] max-md:pb-16 max-md:px-5">
      {/* Faint rotated logo motif behind the hero */}
      <div
        className="logo-motif"
        aria-hidden="true"
        style={{
          top: 80,
          right: -120,
          width: 600,
          height: 600,
          opacity: 0.04,
          transform: "rotate(15deg)",
        }}
      />

      <div className="relative max-w-[1320px] mx-auto grid grid-cols-[1.1fr_1fr] gap-20 items-center max-lg:grid-cols-1 max-lg:gap-12">
        {/* Left: copy */}
        <div>
          <div className="eyebrow-tag">A sponsorship service · Bangladesh</div>
          <h1 className="font-display font-normal mt-7 text-ink leading-[0.98] tracking-[-0.035em] text-[clamp(3rem,6.5vw,6.25rem)]">
            Every child carries a{" "}
            <em className="painterly-underline italic font-light text-tangerine">
              story
            </em>
            <br />
            still being written.
          </h1>
          <p className="mt-8 text-[19px] leading-[1.6] text-slate max-w-[520px]">
            OrphanGive connects verified orphan children in Bangladesh with
            sponsors who fund their education, follow their progress, and stay
            with them for years. Not weeks. Years.
          </p>
          <div className="mt-11 flex gap-4 items-center flex-wrap">
            <Button href="/sponsor" variant="tangerine" size="lg">
              Begin a sponsorship →
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-3 text-sm font-medium text-ink py-2 group"
            >
              <span className="w-9 h-9 rounded-full bg-tangerine-soft flex items-center justify-center transition-all duration-[250ms] ease-soft group-hover:bg-tangerine group-hover:scale-[1.08]">
                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                  <path d="M3 2 L9 6 L3 10 Z" fill="currentColor" />
                </svg>
              </span>
              Watch how it works (2 min)
            </a>
          </div>
          <div className="mt-14 flex gap-8 items-center flex-wrap font-mono text-[11px] text-slate-soft tracking-[0.1em]">
            <span className="inline-flex items-center">
              <span className="inline-block w-2 h-2 bg-moss rounded-full mr-2 animate-pulse-dot" />
              Active in 11 districts
            </span>
            <span>
              {listedCount !== null
                ? `${listedCount} ${listedCount === 1 ? "child" : "children"} listed`
                : "Children listed monthly"}
            </span>
          </div>
        </div>

        {/* Right: visual */}
        <div className="relative aspect-[4/5]">
          <div
            className="logo-motif animate-gentle-bob"
            aria-hidden="true"
            style={{
              top: -20,
              right: -40,
              width: 100,
              height: 100,
            }}
          />
          <div className="absolute inset-0 rounded-[28px] overflow-hidden shadow-lift">
            {/* Cloudinary-hosted hero (Session 15b2 batch 7).
                `fill` + the wrapper's `overflow-hidden` give a clean
                crop. `priority` is correct here — this is the LCP
                image and shouldn't lazy-load. The badge below sits
                as a later sibling so it stacks above the image
                naturally without an explicit z-index. */}
            <Image
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490185/_OrphanGive_CG_V1__32_suehjj.png"
              alt="OrphanGive — a child carries a story still being written"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute top-6 left-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-cream/95 backdrop-blur-md font-mono text-[11px] tracking-[0.12em] uppercase text-ink font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-tangerine" />
              Rana · Dhaka · March 2026
            </div>
          </div>
          <div className="absolute -bottom-8 -left-8 max-w-[320px] flex items-center gap-4 bg-white rounded-[20px] py-5 px-6 shadow-lift animate-float-in max-md:left-3 max-md:max-w-[calc(100%-24px)]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-tangerine to-tangerine-deep flex items-center justify-center font-display text-[22px] text-white shrink-0">
              R
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] text-slate-soft tracking-[0.12em] uppercase">
                Just sponsored
              </div>
              <div className="font-display text-base text-ink mt-0.5">
                Rana, age 9
              </div>
              <div className="text-xs text-slate mt-0.5">
                By Mahmud K. · 12 month sponsorship
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-moss-soft flex items-center justify-center text-moss shrink-0">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 7L5.5 10.5L12 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
