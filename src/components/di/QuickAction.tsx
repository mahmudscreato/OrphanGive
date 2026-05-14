// Session 42 — DI Dashboard quick-action card.
//
// Big tap-target card for one of the "+ Add new …" actions. 4 of
// these across the home screen (2-col mobile, 4-col desktop). Filled
// tangerine to draw the eye — the dashboard's primary CTAs live here.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function QuickAction({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-3 rounded-2xl bg-white border border-ink/[0.06] p-5 min-h-[112px] transition-all duration-200 hover:bg-tangerine-mist/40 hover:border-tangerine-soft hover:-translate-y-px"
    >
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-tangerine-mist text-tangerine-deeper group-hover:bg-tangerine group-hover:text-ink transition-colors shrink-0">
        <Icon className="w-5 h-5 stroke-[2]" aria-hidden="true" />
      </span>
      <span className="font-display text-[16px] text-ink leading-tight">
        {label}
      </span>
    </Link>
  );
}
