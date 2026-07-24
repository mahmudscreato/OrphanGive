// feat/quick-donation — /donate/quick : guest (no-account) cause donation.
//
// PUBLIC — deliberately NO auth gate (contrast with /donate, which
// redirects to /signin). A visitor picks a cause, chooses how many
// children (or a custom amount), and is handed to Stripe hosted
// Checkout by /api/donate/guest-init. Nothing is charged or computed
// client-side; the server recomputes the amount from the package.
//
// Causes come from ACTIVE one_time donation_package rows — the same
// admin-managed source /donate uses, so causes + unit prices are
// editable in /admin/donation-packages with no code change.

import { Heart } from "lucide-react";
import { listActivePackages } from "@/lib/donation-packages";
import {
  convertBdtToCurrency,
  bdtFloorToCurrencyFloor,
  getCurrencyByCode,
} from "@/lib/currency-rates";
import { buildPageMetadata } from "@/lib/page-metadata";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import {
  QuickDonateClient,
  type QuickCause,
} from "@/components/donate/QuickDonateClient";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/donate/quick",
  title: "Give in a minute",
  description:
    "Support a cause — food, school supplies, health care — for children in Bangladesh. No account needed; give in under a minute.",
});

// Matches the one-time floor used by /donate + validateCustomAmount.
const ONE_TIME_BDT_FLOOR = 500;

export default async function QuickDonatePage() {
  // Guests have no donor record, so there's no currency lock to resolve —
  // default to USD (the picker on /donate remains the place to change
  // currency for account holders).
  const [packages, rate] = await Promise.all([
    listActivePackages("one_time"),
    getCurrencyByCode("USD"),
  ]);

  const causes: QuickCause[] = rate
    ? packages.map((p) => ({
        id: p.id,
        name_en: p.name_en,
        description_en: p.description_en,
        cause_tag: p.cause_tag,
        unit_donor_amount: convertBdtToCurrency(p.amount_bdt, rate).amount,
      }))
    : [];

  const customFloor = rate
    ? bdtFloorToCurrencyFloor(ONE_TIME_BDT_FLOOR, rate)
    : ONE_TIME_BDT_FLOOR;

  return (
    <main className="bg-cream min-h-screen">
      <div className="px-6 py-16 max-md:py-12">
        <div className="max-w-[720px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Give in a minute
          </div>
          <h1 className="mt-3">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              A small gift,
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] text-[clamp(2.5rem,5vw,3.75rem)] mt-2">
              quietly delivered.
            </span>
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.65] max-w-[560px]">
            Choose what you&rsquo;d like to give toward — food, school
            supplies, health care. Your gift joins a pooled fund for that
            cause and reaches the children who need it most. No account,
            no commitment.
          </p>

          <div className="mt-10">
            <QuickDonateClient
              causes={causes}
              currencySymbol={rate?.symbol ?? "$"}
              currencyCode={rate?.currency_code ?? "USD"}
              customFloor={customFloor}
            />
          </div>

          <p className="mt-10 flex items-start gap-2 text-[13px] text-slate-soft leading-[1.6] max-w-[560px]">
            <Heart className="h-4 w-4 mt-0.5 shrink-0 text-tangerine" aria-hidden="true" />
            Want to follow one child&rsquo;s story over time instead?{" "}
            <a
              href="/children"
              className="text-tangerine-deeper underline-offset-4 hover:underline"
            >
              Meet the children waiting for a sponsor →
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
