import Link from "next/link";
import type { ChildMoment } from "@/lib/dashboard-data";
import { MomentRow } from "./MomentRow";

type Props = {
  moments: ChildMoment[];
  primaryChildName: string | null;
};

// Compact preview of the donor's most recent moments. Renders only the
// top 3 with a link to the full /dashboard/updates timeline. The
// dashboard home calls this; the full timeline lives elsewhere.
export function RecentUpdatesPreview({ moments, primaryChildName }: Props) {
  const top = moments.slice(0, 3);
  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-[640px]">
          <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0">
            Recent updates
          </h2>
          {top.length > 0 ? (
            <p className="mt-2 text-[14px] text-slate italic">
              Latest moments from the children you support
            </p>
          ) : null}
        </div>
        {moments.length > top.length ? (
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
          {top.map((m) => (
            <MomentRow key={m.id} moment={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default RecentUpdatesPreview;
