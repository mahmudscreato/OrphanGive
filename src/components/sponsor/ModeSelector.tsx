"use client";

import type { PaymentMode } from "@/lib/pricing";

type Props = {
  value: PaymentMode | null;
  onChange: (mode: PaymentMode) => void;
};

const COPY: Record<PaymentMode, { title: string; body: string; sub: string }> = {
  monthly: {
    title: "Sponsor monthly",
    body: "Stay with this child for the long term — funds reach them every month.",
    sub: "From $10/month. Cancel anytime.",
  },
  one_time: {
    title: "One-time gift",
    body: "A single contribution that goes directly to this child's care.",
    sub: "From $25.",
  },
};

export function ModeSelector({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Sponsorship type" className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      {(["monthly", "one_time"] as const).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={`text-left rounded-[20px] p-6 transition-all duration-[250ms] ease-soft ${
              active
                ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft hover:-translate-y-0.5"
            }`}
          >
            <div className="font-display text-[22px] text-ink leading-snug">
              {COPY[mode].title}
            </div>
            <p className="mt-2 text-[14px] text-slate leading-[1.6]">{COPY[mode].body}</p>
            <div className="mt-3 font-mono text-[11px] tracking-[0.12em] uppercase text-tangerine-deep">
              {COPY[mode].sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default ModeSelector;
