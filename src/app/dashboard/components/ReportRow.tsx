import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatTimeAgo, type ChildReport } from "@/lib/dashboard-data";

// fix/donor-updates-feed (U1) — a single published report in the
// aggregated updates timeline. Mirrors MomentRow's card styling, with a
// "Report" tag to distinguish it, a title, and a link to the
// per-sponsorship detail page where the donor reads the full report
// (falls back to the child profile if the sponsorship id is missing).
export function ReportRow({ report }: { report: ChildReport }) {
  const photoSrc = directusAssetUrl(report.photo);
  const childPhotoSrc = directusAssetUrl(report.child_photo);
  const childName = report.child_name ?? "A child";
  const when = formatTimeAgo(report.published_at);
  const href = report.sponsorship_id
    ? `/dashboard/sponsorship/${report.sponsorship_id}`
    : report.child_id
      ? `/children/${report.child_id}`
      : null;

  return (
    <li className="rounded-[16px] bg-white border border-ink/[0.06] p-4 flex items-start gap-4 max-md:flex-col max-md:gap-3">
      {photoSrc ? (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-tangerine-mist shrink-0">
          <ProtectedChildImage
            src={photoSrc}
            alt={`Report photo of ${childName}`}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        </div>
      ) : childPhotoSrc ? (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-tangerine-mist shrink-0">
          <ProtectedChildImage
            src={childPhotoSrc}
            alt={childName}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          {report.child_id ? (
            <Link
              href={`/children/${report.child_id}`}
              className="font-display text-[18px] text-ink leading-tight hover:text-tangerine-deeper transition-colors"
            >
              {childName}
            </Link>
          ) : (
            <span className="font-display text-[18px] text-ink leading-tight">
              {childName}
            </span>
          )}
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-tangerine-deep bg-tangerine-mist rounded-full px-2 py-0.5">
            Report
          </span>
          {when ? (
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-slate-soft">
              · {when}
            </span>
          ) : null}
        </div>
        {report.title ? (
          <p className="mt-1 font-display text-[15px] text-ink leading-snug">
            {report.title}
          </p>
        ) : null}
        {report.body ? (
          <p className="mt-1 text-[14px] text-ink/80 leading-snug line-clamp-3">
            {report.body}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-slate-soft italic">
            New report shared.
          </p>
        )}
        {href ? (
          <Link
            href={href}
            className="mt-2 inline-block text-[13px] font-medium text-tangerine-deep hover:text-tangerine-deeper transition-colors"
          >
            Read the update →
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default ReportRow;
