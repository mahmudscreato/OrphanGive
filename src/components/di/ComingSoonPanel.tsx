// Session 43 — Generic placeholder panel for tabs not yet wired up
// (Moments / Reports / Deliveries / History).
//
// Server component. Centered icon with a soft tangerine tint, big
// title, "Coming soon" + per-tab description.

import type { LucideIcon } from "lucide-react";

export function ComingSoonPanel({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6"
    >
      <h2 className="font-display text-[22px] text-ink mb-4">{title}</h2>
      <div className="py-10 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
          aria-hidden="true"
        >
          <Icon className="w-8 h-8 stroke-[1.5]" />
        </div>
        <div className="font-script text-[18px] text-tangerine-deeper italic mb-2">
          soon
        </div>
        <p className="font-display text-[20px] text-ink mb-2">Coming soon</p>
        <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      </div>
    </section>
  );
}
