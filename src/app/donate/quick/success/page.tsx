// feat/quick-donation — /donate/quick/success
//
// Landing page after Stripe hosted Checkout. Reads the Checkout Session
// (server-side, read-only) purely to greet the donor and prefill the
// OPTIONAL account offer with the email Stripe captured.
//
// IMPORTANT — this page NEVER mutates anything:
//   - The donation is recorded by the WEBHOOK (checkout.session.completed),
//     not here. A donor who closes the tab still gets recorded.
//   - The "create an account" offer is a PLAIN LINK to /signup with the
//     email prefilled. No account is created here, nothing is charged,
//     and there is no path that could re-charge or duplicate the gift.

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getStripe } from "@/lib/stripe-client";
import { buildPageMetadata } from "@/lib/page-metadata";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/donate/quick/success",
  title: "Thank you",
  description: "Your donation has been received.",
});

type SearchParams = Promise<{ session_id?: string | string[] }>;

function asString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function QuickDonateSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionId = asString((await searchParams).session_id);

  // Read-only lookup for the greeting + prefill. Best-effort: a failure
  // just means a slightly less personal thank-you — the donation itself
  // is already safe in the webhook's hands.
  let email: string | null = null;
  let paid = false;
  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.kind === "guest_cause") {
        email = session.customer_details?.email ?? null;
        paid = session.payment_status === "paid";
      }
    } catch {
      /* non-fatal — render the generic thank-you */
    }
  }

  const signupHref = email
    ? `/signup?email=${encodeURIComponent(email)}`
    : "/signup";

  return (
    <main className="bg-cream min-h-screen">
      <div className="px-6 py-20 max-md:py-14">
        <div className="max-w-[560px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Thank you
          </div>
          <h1 className="mt-3 font-display text-[clamp(2rem,4vw,2.75rem)] text-ink leading-[1.1] tracking-[-0.02em]">
            Your gift is on its way.
          </h1>

          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            {paid
              ? "Your payment went through."
              : "Your payment is being confirmed."}{" "}
            Stripe will email your receipt
            {email ? (
              <>
                {" "}
                to <span className="text-ink font-medium">{email}</span>
              </>
            ) : null}
            , and we&rsquo;ll send a short note about the cause you
            supported. Nothing more is needed from you.
          </p>

          <div className="mt-8 rounded-2xl border border-ink/[0.08] bg-white p-6">
            <p className="inline-flex items-center gap-2 font-display text-[18px] text-ink leading-snug">
              <CheckCircle2
                className="h-4.5 w-4.5 text-moss"
                aria-hidden="true"
              />
              Want to go further?
            </p>
            <p className="mt-2 text-[14.5px] text-slate leading-[1.6]">
              Creating an account is completely optional — your gift is
              already complete. An account just lets you follow a
              child&rsquo;s story over time if you ever choose to sponsor.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button href={signupHref} variant="primary">
                Create an account
              </Button>
              <Link
                href="/children"
                className="text-[14px] text-tangerine-deeper underline-offset-4 hover:underline"
              >
                Just browse the children →
              </Link>
            </div>
          </div>

          <p className="mt-8 text-[13px] text-slate-soft leading-[1.6]">
            Questions about your donation? Email{" "}
            <a
              href="mailto:support@orphangive.org"
              className="text-tangerine-deeper underline-offset-4 hover:underline"
            >
              support@orphangive.org
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
