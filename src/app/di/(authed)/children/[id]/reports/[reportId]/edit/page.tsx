// Spine 1.2 — Edit + resubmit a report after admin asked for changes.
//
// Only resolves when:
//  - the child is in the DI's scope
//  - the report belongs to this DI (created_by === userId)
//  - the report's status is 'correction_requested'
//
// All guards live in getReportForResubmit + are re-enforced on POST
// by resubmitReport (admin could have re-claimed/approved while the
// page was open — the form surfaces that as a friendly error).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById } from "@/lib/di-children";
import { getReportForResubmit } from "@/lib/di-reports";
import { ResubmitReportForm } from "@/components/di/ResubmitReportForm";

export const dynamic = "force-dynamic";

export default async function DiEditReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const session = await requireDiUser();
  const { id, reportId } = await params;

  const [child, report] = await Promise.all([
    getDiChildById(id, session.userId),
    getReportForResubmit(session.userId, reportId),
  ]);
  if (!child) notFound();
  if (!report) notFound();
  // Belt + braces: the report row could exist + be the DI's own but
  // attached to a different child than the URL claims. Refuse.
  if (report.childId !== id) notFound();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href={`/di/children/${id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {child.display_name || "Child"}
      </Link>

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Edit &amp; resubmit
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Address admin&apos;s note and send {child.display_name || "this child"}
          &apos;s report back for review.
        </p>
      </header>

      <ResubmitReportForm
        reportId={report.id}
        childId={id}
        childName={child.display_name || "this child"}
        correctionReason={report.correctionReason}
        initial={{
          title: report.title,
          content: report.content,
          visibility: report.visibility,
          photoUuid: report.photoUuid,
        }}
      />
    </div>
  );
}
