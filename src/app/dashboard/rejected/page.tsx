import { signOutAction } from "@/app/(auth)/actions";

export const metadata = {
  title: "Application not approved — OrphanGive",
};

export default function RejectedPage() {
  return (
    <main className="bg-cream">
      <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[640px] mx-auto text-center">
          {/* Subtle, warm illustration — open hand */}
          <div
            className="mx-auto w-20 h-20 rounded-full bg-tangerine-mist text-tangerine-deep flex items-center justify-center"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
              <path
                d="M9 12V5a2 2 0 114 0v7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13 7a2 2 0 114 0v6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M17 9a2 2 0 114 0v3a8 8 0 01-8 8h-1a7 7 0 01-7-7V8a2 2 0 114 0v4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="font-display font-normal mt-7 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3rem)]">
            We couldn&apos;t approve your account.
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.7] max-w-[520px] mx-auto">
            Thank you for your interest in OrphanGive. Unfortunately, we
            weren&apos;t able to approve your application at this time.
          </p>
          <p className="mt-3 text-[15px] text-slate leading-[1.7] max-w-[520px] mx-auto">
            If you believe this is an error, or have questions, please contact
            us at{" "}
            <a
              href="mailto:hello@orphangive.org"
              className="text-tangerine-deep border-b border-tangerine"
            >
              hello@orphangive.org
            </a>
            .
          </p>

          <form action={signOutAction} className="mt-12">
            <button
              type="submit"
              className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-ink text-cream px-7 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine hover:shadow-warm hover:-translate-y-px"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
