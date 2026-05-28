// Admin Lot 1 — visual section wrapper for the admin home dashboard.
//
// Renders a tiny eyebrow label + an optional right-aligned "view all"
// link, then the section's content. Keeps the home dashboard's
// rhythm consistent across the four areas (Pending work, Operational
// snapshot, Attention items, Recent activity).

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function DashboardSection({
  eyebrow,
  title,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 md:mb-12">
      <header className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-display text-[20px] md:text-[22px] text-ink leading-tight tracking-tight">
            {title}
          </h2>
        </div>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors"
          >
            {viewAllLabel ?? "View all"}
            <ChevronRight className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}
