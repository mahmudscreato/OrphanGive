"use client";

import {
  formatUsd,
  PAYMENT_SCHEDULE_OPTIONS,
  type PaymentSchedule,
} from "@/lib/pricing";

type Props = {
  amountUsd: number;
  durationMonths: number;
  value: PaymentSchedule | null;
  onChange: (next: PaymentSchedule) => void;
};

// Two-card picker shown after the donor selects a fixed-term duration.
// Subtitles are computed from amount × months so the donor sees the
// concrete numbers ("$25 charged each month for 6 months" vs "$150
// charged today").
export function PaymentSchedulePicker({
  amountUsd,
  durationMonths,
  value,
  onChange,
}: Props) {
  const total = amountUsd * durationMonths;

  return (
    <div role="radiogroup" aria-label="Payment schedule" className="space-y-3">
      {PAYMENT_SCHEDULE_OPTIONS.map((o) => {
        const active = value === o.id;
        const subtitle = subtitleFor(o.id, amountUsd, durationMonths, total);
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`w-full text-left rounded-[16px] px-5 py-4 transition-all duration-[200ms] ease-soft ${
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
                  ? `${formatUsd(amountUsd)} / mo`
                  : `${formatUsd(total)} today`}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-slate leading-snug">
              {subtitle}
            </p>
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
): string {
  if (scheduleId === "monthly") {
    return `${formatUsd(amount)} charged each month for ${months} ${
      months === 1 ? "month" : "months"
    }.`;
  }
  return `${formatUsd(total)} charged today (covers all ${months} ${
    months === 1 ? "month" : "months"
  }).`;
}

export default PaymentSchedulePicker;
