// Session 52b — Admin moment review list.

import Link from "next/link";
import {
  listAdminMoments,
  type AdminMomentSummary,
  type MomentReviewFilter,
} from "@/lib/admin-moments";
import {
  BulkReviewList,
  type BulkReviewRow,
} from "@/components/admin/bulk/BulkReviewList";

export const dynamic = "force-dynamic";

const MOMENT_STATUS: Record<
  AdminMomentSummary["status"],
  { label: string; tone: BulkReviewRow["statusTone"] }
> = {
  draft: { label: "Draft", tone: "neutral" },
  pending: { label: "Pending", tone: "pending" },
  published: { label: "Published", tone: "published" },
  rejected: { label: "Rejected", tone: "rejected" },
};

const TABS: ReadonlyArray<{ value: MomentReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
];

function parseFilter(s: string | undefined): MomentReviewFilter {
  if (s === "all" || s === "pending" || s === "published" || s === "rejected")
    return s;
  return "pending";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function AdminMomentsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);
  const moments = await listAdminMoments({ filter: activeFilter });

  // feat/admin-bulk-approve — normalize into the shared bulk row model.
  // Only PENDING moments are selectable; approve POSTs the same per-item
  // route the detail page uses (→ status=published + DI notification).
  const rows: BulkReviewRow[] = moments.map((m) => ({
    id: m.id,
    href: `/admin/reviews/moments/${m.id}`,
    approveEndpoint: `/api/admin/moments/${m.id}/approve`,
    selectable: m.status === "pending",
    thumbUrl: m.mediaType === "image" ? m.fileUrl : null,
    thumbIcon: m.mediaType === "video" ? "video" : "image",
    title: m.childDisplayName,
    statusLabel: MOMENT_STATUS[m.status].label,
    statusTone: MOMENT_STATUS[m.status].tone,
    typeLabel: null,
    subtitle: m.caption ?? null,
    meta: `${m.uploadedByName} · ${formatRelative(m.uploadedAt)}`,
  }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <header className="mb-6 md:mb-8">
        <Link
          href="/admin/reviews"
          className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors mb-3"
        >
          ← All review queues
        </Link>
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Timeline moments
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Ongoing life-update photos and short videos. Once approved,
          donors who sponsor or follow the child see them in their feed.
        </p>
      </header>

      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Moment status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/reviews/moments?filter=${tab.value}`}
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

      {moments.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            {activeFilter === "pending" ? "Inbox zero." : "Nothing here."}
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            {activeFilter === "pending"
              ? "No moments waiting on review."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <BulkReviewList rows={rows} itemNoun="moment" />
      )}
    </div>
  );
}
