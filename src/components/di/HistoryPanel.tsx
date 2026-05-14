// Session 46 — History tab content for Child Detail.
//
// Server component. Replaces the Session 43 ComingSoonPanel for the
// History tab. Renders the chronological audit trail of DI actions
// touching this child (edit proposals, moments, reports, deliveries,
// withdrawals).
//
// File uploads (raw photo / video to directus_files) DON'T appear
// here — they audit at the collection level without childId metadata,
// because at upload time we don't yet know which child they're for.
// The follow-on row mutation (the moment / report / delivery they
// became part of) is what surfaces.

import {
  Camera,
  Edit3,
  FileBarChart,
  History as HistoryIcon,
  ListChecks,
  Trash2,
  Truck,
  Video,
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
};

// Compact relative time for the activity feed. Bigger gaps fall back
// to absolute date so "yesterday at 3:14pm" doesn't lie 6 months in.
function formatRelative(iso: string | null): string {
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
    year: "numeric",
  }).format(d);
}

function HistoryEventRow({ event }: { event: HistoryEvent }) {
  const Icon = ACTION_ICON[event.action] ?? HistoryIcon;
  return (
    <li className="flex gap-3 py-3 border-b border-stone-200 last:border-b-0">
      <div
        className="shrink-0 w-9 h-9 rounded-full bg-tangerine-mist text-tangerine-deeper flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="w-4 h-4 stroke-[1.75]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-ink leading-snug">
          {event.description}
        </p>
        <p className="text-[12px] text-ink-soft mt-0.5">
          {formatRelative(event.timestamp)}
        </p>
      </div>
    </li>
  );
}

export function HistoryPanel({ events }: { events: HistoryEvent[] }) {
  return (
    <section
      aria-label="History"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[20px] text-ink leading-tight mb-4">
        History
      </h2>

      {events.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <HistoryIcon className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Your record begins here.
          </p>
          <p className="text-[14.5px] text-ink leading-relaxed mb-1">
            No activity yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto">
            As you submit changes and uploads, they appear here.
          </p>
        </div>
      ) : (
        <ul>
          {events.map((e) => (
            <HistoryEventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
