// Session 47 — Recent Activity home-page preview panel.
//
// Server component. Renders up to 8 audit_log events relevant to
// this DI: their own actions plus admin actions on children in their
// scope. Each row links to a detail page where applicable.

import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  Edit3,
  FileBarChart,
  Home,
  ImagePlus,
  ListChecks,
  Trash2,
  Truck,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AuditAction, HistoryEvent } from "@/lib/di-audit";

const ACTION_ICON: Record<AuditAction, LucideIcon> = {
  di_submitted_proposal: Edit3,
  di_withdrew_proposal: Trash2,
  di_uploaded_moment: Camera,
  di_submitted_report: FileBarChart,
  di_marked_delivery: Truck,
  di_started_task: ListChecks,
  di_completed_task: ListChecks,
  di_uploaded_photo: Camera,
  di_uploaded_video: Video,
  // Session 48b — intake-photo lifecycle.
  di_uploaded_intake_photo: ImagePlus,
  di_edited_intake_photo: Edit3,
  di_deleted_intake_photo: Trash2,
  admin_approved_proposal: CheckCircle2,
  admin_rejected_proposal: XCircle,
};

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

// Click-target heuristic: route to the most useful page for each
// collection. Falls back to /di for unknown collections.
function hrefFor(event: HistoryEvent): string {
  switch (event.collection) {
    case "child_proposal":
      return "/di/submissions";
    case "child_moment":
    case "child_update":
    case "aid_delivery":
      // No single per-row detail page yet for these — drop back to
      // the children list, where DI can re-enter via the right child.
      return "/di/children";
    case "task":
      return "/di/tasks";
    default:
      return "/di";
  }
}

export function RecentActivityPanel({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2 mb-4">
        <Home
          className="w-4 h-4 text-tangerine-deeper stroke-[1.75]"
          aria-hidden="true"
        />
        <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
          Recent activity
        </h3>
      </header>

      {events.length === 0 ? (
        <div className="py-6 text-center">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-tangerine-mist text-tangerine-deeper mb-2"
            aria-hidden="true"
          >
            <Home className="w-5 h-5 stroke-[1.5]" />
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            No recent activity yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => {
            const Icon = ACTION_ICON[e.action] ?? Home;
            return (
              <li key={e.id}>
                <Link
                  href={hrefFor(e)}
                  className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-tangerine-mist/30 transition-colors"
                >
                  <span
                    className="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-tangerine-mist text-tangerine-deeper"
                    aria-hidden="true"
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] text-ink leading-snug">
                      {e.description}
                    </p>
                    <p className="text-[11.5px] text-ink-soft mt-0.5">
                      {relativeTime(e.timestamp)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
