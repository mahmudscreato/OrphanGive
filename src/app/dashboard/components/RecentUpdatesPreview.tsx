import Link from "next/link";
import type { ChildMoment, ChildReport } from "@/lib/dashboard-data";
import { MomentRow } from "./MomentRow";
import { ReportRow } from "./ReportRow";

type Props = {
  moments: ChildMoment[];
  // feat/donor-dashboard-home — published reports now sit alongside moments
  // in the glance, matching the full /dashboard/updates feed (both come from
  // the same donor-scoped readers).
  reports?: ChildReport[];
  primaryChildName: string | null;
};

// feat/donor-dashboard-home — one aggregated item so moments and reports
// interleave chronologically, same discriminator the updates feed uses.
type PreviewItem =
  | { kind: "moment"; date: number; data: ChildMoment }
  | { kind: "report"; date: number; data: ChildReport };

function toTime(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Compact preview of the donor's most recent updates. Renders only the
// top 3 with a link to the full /dashboard/updates timeline. The
// dashboard home calls this; the full timeline lives elsewhere.
export function RecentUpdatesPreview({
  moments,
  reports = [],
  primaryChildName,
}: Props) {
  const items: PreviewItem[] = [
    ...moments.map(
      (m): PreviewItem => ({
        kind: "moment",
        date: toTime(m.taken_at ?? m.date_created),
        data: m,
      }),
    ),
    ...reports.map(
      (r): PreviewItem => ({
        kind: "report",
        date: toTime(r.published_at),
        data: r,
      }),
    ),
  ].sort((a, b) => b.date - a.date);

  const top = items.slice(0, 3);
  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-[640px]">
          <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
            Recent updates
          </h2>
          {top.length > 0 ? (
            <p className="mt-2 text-[14px] text-slate italic">
              The latest from the children you support
            </p>
          ) : null}
        </div>
        {items.length > top.length ? (
          <Link
            href="/dashboard/updates"
            className="text-[13px] text-tangerine-deeper hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
          >
            See all updates →
          </Link>
        ) : null}
      </div>

      {top.length === 0 ? (
        <p className="mt-6 text-[14px] text-slate-soft leading-[1.6] max-w-[560px]">
          Updates from{" "}
          {primaryChildName
            ? `${primaryChildName} and the others you support`
            : "the children you support"}{" "}
          will appear here as our team shares them.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {top.map((item) =>
            item.kind === "moment" ? (
              <MomentRow key={`m-${item.data.id}`} moment={item.data} />
            ) : (
              <ReportRow key={`r-${item.data.id}`} report={item.data} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

export default RecentUpdatesPreview;
