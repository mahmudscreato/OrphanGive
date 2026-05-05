import Link from "next/link";

export function Promise() {
  return (
    <section className="relative overflow-hidden bg-linen px-6 py-[140px] max-md:py-24">
      <div
        className="logo-motif"
        aria-hidden="true"
        style={{
          bottom: -100,
          left: -80,
          width: 320,
          height: 320,
          opacity: 0.06,
          transform: "rotate(-25deg)",
        }}
      />
      <div className="relative max-w-[1100px] mx-auto grid grid-cols-[5fr_6fr] gap-20 items-start max-lg:grid-cols-1 max-lg:gap-12">
        <h2 className="font-display font-light italic text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4vw,3.75rem)]">
          We are not a giving service.
          <br />
          We are a{" "}
          <strong className="font-normal not-italic text-tangerine">
            long-form
          </strong>
          <br />
          relationship.
        </h2>
        <div className="pt-3 text-[18px] leading-[1.7] text-slate">
          <p className="mb-6">
            Most charity sites are checkout flows wrapped in emotion. You give.
            You get a receipt. The page reloads.
          </p>
          <p className="mb-6">
            OrphanGive is a long-form commitment. Choose a child. Sponsor them
            monthly. Receive their actual school reports, their actual photos,
            their actual letters in their actual handwriting. Watch them grow
            up.
          </p>
          <p className="font-display italic text-[22px] text-ink leading-[1.5] mb-6">
            It is the smallest possible thing. It is the largest possible
            thing. We are between.
          </p>
          <Link
            href="/about/mission"
            className="inline-flex items-center gap-2.5 mt-4 text-tangerine-deep font-medium text-[15px] border-b-[1.5px] border-tangerine pb-1 transition-[gap] duration-[250ms] ease-soft hover:gap-3.5"
          >
            Read our manifesto →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default Promise;
