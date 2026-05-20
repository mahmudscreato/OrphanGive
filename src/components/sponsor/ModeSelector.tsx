"use client";

import type { PaymentMode } from "@/lib/pricing";

type Props = {
  value: PaymentMode | null;
  onChange: (mode: PaymentMode) => void;
  // Session 14.6: when the child's monthly slot is fully closed
  // (sponsor + full queue), the 'monthly' tile renders as a
  // disabled/locked state — the donor can still pick 'one_time'.
  monthlyLocked?: boolean;
  // Session 14.7: when the child has an active monthly sponsor
  // but the queue isn't full, the monthly tile stays enabled but
  // its title/body adapt to a "Get in line" framing. The lock pip
  // is replaced with a moss queue-position pill.
  monthlyQueueJoin?: {
    position: number;
    donorsAhead: number;
  } | null;
};

const COPY_DEFAULT: Record<PaymentMode, { title: string; body: string; sub: string }> = {
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

// Queue-join framing for the monthly tile only.
const COPY_QUEUE_JOIN = {
  title: "Get in line",
  body: "Pay upfront now. Your sponsorship begins when the current sponsor's term ends.",
  sub: "From $10/month. Refundable until your turn.",
};

export function ModeSelector({
  value,
  onChange,
  monthlyLocked = false,
  monthlyQueueJoin = null,
}: Props) {
  return (
    <div role="radiogroup" aria-label="Sponsorship type" className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      {(["monthly", "one_time"] as const).map((mode) => {
        const active = value === mode;
        const locked = mode === "monthly" && monthlyLocked;
        const disabled = locked;
        // Mode-aware copy. The monthly tile flips to the "Get in
        // line" framing when this child has an active sponsor and
        // the queue isn't full. one_time always uses default copy.
        const copy =
          mode === "monthly" && monthlyQueueJoin
            ? COPY_QUEUE_JOIN
            : COPY_DEFAULT[mode];
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
            className={`text-left rounded-[20px] p-6 transition-all duration-[250ms] ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas ${
              disabled
                ? "bg-cream/60 border-[2px] border-ink/[0.06] cursor-not-allowed opacity-70"
                : active
                  ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                  : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft hover:-translate-y-0.5"
            }`}
          >
            <div className="font-display text-[22px] text-ink leading-snug">
              {copy.title}
            </div>
            <p className="mt-2 text-[14px] text-slate leading-[1.6]">{copy.body}</p>
            <div className="mt-3 font-mono text-[11px] tracking-[0.12em] uppercase text-tangerine-deep">
              {copy.sub}
            </div>
            {locked ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-moss-soft/40 border border-moss/30 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.10em] uppercase text-moss-deep">
                <span aria-hidden="true">●</span>
                Queue is full
              </div>
            ) : mode === "monthly" && monthlyQueueJoin ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-moss-soft/40 border border-moss/30 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.10em] uppercase text-moss-deep">
                <span aria-hidden="true">●</span>
                Position {monthlyQueueJoin.position} in queue
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default ModeSelector;
