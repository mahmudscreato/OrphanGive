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
import { ChevronRight, Clock, FileBarChart } from "lucide-react";
import {
  listAdminReports,
  type AdminReportSummary,
} from "@/lib/admin-reports";
import { StatusPill, type StatusPillKind } from "@/components/di/StatusPill";

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

function statusToPillKind(status: string): StatusPillKind {
  if (
    status === "submitted_by_di" ||
    status === "under_admin_review" ||
    status === "approved" ||
    status === "correction_requested" ||
    status === "rejected" ||
    status === "published" ||
    status === "verified" ||
    status === "pending" ||
    status === "draft"
  ) {
    return status as StatusPillKind;
  }
  return "draft";
}

export default async function AdminReportsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);
  const reports = await listAdminReports({ reportType: activeFilter });

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
        <ul className="space-y-2">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: AdminReportSummary }) {
  const childLabel = report.child_display_name ?? "Unknown child";
  const division = report.child_division_name;
  return (
    <li>
      <Link
        href={`/admin/reviews/reports/${report.id}`}
        className="group flex items-start gap-3 rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
          <FileBarChart
            className="w-5 h-5 stroke-[1.75]"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-display text-[16px] text-ink leading-snug truncate">
              {report.title}
            </p>
            <StatusPill kind={statusToPillKind(report.status)} />
            {report.report_type ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-700">
                {report.report_type === "progress"
                  ? "Progress"
                  : "Deployment"}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-soft leading-snug">
            {childLabel}
            {division ? <span className="text-stone-400"> · {division}</span> : null}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft leading-relaxed">
            {report.submitter_display_name ?? "Unknown DI"} ·{" "}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3 stroke-[1.75]" aria-hidden="true" />
              filed
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
