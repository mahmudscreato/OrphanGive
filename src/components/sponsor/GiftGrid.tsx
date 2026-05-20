// Session 58.3 — Zone B of the one-time Step 2: specific gifts with
// fixed amounts + cause + icon. Visually distinct from the TierGrid
// (quick amounts) by virtue of carrying an icon and a fixed-price tag.
// Picking a gift sets the amount automatically AND skips the cause
// step downstream (the gift's cause_tag IS the cause).

"use client";

import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface GiftItem {
  id: string;
  name: string;
  description: string | null;
  /** Lucide icon name from donation_package.icon. */
  icon: string | null;
  donorAmount: number;
  amountBdt: number;
}

type Props = {
  items: ReadonlyArray<GiftItem>;
  selectedGiftId: string | null;
  onSelect: (giftId: string) => void;
  currencySymbol: string;
  currencyCode: string;
};

export function GiftGrid({
  items,
  selectedGiftId,
  onSelect,
  currencySymbol,
  currencyCode,
}: Props) {
  if (items.length === 0) {
    return (
      <p className="text-[13.5px] text-slate-soft italic">
        No specific gifts available right now.
      </p>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Specific gifts"
      className="grid grid-cols-2 gap-3 max-md:grid-cols-1"
    >
      {items.map((g) => {
        const active = selectedGiftId === g.id;
        const Icon = resolveIcon(g.icon);
        return (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(g.id)}
            className={`text-left rounded-[16px] p-5 transition-all duration-[200ms] ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas ${
              active
                ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft hover:-translate-y-px"
            }`}
          >
            <div className="flex items-start gap-3">
              {Icon ? (
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active
                      ? "bg-tangerine text-white"
                      : "bg-tangerine-mist text-tangerine-deep"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] text-ink leading-snug">
                  {g.name}
                </div>
                {g.description ? (
                  <p className="mt-1 text-[12.5px] text-slate leading-snug">
                    {g.description}
                  </p>
                ) : null}
                <div className="mt-2 font-display text-[18px] text-ink">
                  {currencySymbol}
                  {g.donorAmount.toLocaleString()}
                  <span className="ml-1.5 text-[11px] font-mono text-slate-soft">
                    {currencyCode}
                  </span>
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.10em] text-slate-soft">
                  ≈ ৳{g.amountBdt.toLocaleString()}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function resolveIcon(name: string | null): LucideIcon | null {
  if (!name) return null;
  const lib = Icons as unknown as Record<string, LucideIcon>;
  return lib[name] ?? null;
}

export default GiftGrid;
