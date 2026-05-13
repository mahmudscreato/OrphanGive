import Link from "next/link";

export function CharitiesBand() {
  return (
    <section className="bg-cream px-6 py-24 max-md:py-16">
      <div className="relative overflow-hidden max-w-[1320px] mx-auto rounded-[28px] py-[72px] px-16 max-md:px-7 max-md:py-12 bg-gradient-to-br from-ink to-[#1a1a1c]">
        <div
          className="logo-motif"
          aria-hidden="true"
          style={{
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            opacity: 0.08,
            transform: "rotate(15deg)",
          }}
        />
        <div className="relative grid grid-cols-[1.3fr_1fr] gap-14 items-center max-lg:grid-cols-1 max-lg:gap-10">
          <div>
            <div className="eyebrow-tag" style={{ color: "var(--tangerine-light)" }}>
              For charities
            </div>
            <h2 className="font-display font-normal mt-5 text-cream leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3.25rem)]">
              Run an orphanage? Bring it to{" "}
              <em className="italic text-tangerine">OrphanGive.</em>
            </h2>
            <p className="mt-6 text-[17px] text-cream/70 leading-[1.6] max-w-[540px]">
              OrphanGive is white-label sponsorship infrastructure. Your
              branding, your donors, your reports. Our technology, security,
              and payment rails. No setup fees. Onboarding in fourteen days.
            </p>
          </div>
          <div className="flex flex-col gap-5 items-start">
            <Link
              href="/for-charities"
              className="inline-flex items-center gap-2 font-body font-semibold rounded-full cursor-pointer transition-all duration-[250ms] ease-soft px-8 py-[17px] text-base text-ink bg-tangerine hover:bg-tangerine-light hover:shadow-[0_8px_32px_-8px_rgba(243,147,34,0.5)] hover:-translate-y-px"
            >
              Apply to host a portal →
            </Link>
            <div className="font-mono text-[11px] text-cream/50 tracking-[0.1em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-moss" />
              Currently 4 partner NGOs · 14-day onboarding average
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CharitiesBand;
