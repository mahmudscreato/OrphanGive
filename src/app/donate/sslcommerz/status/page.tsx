// feat/sslcommerz-phase1-guest — SSLCommerz return status page (display only).
//
// The donor lands here after SSLCommerz redirects the browser back. This page
// NEVER marks a donation paid — settlement is confirmed server-to-server by the
// IPN handler. On "success" we show a calm "payment received, receipt on its
// way" message; the IPN (which may land a moment later) is the source of truth.

import Link from "next/link";

export const metadata = {
  title: "Donation status — OrphanGive",
};

type SearchParams = Record<string, string | string[] | undefined>;

function asState(v: string | string[] | undefined): "success" | "fail" | "cancel" {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "success" || s === "fail" || s === "cancel" ? s : "fail";
}

const COPY = {
  success: {
    eyebrow: "Thank you",
    title: "Your gift is on its way.",
    body: "We've received your payment confirmation from SSLCommerz. Your receipt will arrive by email once the payment is finalized — this usually takes a few moments. Thank you for supporting children in Bangladesh.",
  },
  fail: {
    eyebrow: "Payment not completed",
    title: "That payment didn't go through.",
    body: "No charge was made. You can try again — or use an international card instead. If money left your account but you see this page, it will be automatically reversed.",
  },
  cancel: {
    eyebrow: "Payment cancelled",
    title: "You cancelled the payment.",
    body: "No charge was made. Whenever you're ready, your gift will be waiting.",
  },
} as const;

export default async function SslcommerzStatusPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = asState(sp.state);
  const copy = COPY[state];

  return (
    <div className="bg-cream">
      <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[560px] mx-auto text-center">
          <div className="eyebrow-tag">{copy.eyebrow}</div>
          <h1 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            {copy.title}
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            {copy.body}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/children"
              className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-7 py-3.5 text-[15px] transition-all hover:bg-tangerine-deep hover:shadow-warm"
            >
              Meet the children →
            </Link>
            {state !== "success" ? (
              <Link
                href="/donate/quick"
                className="text-[14px] text-tangerine-deeper underline-offset-4 hover:underline"
              >
                Try again
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
