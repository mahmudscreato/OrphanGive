import Link from "next/link";

export function EmptyDonorState() {
  return (
    <section className="rounded-[28px] bg-cream border border-ink/[0.06] px-10 py-16 text-center max-md:px-6 max-md:py-12">
      {/* Warm illustrative icon — heart with a small spark */}
      <div
        className="mx-auto w-20 h-20 rounded-full bg-tangerine-mist text-tangerine-deep flex items-center justify-center"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
          <path
            d="M12 21s-7-4.5-7-10a4 4 0 017-2.65A4 4 0 0119 11c0 5.5-7 10-7 10z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M17 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="font-display font-normal mt-7 text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.5rem)]">
        Your sponsorship journey begins here.
      </h2>
      <p className="mt-4 text-[16px] text-slate leading-[1.65] max-w-[480px] mx-auto">
        When you sponsor a child, they appear here. You&apos;ll see their
        updates, photos, and the difference your support is making — all in
        one place.
      </p>

      <div className="mt-8">
        <Link
          href="/children"
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-7 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
        >
          Browse children →
        </Link>
      </div>

      <p className="mt-6 text-[13px] text-slate-soft leading-[1.6] max-w-[440px] mx-auto">
        Each sponsorship is a relationship. Take your time finding the right
        child.
      </p>
    </section>
  );
}

export default EmptyDonorState;
