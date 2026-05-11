import Link from "next/link";

export function StorySpread() {
  return (
    <section className="bg-cream px-6 py-40 max-md:py-24">
      <div className="max-w-[1320px] mx-auto grid grid-cols-2 gap-20 items-center max-lg:grid-cols-1 max-lg:gap-12">
        <div className="relative aspect-[4/5] rounded-[28px] overflow-hidden shadow-lift">
          <div className="story-photo-placeholder" aria-hidden="true" />
        </div>
        <div>
          <div className="eyebrow-tag">A field note · 12 March 2026</div>
          <h2 className="font-display font-normal mt-6 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3.25rem)]">
            Three years without a letter home. Then a pen.
          </h2>
          <div className="mt-5 text-sm text-slate italic">
            Reported by Asma Rahman, Field Officer · Mirpur, Dhaka
          </div>
          <p className="mt-8 text-[17px] text-slate leading-[1.7]">
            Rana arrived at the orphanage in the spring of 2023, carrying a
            small canvas bag and a notebook with three pages filled. He was
            six. His mother had died. His father, a rickshaw driver in
            Dhaka&apos;s Mirpur district, could no longer manage three children
            alone.
          </p>
          <blockquote className="my-9 pl-6 border-l-[3px] border-tangerine font-display italic text-[clamp(1.35rem,2.2vw,1.75rem)] leading-[1.4] text-ink">
            &ldquo;He hadn&apos;t sent or received anything in three years. The
            morning he held the pen, his hand shook so much I had to look
            away.&rdquo;
          </blockquote>
          <p className="text-[17px] text-slate leading-[1.7]">
            For the first months, Rana spoke very little. He carried his
            notebook to dinner, to prayers, to bed. The teacher who would
            later become his closest advocate said she was certain he was
            writing things in it that he wasn&apos;t ready to share.
          </p>
          <Link
            href="/stories"
            className="inline-flex items-center gap-2.5 mt-8 text-tangerine-deep font-medium text-[15px] border-b-[1.5px] border-tangerine pb-1 transition-[gap] duration-[250ms] ease-soft hover:gap-3.5"
          >
            Read the full story →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default StorySpread;
