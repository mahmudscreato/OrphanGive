// Session 45 — Reports tab content for Child Detail.

import Link from "next/link";
import { FileBarChart, Upload } from "lucide-react";
import type { ReportSummary } from "@/lib/di-reports";
import { ReportCard } from "./ReportCard";

export function ReportsPanel({
  reports,
  childId,
}: {
  reports: ReportSummary[];
  childId: string;
}) {
  return (
    <section
      aria-label="Reports"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-[20px] text-ink leading-tight">
          Reports
        </h2>
        <Link
          href={`/di/children/${childId}/reports/new`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tangerine text-white text-[13.5px] font-medium hover:bg-tangerine-deep transition-colors"
        >
          <Upload className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Submit report
        </Link>
      </header>

      {reports.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <FileBarChart className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Donors look forward to these.
          </p>
          <p className="text-[14.5px] text-ink leading-relaxed mb-1">
            No reports yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto">
            Submit a story, academic update, or milestone — admin reviews
            before donors see it.
          </p>
        </div>
      ) : (
        <div>
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </section>
  );
}
