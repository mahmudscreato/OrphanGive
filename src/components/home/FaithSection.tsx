import Link from "next/link";

export function FaithSection() {
  return (
    <section className="relative overflow-hidden text-center px-6 py-[140px] max-md:py-24 bg-gradient-to-b from-linen to-sand">
      <div
        className="logo-motif"
        aria-hidden="true"
        style={{
          top: -50,
          left: "50%",
          width: 300,
          height: 300,
          opacity: 0.05,
          transform: "translateX(-50%)",
        }}
      />
      <div className="relative max-w-[800px] mx-auto">
        <div className="eyebrow-tag justify-center mb-6">
          On Zakat &amp; Sadaqah
        </div>
        <h2 className="font-display font-light italic text-ink leading-[1.3] tracking-[-0.015em] text-[clamp(1.75rem,3.5vw,2.75rem)]">
          &ldquo;The believer&apos;s shade on the Day of Judgement
          <br className="max-md:hidden" />
          {" "}will be their charity.&rdquo;
        </h2>
        <p className="mt-8 text-[17px] text-slate leading-[1.7]">
          Monthly orphan sponsorship can be structured to be zakat-eligible.
          Sustained giving — sadaqah jariyah — earns reward for the giver as
          long as the benefit continues. We make both explicit and easy.
          Whether a particular structure qualifies for your zakat depends on
          personal circumstances; we encourage consulting a qualified scholar.
        </p>
        <Link
          href="/zakat-sadaqah"
          className="inline-flex items-center gap-2.5 mt-8 text-tangerine-deep font-medium text-[15px] border-b-[1.5px] border-tangerine pb-1"
        >
          Learn more about giving →
        </Link>
      </div>
    </section>
  );
}

export default FaithSection;
