// Session 58.2 — child-scoped monthly sponsor flow, rewired off
// SPONSORSHIP_TIERS to the new donation_package + currency_rate
// system.
//
// Server component for the data fetch + access gates; the picker +
// Stripe Elements live in SponsorChildClient.
//
// Access gates preserved from the legacy flow:
//   selfActiveMonthly → viewer is the active sponsor; link to dashboard
//   monthlyLocked     → child has an active sponsor (any donor),
//                       queue feature deferred to 58.3 so we render
//                       the "already sponsored" message instead of
//                       offering a queue-join slot
//   queueJoin         → same treatment as monthlyLocked for v1 — the
//                       new endpoint doesn't yet honor trial_end +
//                       queued_starts_at. Filed for 58.3. The donor
//                       sees "already sponsored, come back later"
//                       rather than a broken queue-join button.
//
// Otherwise the picker renders monthly packages (open-ended + prepaid
// bundles mixed, sorted by display_order), donor picks one, optionally
// switches currency, clicks Continue, Stripe Elements mount inline,
// confirm → /donate/success.

import Image from "next/image";
import Link from "next/link";
import { Heart, Lock, ArrowLeft } from "lucide-react";
import {
  listActivePackages,
  type DonationPackage,
  modeForPackage,
} from "@/lib/donation-packages";
import {
  listActiveCurrencies,
  convertBdtToCurrency,
  bdtFloorToCurrencyFloor,
} from "@/lib/currency-rates";
import { resolveDonorCurrency } from "@/lib/geo-currency";
import { CurrencyPicker } from "@/components/donate/CurrencyPicker";
import {
  SponsorChildClient,
  type ClientMonthlyPackage,
} from "./SponsorChildClient";

interface ChildSummary {
  id: string;
  display_name: string;
  age: number | null;
  district: string | null;
  photo: string | null;
  story: string | null;
  story_truncated: boolean;
}

interface Props {
  child: ChildSummary;
  signedIn: boolean;
  donorState: string;
  initialCartItemCount: number;
  monthlyLocked: boolean;
  donorFirstName: string | null;
  selfActiveMonthly: {
    sponsorshipId: string;
    scheduledEndDate: string | null;
  } | null;
  queueJoin: {
    position: number;
    estimatedStartsAt: string | null;
    activeEndDate: string | null;
    donorsAhead: number;
  } | null;
  queueFullThrough: string | null;
}

