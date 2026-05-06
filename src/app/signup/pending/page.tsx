import Link from "next/link";

export const metadata = {
  title: "Account awaiting approval — OrphanGive",
};

export default function PendingPage() {
  return (
    <main className="bg-cream">
      <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[640px] mx-auto text-center">
          <div
            className="mx-auto w-16 h-16 rounded-full bg-moss-soft text-moss flex items-center justify-center"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
              <path
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="font-display font-normal mt-7 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.5rem)]">
            Email verified.
          </h1>
          <p className="mt-5 text-[18px] text-slate leading-[1.65] max-w-[520px] mx-auto">
            Your account is awaiting our team&apos;s approval. This usually
            takes <span className="text-ink font-medium">1–2 business days</span>.
            We&apos;ll email you when you&apos;re approved.
          </p>
          <p className="mt-3 text-[15px] text-slate-soft leading-[1.65] max-w-[520px] mx-auto">
            Until then, you can browse children&apos;s profiles. You won&apos;t
            be able to sponsor or request additional information until approval
            comes through.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/children"
              className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-8 py-[15px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
            >
              Browse children →
            </Link>
            <Link
              href="/signin"
              className="text-[14px] text-slate hover:text-tangerine-deep transition-colors underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
