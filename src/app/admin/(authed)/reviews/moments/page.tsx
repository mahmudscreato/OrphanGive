// Session 52b — Admin moment review list.

import Link from "next/link";
import { Camera, ChevronRight, Clock, Video } from "lucide-react";
import {
  listAdminMoments,
  type AdminMomentSummary,
  type MomentReviewFilter,
} from "@/lib/admin-moments";

export const dynamic = "force-dynamic";

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
        <ul className="space-y-2">
          {moments.map((m) => (
            <MomentRow key={m.id} moment={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MomentRow({ moment }: { moment: AdminMomentSummary }) {
  return (
    <li>
      <Link
        href={`/admin/reviews/moments/${moment.id}`}
        className="group flex items-start gap-3 rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="shrink-0 w-14 h-14 rounded-lg bg-stone-100 overflow-hidden flex items-center justify-center">
          {moment.mediaType === "image" && moment.fileUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={moment.fileUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : moment.mediaType === "video" ? (
            <Video
              className="w-5 h-5 text-stone-500 stroke-[1.75]"
              aria-hidden="true"
            />
          ) : (
            <Camera
              className="w-5 h-5 text-stone-500 stroke-[1.75]"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-display text-[16px] text-ink leading-snug truncate">
              {moment.childDisplayName}
            </p>
            <StatusPill status={moment.status} />
          </div>
          {moment.caption ? (
            <p className="mt-0.5 text-[13px] text-ink-soft leading-snug line-clamp-1">
              {moment.caption}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] italic text-ink-soft">
              No caption
            </p>
          )}
          <p className="mt-1 text-[12px] text-ink-soft leading-relaxed">
            {moment.uploadedByName} ·{" "}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3 stroke-[1.75]" aria-hidden="true" />
              {formatRelative(moment.uploadedAt)}
            </span>
          </p>
        </div>
        <ChevronRight
          className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: AdminMomentSummary["status"] }) {
  const styles: Record<
    AdminMomentSummary["status"],
    { bg: string; text: string; label: string }
  > = {
    draft: { bg: "bg-stone-100", text: "text-stone-700", label: "Draft" },
    pending: { bg: "bg-amber-50", text: "text-amber-800", label: "Pending" },
    published: { bg: "bg-moss-soft", text: "text-moss-deep", label: "Published" },
    rejected: { bg: "bg-[#FCE9E9]", text: "text-[#A02020]", label: "Rejected" },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
