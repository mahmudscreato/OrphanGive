// Admin Lot 1 — small attention card for the home dashboard's
// "Attention items" section. Different from AdminStatTile in that
// it leads with a colored icon + state-toned background to signal
// that this is something to ACT on, not just a metric to watch.
//
// Hidden when count is 0 — admin shouldn't see four amber cards on a
// quiet day. Renders as a Link directly to the filtered view.

import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

type Tone = "amber" | "stone" | "tangerine" | "moss";

const TONE: Record<Tone, { bg: string; border: string; icon: string; text: string }> = {
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-900",
    text: "text-amber-900",
  },
  stone: {
    bg: "bg-stone-100",
    border: "border-stone-200",
    icon: "bg-stone-200 text-stone-700",
    text: "text-stone-800",
  },
  tangerine: {
    bg: "bg-tangerine-mist",
    border: "border-tangerine-soft",
    icon: "bg-tangerine text-white",
    text: "text-tangerine-deep",
  },
  moss: {
    bg: "bg-moss-soft",
    border: "border-moss/30",
    icon: "bg-moss text-white",
    text: "text-moss-deep",
  },
};

export function AttentionCard({
  label,
  count,
  description,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  description?: string;
  href: Route | string;
  icon: LucideIcon;
  tone: Tone;
}) {
  const t = TONE[tone];
  // Cast href type for next/link typedRoutes — most uses pass real
  // routes already so this is a no-op at runtime.
  const linkHref = href as Route;
  return (
    <Link
      href={linkHref}
      className={`group flex items-start gap-3 rounded-2xl border ${t.bg} ${t.border} p-4 md:p-5 transition-all duration-200 hover:shadow-card hover:-translate-y-px`}
    >
      <div
        className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl ${t.icon}`}
      >
        <Icon className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-display text-[24px] leading-none font-medium tracking-tight ${t.text}`}>
            {count}
          </span>
          <span className={`text-[13px] font-medium ${t.text}`}>{label}</span>
        </div>
        {description ? (
          <p className={`mt-1 text-[12px] ${t.text} opacity-80 leading-snug`}>
            {description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
