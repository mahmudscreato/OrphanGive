"use client";

import type { ReactNode } from "react";

type Props = {
  monthlyTotalUsd: number;
  oneTimeTotalUsd: number;
  bdtRate: number;
  // Children = the active Stripe form. Rendered inside the active card.
  stripeForm: ReactNode;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function formatBdt(usd: number, rate: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(usd * rate));
}

function CardLogo({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center justify-center w-9 h-6 rounded-md border border-ink/[0.08] bg-white text-[9px] font-mono font-medium text-slate uppercase">
      {name}
    </span>
  );
}

function BankLogoPlaceholder() {
  return <span className="inline-block w-12 h-5 rounded-sm bg-slate-mist/60" />;
}

function DisabledCard({
  title,
  subline,
  amountLine,
  trustLine,
  logos,
  tooltip,
}: {
  title: string;
  subline: string;
  amountLine: string;
  trustLine: string;
  logos: ReactNode;
  tooltip: string;
}) {
  return (
    <div
      title={tooltip}
      aria-disabled="true"
      className="rounded-[18px] border-[1.5px] border-ink/[0.08] bg-ink/[0.025] px-5 py-4 cursor-not-allowed opacity-60 transition-opacity hover:opacity-70"
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          disabled
          className="mt-1.5 h-4 w-4 cursor-not-allowed accent-slate-soft"
          aria-label={`${title} (coming soon)`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="font-display text-[17px] text-ink/80 leading-tight">
                {title}
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[9.5px] tracking-[0.12em] uppercase bg-ink/[0.06] text-slate-soft border border-ink/[0.08]">
                  Coming soon
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-slate-soft">{subline}</div>
            </div>
            <div className="text-[13px] text-slate font-mono">{amountLine}</div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">{logos}</div>
          <div className="mt-3 text-[11px] text-slate-soft">{trustLine}</div>
        </div>
      </div>
    </div>
  );
}

export function PaymentMethodPicker({
  monthlyTotalUsd,
  oneTimeTotalUsd,
  bdtRate,
  stripeForm,
}: Props) {
  const monthlyBdt = monthlyTotalUsd * bdtRate;
  const oneTimeBdt = oneTimeTotalUsd * bdtRate;

  // Amount preview lines for each method. bKash + SSL are BDT-priced;
  // Stripe is USD.
  const bdtLines = [
    monthlyTotalUsd > 0 ? `BDT ${formatBdt(monthlyTotalUsd, bdtRate)}/month` : null,
    oneTimeTotalUsd > 0 ? `BDT ${formatBdt(oneTimeTotalUsd, bdtRate)} one-time` : null,
  ].filter(Boolean).join(" + ");

  const usdLines = [
    monthlyTotalUsd > 0 ? `${formatUsd(monthlyTotalUsd)}/month` : null,
    oneTimeTotalUsd > 0 ? `${formatUsd(oneTimeTotalUsd)} one-time` : null,
  ].filter(Boolean).join(" + ");

  // Suppress unused vars warning when one mode is absent.
  void monthlyBdt; void oneTimeBdt;

  return (
    <section>
      <h2 className="font-display text-[22px] text-ink mb-4">Choose how to pay</h2>
      <div className="space-y-3">
        <DisabledCard
          title="bKash"
          subline="Mobile wallet · Bangladesh"
          amountLine={bdtLines || "BDT —"}
          trustLine="Secured payments with bKash"
          logos={<BankLogoPlaceholder />}
          tooltip="Coming soon — bKash integration is in progress. For now, please use International Card."
        />
        <DisabledCard
          title="Bangladeshi Card"
          subline="Local cards · BDT pricing"
          amountLine={bdtLines || "BDT —"}
          trustLine="Secured payments with SSLCommerz"
          logos={
            <>
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
            </>
          }
          tooltip="Coming soon — SSLCommerz integration arrives in 60 days."
        />

        {/* Active method: Stripe */}
        <div className="rounded-[18px] border-[1.5px] border-tangerine bg-white px-5 py-4 shadow-warm">
          <div className="flex items-start gap-3">
            <input
              type="radio"
              checked
              readOnly
              className="mt-1.5 h-4 w-4 accent-tangerine"
              aria-label="International card (selected)"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-display text-[17px] text-ink leading-tight">
                    International Card
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate">
                    Visa, Mastercard, Amex, Discover · USD
                  </div>
                </div>
                <div className="text-[13px] text-tangerine-deep font-mono">{usdLines}</div>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <CardLogo name="Visa" />
                <CardLogo name="MC" />
                <CardLogo name="Amex" />
                <CardLogo name="Disc" />
                <CardLogo name="JCB" />
              </div>
              <div className="mt-3 text-[11px] text-slate-soft">
                Secured payments with Stripe Inc.
              </div>
              <div className="mt-4">{stripeForm}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PaymentMethodPicker;
