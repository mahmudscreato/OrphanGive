// Session 58.2 — /donate/success thank-you page.
//
// Lands after successful Stripe confirmation. Reads the sponsorship
// id from ?id=… and displays a confirmation card. The sponsorship
// row may still be in 'pending_payment' when this page loads — the
// Stripe webhook flips it to 'completed' (one-time) or 'active'
// (subscription / prepaid) asynchronously, usually within seconds.
// We don't block on that here; the donor sees their amount + cause
// from the donor_currency_* columns regardless.

import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCurrentDonor } from "@/lib/donor-data";
import { getSponsorshipForDonor } from "@/lib/sponsorship-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Thank you — OrphanGive",
};

interface RawSponsorship {
  donor_currency_code?: string | null;
  donor_currency_amount?: number | string | null;
  cause_tag?: string | null;
}

export default async function DonateSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin");
  const { id } = await searchParams;
  const sponsorship = id
    ? ((await getSponsorshipForDonor(id, donor.id)) as
        | (RawSponsorship & { id: string })
        | null)
    : null;

  // Coerce decimal-as-string for donor_currency_amount (same Postgres
  // NUMERIC issue as currency_rate.bdt_per_unit).
  const donorAmount =
    sponsorship?.donor_currency_amount != null
      ? typeof sponsorship.donor_currency_amount === "number"
        ? sponsorship.donor_currency_amount
        : Number.parseFloat(String(sponsorship.donor_currency_amount))
      : null;
  const donorCurrency = sponsorship?.donor_currency_code ?? null;

  return (
    <main className="min-h-screen bg-bg-canvas">
      <div className="mx-auto max-w-xl px-5 md:px-8 py-16 md:py-24">
        <div className="rounded-3xl bg-white p-8 md:p-10 shadow-sm ring-1 ring-stone-200 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-moss-soft">
            <CheckCircle2 className="h-7 w-7 text-moss-deep" />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-ink mb-2">
            Thank you
          </h1>
          {donorAmount != null && donorCurrency ? (
            <p className="text-[15px] text-slate leading-relaxed">
              Your gift of{" "}
              <span className="font-medium text-ink">
                {donorAmount.toLocaleString()} {donorCurrency}
              </span>{" "}
              is on its way. A receipt from Stripe will arrive in your inbox
              shortly.
            </p>
          ) : (
            <p className="text-[15px] text-slate leading-relaxed">
              Your gift is on its way. A receipt from Stripe will arrive in
              your inbox shortly.
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/donate"
              className="inline-flex items-center justify-center rounded-full bg-orange-solid px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-tangerine-deep"
            >
              Give again
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-ink ring-1 ring-stone-200 hover:ring-tangerine"
            >
              View your giving
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
