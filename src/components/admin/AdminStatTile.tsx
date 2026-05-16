// Session 51 — Admin stat tile.
//
// Visually identical to the DI StatTile (Session 42); kept as a
// separate component so the admin and DI surfaces can evolve
// independently. The DI version may grow notification badges, urgent
// flags, etc. tied to DI-specific concerns; admin's tile semantics
// are queue-depth-only.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function AdminStatTile({
  label,
  value,
  href,
  icon: Icon,
  hint,
  tooltip,
}: {
  label: string;
  value: number | string;
  href: string;
  icon?: LucideIcon;
  hint?: string;
  tooltip?: string;
}) {
  return (
    <Link
      href={href}
      title={tooltip}
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
