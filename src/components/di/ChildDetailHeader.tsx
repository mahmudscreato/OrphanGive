// Session 43 — Child Detail header card.
//
// Server component. Sits above the tab strip and frames the child's
// identity. Photo + name + age/division/status badge + monthly cost
// support-type line. Stacks vertically on mobile.

import Image from "next/image";
import { MapPin, UserCircle2 } from "lucide-react";
import type { DiChildDetail } from "@/lib/di-children";

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

function prettifySupportType(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatCost(cost: number | null): string {
  if (cost === null || !Number.isFinite(cost)) return "Cost: to be set";
  return `BDT ${cost}/mo`;
}

export function ChildDetailHeader({ child }: { child: DiChildDetail }) {
  const badge = STATUS_BADGE[child.category] ?? STATUS_BADGE.awaiting!;
  const support = prettifySupportType(child.support_type);
  const costAndSupport = [formatCost(child.monthly_cost), support]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6 mb-6">
      <div className="flex flex-col md:flex-row gap-5 md:gap-6 md:items-start">
        {/* Photo */}
        <div className="shrink-0 mx-auto md:mx-0">
          {child.photo_url ? (
            <Image
              src={child.photo_url}
              alt={child.display_name}
              width={160}
              height={160}
              className="w-40 h-40 rounded-2xl object-cover bg-tangerine-mist"
              unoptimized
            />
          ) : (
            <div
              className="w-40 h-40 rounded-2xl bg-tangerine-mist flex items-center justify-center text-tangerine-deeper"
              aria-hidden="true"
            >
              <UserCircle2 className="w-20 h-20 stroke-[1.25]" />
            </div>
          )}
        </div>

        {/* Identity column */}
        <div className="flex-1 min-w-0 text-center md:text-left">
          <h1 className="font-display text-[28px] md:text-[32px] text-ink leading-tight tracking-tight">
            {child.display_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-[15px] text-slate">
            {child.age_years !== null ? (
              <span>{child.age_years} years old</span>
            ) : null}
            {child.bd_division_name ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  className="w-3.5 h-3.5 stroke-[1.75]"
                  aria-hidden="true"
                />
                {child.bd_division_name}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium ${badge.bg} ${badge.text}`}
            >
              {badge.label}
            </span>
          </div>
          {costAndSupport ? (
            <p className="mt-3 text-[14px] text-slate leading-relaxed">
              {costAndSupport}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
