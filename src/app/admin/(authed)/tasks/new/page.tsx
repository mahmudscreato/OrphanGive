// Spine 1.1 — Standalone "new task" entry.
//
// Lists recent sponsorships so admin can pick one before composing
// the task. Once picked, the row click-throughs to
// /admin/sponsorships/[id] where the existing "Field work" panel
// + Create field task modal lives. (Single source of truth for the
// task-creation form — avoids drift between two surfaces.)
//
// Privacy: list renders Tier-1 child fields only (display_name +
// division name).

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  listSelectableSponsorships,
  type SelectableSponsorship,
} from "@/lib/admin-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New task · OrphanGive",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function NewTaskPage() {
  const session = await requireAdminUser();
  if (!session) return null;

  const sponsorships = await listSelectableSponsorships();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <Link
        href="/admin/tasks"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All tasks
      </Link>

      <header className="mb-6">
        <h1 className="font-display text-[28px] md:text-[32px] text-ink leading-tight tracking-tight">
          New field task
        </h1>
        <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">
          Pick the sponsorship this task is for. The next step opens the
          create-task form pre-filled with the right context.
        </p>
      </header>

      {sponsorships.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 p-10 text-center">
          <p className="text-[14px] text-ink leading-relaxed">
            No selectable sponsorships found.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sponsorships.map((s) => (
            <li key={s.id}>
              <SponsorshipRow s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SponsorshipRow({ s }: { s: SelectableSponsorship }) {
  const childLabel = s.child_display_name ?? (s.cause_tag ?? "Campaign");
  const subtitle = s.child_display_name
    ? s.child_division_name
      ? `${s.child_division_name} · ${s.payment_mode === "one_time" ? "One-time" : "Monthly"}`
      : s.payment_mode === "one_time"
        ? "One-time"
        : "Monthly"
    : `Campaign · ${s.payment_mode === "one_time" ? "One-time" : "Monthly"}${s.cause_tag ? ` · ${s.cause_tag}` : ""}`;

  return (
    <Link
      href={`/admin/sponsorships/${s.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-stone-200 p-4 hover:shadow-sm hover:border-tangerine-soft transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
          <h3 className="font-display text-[15.5px] text-ink leading-tight">
            {childLabel}
          </h3>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
              s.status === "active"
                ? "bg-moss-soft text-moss-deep"
                : s.status === "completed"
                  ? "bg-stone-100 text-stone-700"
                  : "bg-tangerine-mist text-tangerine-deeper"
            }`}
          >
            {s.status}
          </span>
        </div>
        <p className="text-[12.5px] text-ink-soft leading-snug">
          {subtitle} · donor {s.donor_label} · created{" "}
          {formatDate(s.date_created)}
        </p>
      </div>
      <ChevronRight
        className="w-4 h-4 text-ink-soft stroke-[1.75] shrink-0"
        aria-hidden="true"
      />
    </Link>
  );
}
