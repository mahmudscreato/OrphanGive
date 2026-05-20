// Session 58.3 — restored + rewired to render donor-currency amounts.
//
// Same two-card structure as the original; subtitle math now uses the
// pre-converted donor amount + currency symbol instead of formatUsd.

"use client";

import {
  PAYMENT_SCHEDULE_OPTIONS,
  type PaymentSchedule,
} from "@/lib/pricing";

type Props = {
  /** Per-month amount in DONOR currency (whole units). */
  perMonthDonorAmount: number;
  durationMonths: number;
  /** Donor's currency symbol (e.g. "$"). */
  currencySymbol: string;
  /** Donor's ISO code (e.g. "USD"). */
  currencyCode: string;
  value: PaymentSchedule | null;
  onChange: (next: PaymentSchedule) => void;
};

function fmt(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString()}`;
}

export function PaymentSchedulePicker({
  perMonthDonorAmount,
  durationMonths,
  currencySymbol,
  currencyCode,
  value,
  onChange,
}: Props) {
  const total = perMonthDonorAmount * durationMonths;

  return (
    <div role="radiogroup" aria-label="Payment schedule" className="space-y-3">
      {PAYMENT_SCHEDULE_OPTIONS.map((o) => {
        const active = value === o.id;
        const subtitle = subtitleFor(
          o.id,
          perMonthDonorAmount,
          durationMonths,
          total,
          currencySymbol,
          currencyCode,
        );
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`w-full text-left rounded-[16px] px-5 py-4 transition-all duration-[200ms] ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas ${
              active
                ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="font-display text-[18px] text-ink leading-tight">
                {o.label}
              </span>
              <span className="font-display text-[18px] text-tangerine-deep leading-tight whitespace-nowrap">
                {o.id === "monthly"
                  ? `${fmt(perMonthDonorAmount, currencySymbol)} / mo`
                  : `${fmt(total, currencySymbol)} today`}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-slate leading-snug">{subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}

function subtitleFor(
  scheduleId: PaymentSchedule,
  amount: number,
  months: number,
  total: number,
  symbol: string,
  code: string,
): string {
  if (scheduleId === "monthly") {
    return `${fmt(amount, symbol)} ${code} charged each month for ${months} ${
      months === 1 ? "month" : "months"
    }.`;
  }
  return `${fmt(total, symbol)} ${code} charged today (covers all ${months} ${
    months === 1 ? "month" : "months"
  }).`;
}

export default PaymentSchedulePicker;
