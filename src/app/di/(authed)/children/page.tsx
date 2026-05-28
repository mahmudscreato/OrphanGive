// Session 43 — DI Dashboard "My Children" list page.
//
// Server component. Reads the DI session, fetches the in-scope
// children + their primary sponsorship summary (one batched
// Directus round-trip), and renders the cards grid.
//
// Filter pills are URL-driven (?status=awaiting|monthly|prepaid|paused
// |all). The category mapping comes from the data layer's derived
// `category` field, NOT child.status — production child.status is
// effectively single-valued ("active") for the awaiting-sponsor pool;
// the sponsorship state is what determines the bucket. See
// src/lib/di-children.ts for the derivation rule.

import Link from "next/link";
import { Inbox, Users } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import {
  getDiChildrenForUser,
  type DiChildCategory,
  type DiChildSummary,
} from "@/lib/di-children";
import { ChildCard } from "@/components/di/ChildCard";
import { DiPageHeader } from "@/components/di/DiPageHeader";

export const dynamic = "force-dynamic";

const FILTERS: ReadonlyArray<{
  value: "all" | DiChildCategory;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "awaiting", label: "Awaiting" },
  { value: "monthly", label: "Monthly" },
  { value: "prepaid", label: "Prepaid" },
  { value: "paused", label: "Paused" },
];

function isCategoryFilter(
  v: string | undefined,
): v is "all" | DiChildCategory {
  return (
    v === "all" ||
    v === "awaiting" ||
    v === "monthly" ||
    v === "prepaid" ||
    v === "paused"
  );
}

function applyFilter(
  children: DiChildSummary[],
  filter: "all" | DiChildCategory,
): DiChildSummary[] {
  if (filter === "all") return children;
  return children.filter((c) => c.category === filter);
}

export default async function DiChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireDiUser();
  const sp = await searchParams;
  const filter: "all" | DiChildCategory = isCategoryFilter(sp.status)
    ? sp.status
    : "all";

  const allChildren = await getDiChildrenForUser(session.userId);
  const filtered = applyFilter(allChildren, filter);

  const total = allChildren.length;
  const subtitle =
    total === 0
      ? "No children in your care yet."
      : total === 1
        ? "1 child in your care"
        : `${total} children in your care`;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <DiPageHeader
        title="My Children"
        subtitle={subtitle}
        flourish={total === 1 ? "just one, for now" : undefined}
      />

      {/* Status filter pills (only render when there are children) */}
      {total > 0 ? (
        <nav
          aria-label="Filter by sponsorship state"
          className="mb-5 md:mb-6 flex gap-2 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {FILTERS.map((f) => {
            const selected = f.value === filter;
            const href =
              f.value === "all" ? "/di/children" : `/di/children?status=${f.value}`;
            return (
              <Link
                key={f.value}
                href={href}
                aria-current={selected ? "page" : undefined}
                className={`shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors ${
                  selected
                    ? "bg-tangerine text-white"
                    : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Empty states */}
      {total === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-moss-soft text-moss-deep mb-4"
            aria-hidden="true"
          >
            <Users className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-display text-[20px] text-ink mb-2">
            No children assigned yet.
          </p>
          <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto">
            Your admin will pair you with children to manage. Once that happens,
            their cards will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-8 text-center">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <Inbox className="w-6 h-6 stroke-[1.5]" />
          </div>
          <p className="text-[14.5px] text-ink-soft leading-relaxed">
            None of your children match the &quot;{filter}&quot; filter right now.{" "}
            <Link
              href="/di/children"
              className="text-tangerine-deeper hover:underline"
            >
              Show all
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}
