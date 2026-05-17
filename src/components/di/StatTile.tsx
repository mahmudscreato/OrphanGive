// Session 42 — DI Dashboard stat tile.
//
// Small pressable card displaying a count + label. 4 of these
// across the top of the home screen (2x2 mobile, 4-across desktop).
// Tap target ≥48px on mobile.
//
// The number uses Fraunces (display) so it lands as the visual
// anchor; the label sits below in body weight.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function StatTile({
  label,
  value,
  href,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number | string;
  href: string;
  icon?: LucideIcon;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl bg-white border border-ink/[0.06] p-5 transition-all duration-200 hover:border-tangerine-soft hover:shadow-card hover:-translate-y-px min-h-[112px]"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
          {label}
        </span>
        {Icon ? (
          <Icon
            className="w-4 h-4 text-tangerine-deeper opacity-70 group-hover:opacity-100 transition-opacity stroke-[1.75]"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="font-display text-[36px] text-ink leading-none font-medium tracking-tight">
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[11.5px] text-ink-soft">{hint}</div>
      ) : null}
    </Link>
  );
}
