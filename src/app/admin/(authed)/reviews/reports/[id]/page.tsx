// Spine 1.2 — Admin report review detail.
//
// Shows the report (Tier-1 child fields only), the DI-attributed
// metadata (submitter + filed-at), the linked sponsorship + task,
// the DI's original narrative (preserved verbatim — forensic), and
// the editable donor_text. Actions: claim, edit-donor-text, approve,
// send-back-for-correction.
//
// Logs admin_viewed_report on every render (force-dynamic). The
// metadata carries only IDs + enums — never the report text itself.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, FileBarChart, User2 } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminReportDetail } from "@/lib/admin-reports";
import { recordAuditEvent } from "@/lib/di-audit";
import { ReportReviewActions } from "@/components/admin/ReportReviewActions";
import { StatusPill, type StatusPillKind } from "@/components/di/StatusPill";

export const dynamic = "force-dynamic";

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

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const report = await getAdminReportDetail(id);
  if (!report) notFound();

  // Audit the read. Metadata: IDs + enums + report_type only —
  // NEVER the donor_text / content body. The audit reader and the
  // admin's child-detail history pane both display the action
  // without ever exposing the text.
  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_report",
    collection: "child_update",
    recordId: report.id,
    metadata: {
      ...(report.child_id ? { childId: report.child_id } : {}),
      ...(report.sponsorship_id
        ? { sponsorshipId: report.sponsorship_id }
        : {}),
      ...(report.task_id ? { taskId: report.task_id } : {}),
      ...(report.report_type ? { reportType: report.report_type } : {}),
      status: report.status,
    },
  });

  const childLabel = report.child_display_name ?? "Unknown child";
  const initialDonorText = report.donor_text ?? report.content ?? "";
  const showPriorCorrection =
    report.status === "correction_requested" || report.status === "submitted_by_di";

  const photoUrl = report.photo ? `/api/assets/${report.photo}` : null;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <Link
        href="/admin/reviews/reports"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All reports
      </Link>

      <header className="mb-6 md:mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
            <FileBarChart
              className="w-5 h-5 stroke-[1.75]"
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
              {report.title}
            </h1>
            <p className="mt-1 text-[14px] text-ink-soft">
              {childLabel}
              {report.child_division_name ? (
                <span className="text-stone-400">
                  {" · "}
                  {report.child_division_name}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusPill kind={statusToPillKind(report.status)} />
          {report.report_type ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-700">
              {report.report_type === "progress"
                ? "Progress report"
                : "Deployment confirmation"}
            </span>
          ) : null}
          {report.sponsorship_id ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-moss-soft text-moss-deep">
              Sponsorship-tied
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <User2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {report.submitter_display_name ?? "Unknown DI"}
          </span>
          {report.donor_text_edited_at ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
              Last edited {formatTimestamp(report.donor_text_edited_at)}
              {report.donor_text_edited_by_display
                ? ` by ${report.donor_text_edited_by_display}`
                : ""}
            </span>
          ) : null}
        </div>
      </header>

      {photoUrl ? (
        <section
          className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden"
          aria-label="Report photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={`Photo for ${report.title}`}
            className="w-full h-auto bg-stone-100"
          />
        </section>
      ) : null}

      <ReportReviewActions
        reportId={report.id}
        status={report.status}
        initialDonorText={initialDonorText}
        diOriginal={report.content}
        priorCorrectionReason={
          showPriorCorrection ? report.correction_reason : null
        }
        childDisplayName={childLabel}
      />
    </div>
  );
}
