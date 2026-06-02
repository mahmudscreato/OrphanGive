// Safeguarding report detail — FOUNDER / SAFEGUARDING-LEAD ONLY.
// Same fail-closed gate as the queue. Non-leads are redirected and never see
// the report body.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireSafeguardingLead } from "@/lib/safeguarding-access";
import { getSafeguardingReport } from "@/lib/safeguarding-reports";
import {
  REPORT_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  type ReportType,
} from "@/lib/safeguarding-report-types";
import { SafeguardingReportActions } from "@/components/admin/SafeguardingReportActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Safeguarding report", robots: { index: false, follow: false } };

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ts; }
}
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="py-2 border-b border-ink/[0.06] last:border-0">
      <div className="text-xs uppercase tracking-[0.1em] text-ink-soft">{label}</div>
      <div className="text-ink mt-0.5 whitespace-pre-wrap break-words">{value || "—"}</div>
    </div>
  );
}

export default async function SafeguardingReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const lead = await requireSafeguardingLead();
  if (!lead) redirect("/admin");

  const { id } = await params;
  const report = await getSafeguardingReport(id);
  if (!report) notFound();

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10">
      <Link href="/admin/safeguarding-reports" className="text-sm text-tangerine-deep hover:underline">
        ← Back to safeguarding reports
      </Link>

      <h1 className="font-display text-2xl text-ink mt-3 mb-1">
        Report #{report.id}
        {report.source === "email_logged_manually" ? (
          <span className="ml-3 text-[11px] align-middle text-ink-soft border border-ink/15 rounded-full px-2 py-0.5">
            logged from email (manual)
          </span>
        ) : null}
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        Status: <strong className="text-ink">{report.status ? REPORT_STATUS_LABELS[report.status] : "—"}</strong> ·
        {" "}Risk: <strong className="text-ink">{report.risk_level ? RISK_LEVEL_LABELS[report.risk_level] : "untriaged"}</strong>
      </p>

      <div className="grid grid-cols-[1.3fr_1fr] gap-6 max-md:grid-cols-1">
        {/* The report */}
        <div className="rounded-2xl border border-ink/[0.08] bg-white p-6 max-md:p-5">
          <h2 className="font-display text-lg text-ink mb-3">The report</h2>
          <Row label="Type" value={report.report_type ? REPORT_TYPE_LABELS[report.report_type as ReportType] : null} />
          <Row label="Description" value={report.description} />
          <Row label="Child / situation reference" value={report.child_reference} />
          <Row label="Reporter name" value={report.reporter_name} />
          <Row label="Reporter email" value={report.reporter_email} />
          <Row label="Reporter relationship" value={report.reporter_relationship} />
          <Row label="Source" value={report.source} />
          <Row label="Received" value={fmt(report.created_at)} />
          <Row label="Closed" value={fmt(report.closed_at)} />
        </div>

        {/* Lead controls */}
        <SafeguardingReportActions
          reportId={String(report.id)}
          riskLevel={report.risk_level}
          status={report.status}
          assignedTo={report.assigned_to}
          actionTaken={report.action_taken}
          leadUserId={lead.userId}
        />
      </div>
    </div>
  );
}
