"use client";

import type { PaymentMode } from "@/lib/pricing";

type Props = {
  value: PaymentMode | null;
  onChange: (mode: PaymentMode) => void;
  // Session 14.6: when this child already has an active monthly
  // sponsor, the 'monthly' tile is rendered as a disabled/locked
  // state — the donor can still pick 'one_time'. Default false so
  // existing call-sites don't have to opt in.
  monthlyLocked?: boolean;
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

export function ModeSelector({ value, onChange, monthlyLocked = false }: Props) {
  return (
    <div role="radiogroup" aria-label="Sponsorship type" className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      {(["monthly", "one_time"] as const).map((mode) => {
        const active = value === mode;
        const locked = mode === "monthly" && monthlyLocked;
        const disabled = locked;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onChange(mode);
            }}
            className={`text-left rounded-[20px] p-6 transition-all duration-[250ms] ease-soft ${
              disabled
                ? "bg-cream/60 border-[2px] border-ink/[0.06] cursor-not-allowed opacity-70"
                : active
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
            {locked ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-moss-soft/40 border border-moss/30 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.10em] uppercase text-moss-deep">
                <span aria-hidden="true">●</span>
                Already sponsored monthly
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default ModeSelector;
