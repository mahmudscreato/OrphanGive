// Session 51 — Admin children read-only list.
//
// Server component. Lists every child globally (no DI scope) sorted
// alphabetically by display_name. Status filter pills: All / Active /
// Withdrawn / Pending intake. Each row click routes to the existing
// donor-facing /children/[id] page — full admin child detail (with
// Tier 3 internal notes, audit history) is a future session.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  listAdminChildren,
  type AdminChildRow,
  type AdminChildStatusFilter,
} from "@/lib/admin-children";

export const dynamic = "force-dynamic";

const STATUS_TABS: ReadonlyArray<{
  value: AdminChildStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting_intake", label: "Awaiting intake" },
  { value: "withdrawn", label: "Withdrawn" },
];

function parseStatus(s: string | undefined): AdminChildStatusFilter {
  if (s === "active" || s === "withdrawn" || s === "awaiting_intake") return s;
  return "all";
}

const SPONSOR_BADGE: Record<
  AdminChildRow["sponsor_category"],
  { bg: string; text: string; label: string }
> = {
  awaiting: { bg: "bg-moss-soft", text: "text-moss-deep", label: "Awaiting" },
  monthly: {
    bg: "bg-tangerine-mist",
    text: "text-tangerine-deeper",
    label: "Monthly",
  },
  prepaid: {
    bg: "bg-tangerine-mist",
    text: "text-tangerine-deeper",
    label: "Prepaid",
  },
  paused: { bg: "bg-stone-100", text: "text-stone-700", label: "Paused" },
};

export default async function AdminChildrenListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const children = await listAdminChildren({ status });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Children
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          {children.length === 0
            ? "No children match the current filter."
            : `${children.length} child${children.length === 1 ? "" : "ren"} on record.`}{" "}
          Read-only for now — full admin detail page coming later.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Status filter">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/children?status=${tab.value}`}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-tangerine text-white"
                  : "bg-white border border-stone-200 text-ink-soft hover:border-tangerine-soft hover:text-tangerine-deeper"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Nothing here yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
            Try a different filter, or wait for the DI team to submit new
            profiles.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {children.map((c) => (
            <ChildRow key={c.id} child={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildRow({ child }: { child: AdminChildRow }) {
  const sponsorBadge = SPONSOR_BADGE[child.sponsor_category];
  const ageLine =
    child.age !== null
      ? `Age ${child.age}`
      : "Age unknown";
  const locationLine = [child.district_name, child.division_name]
    .filter(Boolean)
    .join(", ") || "Location unknown";
  return (
    <li>
      {/* Routes to donor profile page for now. Admin sees the full
          ChildProfile shape (tier='admin' — see Session 50's
          getChildById). Full admin-detail page is future scope. */}
      <Link
        href={`/children/${child.id}`}
        className="group block rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-[17px] text-ink leading-snug truncate">
                {child.display_name}
              </p>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${sponsorBadge.bg} ${sponsorBadge.text}`}
              >
                {sponsorBadge.label}
              </span>
              {child.status !== "active" ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-700">
                  {child.status}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
              {ageLine} · {locationLine} · {child.support_type_label}
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}
