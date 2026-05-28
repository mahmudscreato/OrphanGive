// DI Lot 3 — shared DI page header.
//
// Mirrors AdminPageHeader's shape so DI + admin surfaces feel like
// one product. Reuses the same tokens (font-display, ink, ink-soft,
// slate, tangerine-deeper). Three shapes: title only · title +
// subtitle · title + back-link + action slot.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export interface DiPageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
  /** Optional small italic accent under the title, in Caveat. */
  flourish?: string;
}

export function DiPageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
  flourish,
}: DiPageHeaderProps) {
  return (
    <header className="mb-6 md:mb-8">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          {backLabel ?? "Back"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] md:text-[34px] text-ink leading-tight tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed max-w-prose">
              {subtitle}
            </p>
          ) : null}
          {flourish ? (
            <p className="mt-1 font-script italic text-[17px] text-tangerine-deeper">
              {flourish}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
