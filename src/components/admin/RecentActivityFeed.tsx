// Admin Lot 1 — recent activity feed for the admin home dashboard.
//
// Reads from getAdminDashboardData().recentActivity (already
// resolved + labeled by lib/admin-dashboard.ts). Each row links to
// the subject's admin URL when one is available.
//
// Privacy: this surface NEVER reads audit metadata directly — the
// data layer already returned human labels via formatActionLabel
// and a subject link via resolveAuditSubjectLink. Tier-3 fields
// cannot leak here.

import Link from "next/link";
import type { Route } from "next";
import { Clock } from "lucide-react";
import type { RecentActivityEvent } from "@/lib/admin-dashboard";
import { ACTOR_ROLE_STYLES } from "@/lib/audit-labels";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(d);
}

export function RecentActivityFeed({
  events,
}: {
  events: RecentActivityEvent[];
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-ink/[0.06] p-8 text-center">
        <p className="text-[13.5px] text-ink-soft italic">
          No recent activity to show.
        </p>
      </div>
    );
  }
  return (
    <ul className="rounded-2xl bg-white border border-ink/[0.06] divide-y divide-ink/[0.06] overflow-hidden">
      {events.map((e) => {
        const roleStyle = ACTOR_ROLE_STYLES[e.actorRole];
        const inner = (
          <div className="flex items-center gap-3 px-4 py-3 md:px-5 md:py-3.5 hover:bg-tangerine-mist/40 transition-colors">
            <span
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${roleStyle.pillBg} ${roleStyle.pillText}`}
            >
              {roleStyle.label}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] text-ink leading-snug truncate">
                <span className="font-medium">{e.actorLabel}</span>{" "}
                <span className="text-ink-soft">— {e.actionLabel}</span>
              </p>
              {e.subject ? (
                <p className="text-[11.5px] text-slate-soft mt-0.5">
                  {e.subject.label}
                </p>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-soft shrink-0">
              <Clock className="w-3 h-3 stroke-[1.75]" aria-hidden="true" />
              {relativeTime(e.timestamp)}
            </span>
          </div>
        );
        return (
          <li key={e.id}>
            {e.subject ? (
              <Link
                href={e.subject.href as Route}
                className="block"
                title={e.actionLabel}
              >
                {inner}
              </Link>
            ) : (
              <div className="block">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
