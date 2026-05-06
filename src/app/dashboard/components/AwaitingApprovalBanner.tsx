export function AwaitingApprovalBanner() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-[20px] bg-[#FEF6EC] border border-tangerine-soft border-l-[4px] border-l-tangerine px-6 py-5 flex items-start gap-4 max-md:px-5 max-md:py-4"
    >
      <div className="w-10 h-10 rounded-xl bg-tangerine-soft text-tangerine-deep flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-[20px] text-ink font-medium leading-snug">
          Your account is awaiting approval.
        </h2>
        <p className="mt-1.5 text-[14.5px] text-slate leading-[1.6]">
          Our team usually approves new donors within{" "}
          <span className="text-ink">1–2 business days</span>. Once approved,
          you&apos;ll be able to sponsor children and request additional
          information. We&apos;ll email you when you&apos;re approved.
        </p>
      </div>
    </section>
  );
}

export default AwaitingApprovalBanner;
