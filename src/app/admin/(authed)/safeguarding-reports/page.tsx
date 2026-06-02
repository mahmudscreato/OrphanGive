// Safeguarding queue — FOUNDER / SAFEGUARDING-LEAD ONLY.
//
// The /admin/(authed) layout already gates to "any admin"; this page adds the
// founder-only gate. A non-lead admin (or anyone else) is redirected away —
// they never see the list. Reports are read via the server token (the
// collection grants no user policy any access).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSafeguardingLead } from "@/lib/safeguarding-access";
import { listSafeguardingReports } from "@/lib/safeguarding-reports";
import {
  REPORT_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  type ReportType,
  type ReportStatus,
  type RiskLevel,
} from "@/lib/safeguarding-report-types";
import { SafeguardingEmailLogForm } from "@/components/admin/SafeguardingEmailLogForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Safeguarding reports", robots: { index: false, follow: false } };

function riskClass(r: RiskLevel | null): string {
  switch (r) {
    case "critical": return "bg-red-100 text-red-800";
    case "high": return "bg-orange-100 text-orange-800";
    case "medium": return "bg-amber-100 text-amber-800";
    case "low": return "bg-slate-100 text-slate-700";
    default: return "bg-ink/[0.06] text-ink-soft";
  }
}
function statusClass(s: ReportStatus | null): string {
  return s === "new" ? "bg-tangerine-mist text-ink" : "bg-ink/[0.06] text-ink-soft";
}
function fmt(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ts; }
}

export default async function SafeguardingQueuePage() {
  const lead = await requireSafeguardingLead();
  if (!lead) {
    // Any admin who isn't the safeguarding lead is bounced — they never see it.
    redirect("/admin");
  }

  const reports = await listSafeguardingReports({ status: "all" });
  const openCount = reports.filter((r) => r.status !== "resolved" && r.status !== "closed").length;

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-display text-2xl text-ink">Safeguarding reports</h1>
        <span className="text-xs uppercase tracking-[0.14em] font-mono text-tangerine-deep bg-orange-pale/60 rounded-full px-2.5 py-1">
          Lead only
        </span>
      </div>
      <p className="text-sm text-ink-soft mb-6">
        {reports.length} total · {openCount} open. Visible only to the safeguarding lead.
      </p>

      <div className="mb-6">
        <SafeguardingEmailLogForm />
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-ink/[0.08] bg-white p-10 text-center text-ink-soft">
          No safeguarding reports.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/admin/safeguarding-reports/${r.id}`}
              className="block rounded-2xl border border-ink/[0.08] bg-white p-5 hover:border-ink/25 transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${statusClass(r.status)}`}>
                  {r.status ? REPORT_STATUS_LABELS[r.status] : "—"}
                </span>
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${riskClass(r.risk_level)}`}>
                  {r.risk_level ? `Risk: ${RISK_LEVEL_LABELS[r.risk_level]}` : "Risk: untriaged"}
                </span>
                <span className="text-xs text-ink-soft">
                  {r.report_type ? REPORT_TYPE_LABELS[r.report_type as ReportType] : "—"}
                </span>
                {r.source === "email_logged_manually" ? (
                  <span className="text-[11px] text-ink-soft border border-ink/15 rounded-full px-2 py-0.5">
                    logged from email
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-ink-soft">{fmt(r.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-ink line-clamp-2">
                {(r.description ?? "").slice(0, 180)}
                {(r.description ?? "").length > 180 ? "…" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
