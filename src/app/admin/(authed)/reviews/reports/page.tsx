// Spine 1.2 — Admin report review queue.
//
// Surfaces child_update rows in the new Spine lifecycle:
//   - submitted_by_di          (DI just filed; awaiting admin)
//   - under_admin_review       (admin claimed; in-progress)
//   - correction_requested     (was sent back; DI may resubmit)
//
// Also includes legacy 'pending' rows so the older DI flow doesn't
// vanish from admin's view (single queue, two writers).
//
// Filter tabs roll the report_type discriminator:
//   - All        (default)
//   - Progress   (monthly sponsorships)
//   - Deployment (one-time sponsorships — single-shot confirmation)
//
// Privacy: each row shows Tier-1 child fields only (display_name +
// bd_division.name). NO district, NO Tier-3.

import Link from "next/link";
import { listAdminReports } from "@/lib/admin-reports";
import {
  BulkReviewList,
  type BulkReviewRow,
} from "@/components/admin/bulk/BulkReviewList";

export const dynamic = "force-dynamic";

type ReportTypeFilter = "all" | "progress" | "deployment";

const TABS: ReadonlyArray<{ value: ReportTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "progress", label: "Progress (monthly)" },
  { value: "deployment", label: "Deployment (one-time)" },
];

function parseFilter(s: string | undefined): ReportTypeFilter {
  if (s === "progress" || s === "deployment" || s === "all") return s;
  return "all";
}

// Every status the report queue surfaces is admin-approvable (approveReport's
// approvable set = submitted_by_di / under_admin_review / correction_requested
// / legacy pending) — so all shown rows are selectable.
const REPORT_STATUS: Record<
  string,
  { label: string; tone: BulkReviewRow["statusTone"] }
> = {
  submitted_by_di: { label: "Awaiting review", tone: "pending" },
  under_admin_review: { label: "In review", tone: "pending" },
  pending: { label: "Pending", tone: "pending" },
  correction_requested: { label: "Correction requested", tone: "neutral" },
};

export default async function AdminReportsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);
  const reports = await listAdminReports({ reportType: activeFilter });

  // feat/admin-bulk-approve — normalize into the shared bulk row model.
  // All queued reports are approvable; approve POSTs the same per-item
  // route the detail page uses (→ status=approved + DI notification).
  const rows: BulkReviewRow[] = reports.map((r) => {
    const s = REPORT_STATUS[r.status] ?? {
      label: r.status,
      tone: "neutral" as const,
    };
    const division = r.child_division_name;
    return {
      id: r.id,
      href: `/admin/reviews/reports/${r.id}`,
      approveEndpoint: `/api/admin/reports/${r.id}/approve`,
      selectable: true,
      thumbUrl: null,
      thumbIcon: "report" as const,
      title: r.title,
      statusLabel: s.label,
      statusTone: s.tone,
      typeLabel: r.report_type
        ? r.report_type === "progress"
          ? "Progress"
          : "Deployment"
        : null,
      subtitle: `${r.child_display_name ?? "Unknown child"}${division ? ` · ${division}` : ""}`,
      meta: `${r.submitter_display_name ?? "Unknown DI"} · filed`,
    };
  });

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
          Reports
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          DI-filed reports waiting on you. Progress reports go to monthly
          sponsors after approval. Deployment reports confirm a one-time
          aid round landed.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Report type filter">
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/reviews/reports?filter=${tab.value}`}
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

      {reports.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Inbox zero.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            No reports waiting on review.
          </p>
        </div>
      ) : (
        <BulkReviewList rows={rows} itemNoun="report" />
      )}
    </div>
  );
}
