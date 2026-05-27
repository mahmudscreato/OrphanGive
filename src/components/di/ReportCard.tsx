// Session 45 — single report card.
//
// Server component. The narrative truncates with "Read more" — but
// since the panel is server-rendered we use a CSS-only details/summary
// pattern that doesn't require client JS.

import Image from "next/image";
import Link from "next/link";
import { Edit3, Eye, Globe, Lock, RotateCcw } from "lucide-react";
import { StatusPill } from "./StatusPill";
import type { ReportSummary, ReportType } from "@/lib/di-reports";

const TYPE_LABEL: Record<ReportType, string> = {
  story: "Story",
  academic: "Academic",
  health: "Health",
  milestone: "Milestone",
  eid_greeting: "Eid greeting",
  letter: "Letter",
  photo: "Photo",
};

const TYPE_BG: Record<ReportType, string> = {
  story: "bg-tangerine-mist text-tangerine-deeper",
  academic: "bg-stone-100 text-ink-soft",
  health: "bg-moss-soft text-moss-deep",
  milestone: "bg-tangerine-mist text-tangerine-deeper",
  eid_greeting: "bg-tangerine-mist text-tangerine-deeper",
  letter: "bg-stone-100 text-ink-soft",
  photo: "bg-stone-100 text-ink-soft",
};

const PREVIEW_CHAR_LIMIT = 280;

function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function ReportCard({
  report,
  childId,
}: {
  report: ReportSummary;
  // Spine 1.2 — required for the "Edit & resubmit" link when the
  // report is in correction_requested status. ReportsPanel always
  // passes it; donor-side views never render this branch.
  childId: string;
}) {
  const VisIcon = report.visibility === "sponsor_only" ? Lock : Globe;
  const visLabel =
    report.visibility === "sponsor_only" ? "Sponsor only" : "All donors";

  const isLong = report.content.length > PREVIEW_CHAR_LIMIT;
  const preview = isLong
    ? `${report.content.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}…`
    : report.content;

  const publishedLine = formatLongDate(report.publishedAt);
  const needsCorrection = report.status === "correction_requested";

  return (
    <article className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 mb-3">
      {/* Spine 1.2 — when admin sent the report back, the reason +
          "Edit & resubmit" affordance go at the TOP so the DI can't
          miss them. Banner copy uses amber per StatusPill's
          correction_requested palette for visual continuity. */}
      {needsCorrection ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <RotateCcw
              className="w-4 h-4 text-amber-800 stroke-[2] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-amber-900 leading-snug">
                Admin asked for changes
              </p>
              {report.correctionReason ? (
                <p className="mt-1 text-[13px] text-amber-900 leading-relaxed">
                  {report.correctionReason}
                </p>
              ) : (
                <p className="mt-1 text-[13px] italic text-amber-900/80">
                  No specific note provided.
                </p>
              )}
              <Link
                href={`/di/children/${childId}/reports/${report.id}/edit`}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-tangerine text-white text-[13px] font-medium hover:bg-tangerine-deep transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
                Edit &amp; resubmit
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Type + status */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${TYPE_BG[report.type]}`}
        >
          {TYPE_LABEL[report.type]}
        </span>
        <span className="inline-flex items-center gap-1 text-[11.5px] font-mono text-ink-soft">
          <VisIcon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
          {visLabel}
        </span>
        {report.status !== "published" ? (
          <span className="ml-auto">
            <StatusPill kind={report.status} />
          </span>
        ) : null}
      </div>

      {/* Title */}
      <h3 className="font-display text-[18px] text-ink leading-snug mt-2">
        {report.title}
      </h3>

      {/* Narrative — open/expand via <details> for zero-JS */}
      {isLong ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none">
            <p className="text-[14.5px] text-ink leading-relaxed whitespace-pre-line">
              {preview}
            </p>
            <span className="inline-flex items-center gap-1 mt-1 text-[12.5px] font-medium text-tangerine-deeper hover:underline group-open:hidden">
              <Eye className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
              Read more
            </span>
          </summary>
          <p className="text-[14.5px] text-ink leading-relaxed whitespace-pre-line">
            {report.content}
          </p>
        </details>
      ) : (
        <p className="mt-2 text-[14.5px] text-ink leading-relaxed whitespace-pre-line">
          {report.content}
        </p>
      )}

      {/* Photo */}
      {report.photoUrl ? (
        <div className="mt-3 relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-tangerine-mist">
          <Image
            src={report.photoUrl}
            alt={report.title}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      ) : null}

      {/* Rejection note */}
      {report.status === "rejected" && report.rejectionReason ? (
        <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">
          <span className="text-ink font-medium">Reason:</span>{" "}
          {report.rejectionReason}
        </p>
      ) : null}

      {/* Submitter line */}
      <div className="mt-3 text-[12.5px] text-ink-soft">
        Submitted by {report.submittedByName}
        {publishedLine ? <> · published {publishedLine}</> : null}
      </div>
    </article>
  );
}
