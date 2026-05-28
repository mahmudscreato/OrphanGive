// Admin Lot 1 — shared admin page header.
//
// Applied across admin list + detail pages for consistent typography,
// spacing, and breadcrumb behaviour. Reuses brand tokens from
// globals.css (font-display, ink, ink-soft, slate, tangerine-deeper).
//
// Three shapes:
//   - title only
//   - title + subtitle
//   - title + back-link + optional right-aligned action slot
//
// Server-component-safe. Children passed as nodes; no event handlers.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional back-link. When set, renders a ChevronLeft + label above
   *  the title. The href is rendered with next/link so prefetching
   *  works. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned action slot (typically a button or link). Renders
   *  inline with the title on >=md viewports, below on mobile. */
  action?: React.ReactNode;
  /** Optional small italic accent under the title, in the brand
   *  "script" voice (Caveat). The DI dashboard uses this for warm
   *  reminders; admin pages opt in selectively. */
  flourish?: string;
}

export function AdminPageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
  flourish,
}: AdminPageHeaderProps) {
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
