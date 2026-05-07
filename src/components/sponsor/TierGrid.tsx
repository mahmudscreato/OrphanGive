"use client";

import {
  formatUsd,
  SPONSORSHIP_TIERS,
  type PaymentMode,
} from "@/lib/pricing";

type Props = {
  mode: PaymentMode;
  selectedTierId: string | null;
  onSelect: (tierId: string) => void;
};

export function TierGrid({ mode, selectedTierId, onSelect }: Props) {
  const tiers = SPONSORSHIP_TIERS[mode];
  const suffix = mode === "monthly" ? "/month" : "";
  return (
    <div role="radiogroup" aria-label="Sponsorship amount" className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
      {tiers.map((tier) => {
        const active = selectedTierId === tier.id;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(tier.id)}
            className={`text-left rounded-[16px] p-5 transition-all duration-[200ms] ease-soft ${
              active
                ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[26px] text-ink leading-none">
                {formatUsd(tier.amount)}
                <span className="text-[14px] text-slate-soft">{suffix}</span>
              </span>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-tangerine-deep">
                {tier.label}
              </span>
            </div>
            {tier.description ? (
              <p className="mt-2 text-[13.5px] text-slate leading-snug">{tier.description}</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default TierGrid;
