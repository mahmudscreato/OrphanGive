// Session 52b — Admin document review list.

import Link from "next/link";
import {
  countPendingDocuments,
  listAdminDocuments,
  type AdminDocumentSummary,
  type DocumentReviewFilter,
} from "@/lib/admin-documents";
import {
  BulkReviewList,
  type BulkReviewRow,
} from "@/components/admin/bulk/BulkReviewList";

export const dynamic = "force-dynamic";

const DOC_STATUS_LABEL: Record<AdminDocumentSummary["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

const TABS: ReadonlyArray<{ value: DocumentReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function parseFilter(s: string | undefined): DocumentReviewFilter {
  if (s === "all" || s === "pending" || s === "approved" || s === "rejected")
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

export default async function AdminDocumentsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);
  // Session 52d — fetch in parallel: the list rows for the chosen
  // tab AND the canonical pending count shared with the home tile.
  // Surfacing the count in the header makes any future divergence
  // immediately visible: "Pending: 9 — but I only see 0 rows
  // below" is now self-diagnosing.
  const [documents, pendingCount] = await Promise.all([
    listAdminDocuments({ filter: activeFilter }),
    countPendingDocuments(),
  ]);

  // feat/admin-bulk-approve — normalize into the shared bulk row model.
  // Only PENDING rows are selectable/approvable; the approve endpoint is
  // the SAME per-item route the detail page uses.
  const rows: BulkReviewRow[] = documents.map((d) => ({
    id: d.id,
    href: `/admin/reviews/documents/${d.id}`,
    approveEndpoint: `/api/admin/documents/${d.id}/approve`,
    selectable: d.status === "pending",
    thumbUrl: d.mimeHint === "image" ? d.fileUrl : null,
    thumbIcon: "file",
    title: d.childDisplayName,
    statusLabel: DOC_STATUS_LABEL[d.status],
    statusTone: d.status === "archived" ? "neutral" : d.status,
    typeLabel: d.documentTypeLabel,
    subtitle:
      d.status === "rejected" && d.rejectionReason ? d.rejectionReason : null,
    meta: `${d.uploadedByName} · ${formatRelative(d.uploadedAt)}`,
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
          Documents
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Legal &amp; identity evidence uploaded by the DI team. Tier 3 —
          never shown to donors; the verification badge on the donor
          profile counts only what you approve here.
          {pendingCount !== null ? (
            <>
              {" "}
              <span className="text-ink font-medium">
                {pendingCount} pending overall.
              </span>
            </>
          ) : null}
        </p>
      </header>

      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Document status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/reviews/documents?filter=${tab.value}`}
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

      {documents.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            {activeFilter === "pending" ? "Inbox zero." : "Nothing here."}
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            {activeFilter === "pending"
              ? "No documents waiting on review."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <BulkReviewList rows={rows} itemNoun="document" />
      )}
    </div>
  );
}