export async function SponsorPageContent({
  child,
  monthlyLocked,
  selfActiveMonthly,
  queueJoin,
  queueFullThrough,
}: Props) {
  const isAlreadySponsoredByOther = Boolean(monthlyLocked || queueJoin);
  const canSponsor = !selfActiveMonthly && !isAlreadySponsoredByOther;

  const [packages, currencies, rate] = await Promise.all([
    canSponsor
      ? listActivePackages("monthly")
      : Promise.resolve([] as DonationPackage[]),
    listActiveCurrencies(),
    resolveDonorCurrency(),
  ]);

  const clientPackages: ClientMonthlyPackage[] = packages.map((p) => {
    const mode = modeForPackage(p);
    const months =
      mode === "prepaid-bundle" && p.duration_months ? p.duration_months : 1;
    const totalBdt = p.amount_bdt * months;
    const display = convertBdtToCurrency(totalBdt, rate);
    const perMonthDisplay = convertBdtToCurrency(p.amount_bdt, rate);
    return {
      id: p.id,
      mode,
      duration_months: p.duration_months,
      name_en: p.name_en,
      description_en: p.description_en,
      icon: p.icon,
      perMonthBdt: p.amount_bdt,
      perMonthDonorAmount: perMonthDisplay.amount,
      totalBdt,
      totalDonorAmount: display.amount,
    };
  });

  const monthlyFloorBdt =
    packages.length > 0 ? Math.min(...packages.map((p) => p.amount_bdt)) : 1;
  const customAmountFloor =
    packages.length > 0 ? bdtFloorToCurrencyFloor(monthlyFloorBdt, rate) : 1;

  const currencyOptions = currencies.map((c) => ({
    code: c.currency_code,
    symbol: c.symbol,
    display_name: c.display_name,
  }));

  return (
    <main className="bg-bg-canvas">
      <div className="mx-auto max-w-3xl px-5 md:px-8 py-8 md:py-12">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-tangerine-mist px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em] text-tangerine-deeper">
              <Heart className="h-3.5 w-3.5" /> Monthly sponsorship
            </p>
            <h1 className="font-serif text-3xl md:text-4xl text-ink leading-tight">
              Sponsor {child.display_name}
            </h1>
            {child.age != null || child.district ? (
              <p className="mt-2 text-[14.5px] text-slate">
                {child.age != null ? `${child.age} years old` : ""}
                {child.age != null && child.district ? " · " : ""}
                {child.district ?? ""}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 pt-2">
            <CurrencyPicker
              current={{
                code: rate.currency_code,
                symbol: rate.symbol,
                display_name: rate.display_name,
              }}
              options={currencyOptions}
              fromPath={`/sponsor/${child.id}`}
            />
          </div>
        </div>

        {child.photo ? (
          <div className="mb-7 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
            <div className="relative aspect-[16/9] w-full bg-stone-100">
              <Image
                src={child.photo}
                alt={child.display_name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 720px"
              />
            </div>
          </div>
        ) : null}

        {selfActiveMonthly ? (
          <SelfSponsoredCard
            sponsorshipId={selfActiveMonthly.sponsorshipId}
            scheduledEndDate={selfActiveMonthly.scheduledEndDate}
            childName={child.display_name}
          />
        ) : isAlreadySponsoredByOther ? (
          <AlreadySponsoredCard
            childName={child.display_name}
            comeBackAfter={queueFullThrough ?? queueJoin?.activeEndDate ?? null}
          />
        ) : (
          <SponsorChildClient
            childId={child.id}
            childName={child.display_name}
            packages={clientPackages}
            donor_currency={{ code: rate.currency_code, symbol: rate.symbol }}
            customAmountFloor={customAmountFloor}
            customAmountBdtFloor={monthlyFloorBdt}
            bdt_per_donor_unit={rate.bdt_per_unit}
          />
        )}

        <p className="mt-8 text-center text-[13px] text-ink-soft">
          <Link
            href="/children"
            className="hover:text-tangerine-deeper underline-offset-2 hover:underline"
          >
            <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
            Browse more children
          </Link>
        </p>
      </div>
    </main>
  );
}

function SelfSponsoredCard({
  sponsorshipId,
  scheduledEndDate,
  childName,
}: {
  sponsorshipId: string;
  scheduledEndDate: string | null;
  childName: string;
}) {
  return (
    <div className="rounded-3xl bg-moss-soft/40 p-6 md:p-7 ring-1 ring-moss-soft">
      <p className="font-serif text-xl text-moss-deep mb-2">
        You're already sponsoring {childName}
      </p>
      <p className="text-[14.5px] text-ink-soft mb-4">
        Thank you. Your active sponsorship continues to support {childName}.
        {scheduledEndDate
          ? ` Your fixed term runs through ${new Date(scheduledEndDate).toLocaleDateString("en-US", { dateStyle: "long" })}.`
          : ""}
      </p>
      <Link
        href={`/dashboard/sponsorship/${sponsorshipId}`}
        className="inline-flex items-center rounded-full bg-moss-deep px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
      >
        View this sponsorship
      </Link>
    </div>
  );
}

function AlreadySponsoredCard({
  childName,
  comeBackAfter,
}: {
  childName: string;
  comeBackAfter: string | null;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 md:p-7 ring-1 ring-stone-200 shadow-sm">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-tangerine-mist">
        <Lock className="h-5 w-5 text-tangerine-deep" />
      </div>
      <p className="font-serif text-xl text-ink mb-2">
        {childName} already has a sponsor
      </p>
      <p className="text-[14.5px] text-slate leading-relaxed mb-4">
        Each child has one active monthly sponsor at a time so support stays
        personal.{" "}
        {comeBackAfter
          ? `This sponsorship runs through ${new Date(comeBackAfter).toLocaleDateString("en-US", { dateStyle: "long" })} — feel free to come back then.`
          : "Please check back later, or browse other children who are waiting for a sponsor."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/children"
          className="inline-flex items-center rounded-full bg-orange-solid px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-tangerine-deep"
        >
          Browse children waiting
        </Link>
        <Link
          href="/donate"
          className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-ink ring-1 ring-stone-200 hover:ring-tangerine"
        >
          Give to a cause instead
        </Link>
      </div>
    </div>
  );
}
