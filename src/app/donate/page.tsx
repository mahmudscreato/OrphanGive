// Session 58.2 — /donate one-time gift route.
//
// Server-rendered. Loads active one_time donation_packages, the
// donor's currency rate (via geo detection or cookie), and pre-
// computes the donor-currency amount for each preset so the cards
// render the right number on first paint.
//
// The package picker + Stripe Elements live in DonateClient (client
// component). The currency picker is a thin client component that
// invokes a server action to update the cookie + revalidate.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { listActivePackages } from "@/lib/donation-packages";
import {
  listActiveCurrencies,
  convertBdtToCurrency,
  bdtFloorToCurrencyFloor,
} from "@/lib/currency-rates";
import { resolveDonorCurrencyWithLock } from "@/lib/geo-currency";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { CurrencyPicker } from "@/components/donate/CurrencyPicker";
import {
  DonateClient,
  type ClientPackage,
} from "@/components/donate/DonateClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Give to a cause — OrphanGive",
  description:
    "Make a one-time gift to a cause we support in Bangladesh — verified by Children's Heaven Trust. Choose a package, give in your local currency.",
  robots: { index: false, follow: false },
};

const ONE_TIME_BDT_FLOOR = 500;

export default async function DonatePage() {
  // Auth: donations require a signed-in approved donor. Unsigned
  // donors are bounced to sign-in with a return to /donate.
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/donate");
  const state = getDonorState(donor);
  if (state !== "approved") {
    // pending verification / pending approval / suspended → bounce to
    // dashboard which renders the appropriate gate.
    redirect("/dashboard");
  }

  // Session 58.3.2 — lock the picker to the donor's existing Stripe
  // currency when they've already transacted, so a USD-history donor
  // never sees the picker default to GBP and trip the "cannot combine
  // currencies on a single customer" Stripe error.
  const [packages, currencies, rateResult] = await Promise.all([
    listActivePackages("one_time"),
    listActiveCurrencies(),
    resolveDonorCurrencyWithLock(donor),
  ]);
  const rate = rateResult.rate;
  const currencyLocked = rateResult.locked;

  // Pre-convert each preset to donor currency on the server so the
  // first paint shows the right number (and the SSR'd HTML matches
  // what the client component renders).
  const clientPackages: ClientPackage[] = packages.map((p) => {
    const display = convertBdtToCurrency(p.amount_bdt, rate);
    return {
      id: p.id,
      name_en: p.name_en,
      description_en: p.description_en,
      amount_bdt: p.amount_bdt,
      cause_tag: p.cause_tag,
      icon: p.icon,
      donor_amount: display.amount,
    };
  });

  const customAmountFloor = bdtFloorToCurrencyFloor(ONE_TIME_BDT_FLOOR, rate);

  const currencyOptions = currencies.map((c) => ({
    code: c.currency_code,
    symbol: c.symbol,
    display_name: c.display_name,
  }));

  return (
    <main className="min-h-screen bg-bg-canvas">
      <div className="mx-auto max-w-3xl px-5 md:px-8 py-10 md:py-14">
        {/* Hero strip with currency picker */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-tangerine-mist px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em] text-tangerine-deeper">
              <Heart className="h-3.5 w-3.5" /> One-time gift
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-ink leading-tight">
              Give to a cause
            </h1>
            <p className="mt-3 max-w-xl text-[15.5px] text-slate leading-relaxed">
              Pick a cause below, or enter a custom amount. Your gift goes
              directly to children and families we serve in Bangladesh.
            </p>
          </div>
          <div className="shrink-0 pt-2">
            <CurrencyPicker
              current={{
                code: rate.currency_code,
                symbol: rate.symbol,
                display_name: rate.display_name,
              }}
              options={currencyOptions}
              fromPath="/donate"
              locked={currencyLocked}
            />
          </div>
        </div>

        {/* Section header */}
        <div className="mb-4">
          <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
            Choose a cause
          </h2>
        </div>

        <DonateClient
          packages={clientPackages}
          donor_currency={{ code: rate.currency_code, symbol: rate.symbol }}
          customAmountFloor={customAmountFloor}
          customAmountBdtFloor={ONE_TIME_BDT_FLOOR}
          bdt_per_donor_unit={rate.bdt_per_unit}
        />

        {/* Secondary link to recurring sponsorship */}
        <p className="mt-8 text-center text-[13.5px] text-ink-soft">
          Prefer a monthly commitment?{" "}
          <Link
            href="/children"
            className="text-tangerine-deeper underline-offset-2 hover:underline"
          >
            Sponsor a child monthly →
          </Link>
        </p>
      </div>
    </main>
  );
}
