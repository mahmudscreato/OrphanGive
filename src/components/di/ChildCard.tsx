// Session 43 — Children list card.
//
// Server component (no client interactivity needed). Linked card so
// the whole surface is the click target. Layout matches the brief:
// 96x96 photo + name/age/division/badge column on the right, with a
// rule and the sponsor + last-report rows below.

import Link from "next/link";
import Image from "next/image";
import { FileBarChart, UserCircle2 } from "lucide-react";
import type { DiChildSummary } from "@/lib/di-children";

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  awaiting: {
    bg: "bg-moss",
    text: "text-white",
    label: "Awaiting sponsor",
  },
  monthly: {
    bg: "bg-tangerine",
    text: "text-white",
    label: "Monthly sponsor",
  },
  prepaid: {
    bg: "bg-tangerine-deeper",
    text: "text-white",
    label: "Prepaid sponsor",
  },
  paused: {
    bg: "bg-slate",
    text: "text-white",
    label: "Paused",
  },
};

const RELATIONSHIP_LABEL: Record<DiChildSummary["relationship"], string> = {
  uploaded: "Uploaded by me",
  assigned: "Assigned to me",
  both: "Uploaded + assigned",
};

function formatAmount(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  // Render whole-number currency-prefixed (e.g. "USD 25", "BDT 1500").
  // Locale-aware formatting would be preferred, but DI staff need a
  // consistent compact rendering across regions.
  const symbol = currency?.trim().toUpperCase() || "BDT";
  const display = Number.isInteger(amount) ? amount : amount.toFixed(2);
  return `${symbol} ${display}`;
}

function formatLastReport(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function ChildCard({ child }: { child: DiChildSummary }) {
  const badge = STATUS_BADGE[child.category] ?? STATUS_BADGE.awaiting!;
  const ageDivision = [
    child.age_years !== null ? `${child.age_years} years` : null,
    child.bd_division_name,
  ]
    .filter(Boolean)
    .join(" · ");

  const sponsorAmountLine =
    child.sponsor_display_name &&
    (child.sponsor_amount !== null || child.sponsor_category)
      ? [
          child.sponsor_category === "monthly"
            ? "Monthly"
            : child.sponsor_category === "prepaid"
              ? "Prepaid"
              : child.sponsor_category === "one_time"
                ? "One-time"
                : null,
          formatAmount(child.sponsor_amount, child.sponsor_currency),
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <Link
      href={`/di/children/${child.id}`}
      className="group block rounded-2xl bg-white border border-stone-200 shadow-sm hover:shadow-md hover:border-tangerine-soft transition-all duration-200 overflow-hidden"
    >
      <div className="p-4 flex gap-4">
        {/* Photo */}
        <div className="shrink-0">
          {child.photo_url ? (
            <Image
              src={child.photo_url}
              alt={child.display_name}
              width={96}
              height={96}
              className="w-24 h-24 rounded-xl object-cover bg-tangerine-mist"
              unoptimized
            />
          ) : (
            <div
              className="w-24 h-24 rounded-xl bg-tangerine-mist flex items-center justify-center text-tangerine-deeper"
              aria-hidden="true"
            >
              <UserCircle2 className="w-12 h-12 stroke-[1.5]" />
            </div>
          )}
        </div>

        {/* Identity column */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[18px] text-ink leading-tight truncate">
            {child.display_name}
          </h3>
          {ageDivision ? (
            <p className="mt-1 text-[14px] text-ink-soft leading-snug truncate">
              {ageDivision}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${badge.bg} ${badge.text}`}
            >
              {badge.label}
            </span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-soft/80">
              {RELATIONSHIP_LABEL[child.relationship]}
            </span>
          </div>
        </div>
      </div>

      {/* Sponsor block — only when sponsored */}
      {child.sponsor_display_name ? (
        <div className="px-4 pb-3 pt-0">
          <div className="border-t border-stone-200 pt-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-soft/80">
              Sponsor
            </div>
            <div className="mt-1 text-[14px] text-ink font-medium leading-snug">
              {child.sponsor_display_name}
            </div>
            {sponsorAmountLine ? (
              <div className="text-[13px] text-ink-soft mt-0.5">
                {sponsorAmountLine}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Last report row */}
      <div className="px-4 pb-4">
        <div className="border-t border-stone-200 pt-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
          <FileBarChart
            className="w-3.5 h-3.5 stroke-[1.75] shrink-0"
            aria-hidden="true"
          />
          {child.last_report_date ? (
            <span>Last report: {formatLastReport(child.last_report_date)}</span>
          ) : (
            <span className="italic">Last report: not yet submitted</span>
          )}
        </div>
      </div>
    </Link>
  );
}
