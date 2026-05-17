// Session 47 — Full notifications list (client component).
//
// Server-loaded the initial list via /di/notifications page; this
// client component handles the per-row "mark as read" optimistic
// updates and the bulk "Mark all as read" action.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Bell,
  CheckCircle2,
  FileBarChart,
  HeartHandshake,
  Loader2,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  NotificationSummary,
  NotificationType,
} from "@/lib/di-notifications";

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  admin_approved_proposal: CheckCircle2,
  admin_rejected_proposal: XCircle,
  // Session 52b — same icon pairs for the new review queue actions.
  admin_approved_document: CheckCircle2,
  admin_rejected_document: XCircle,
  admin_approved_intake_photo: CheckCircle2,
  admin_rejected_intake_photo: XCircle,
  admin_approved_moment: CheckCircle2,
  admin_rejected_moment: XCircle,
  admin_assigned_child: HeartHandshake,
  admin_assigned_task: FileBarChart,
  admin_verified_delivery: Truck,
};

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function hrefFor(n: NotificationSummary): string {
  if (n.relatedCollection === "child_proposal") return "/di/submissions";
  if (n.relatedCollection === "task") return "/di/tasks";
  if (n.relatedCollection === "child" && n.relatedId) {
    return `/di/children/${n.relatedId}`;
  }
  return "/di/notifications";
}

export function NotificationsList({
  initial,
}: {
  initial: NotificationSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationSummary[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter((n) => !n.read).length;

  function onClickRow(n: NotificationSummary) {
    if (n.read) return;
    setItems((arr) =>
      arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    );
    void fetch(`/api/di/notifications/${n.id}/read`, { method: "POST" });
  }

  function onMarkAll() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/di/notifications/read-all", {
          method: "POST",
        });
        if (!res.ok) {
          setError("Couldn't mark all as read. Refresh and try again.");
          return;
        }
        setItems((arr) => arr.map((x) => ({ ...x, read: true })));
        // Soft refresh so the bell badge re-syncs (the server-rendered
        // bell uses fresh fetch on every navigation).
        router.refresh();
      } catch {
        setError("Network issue. Try again.");
      }
    });
  }

  return (
    <div>
      {/* Session 48a polish — header bar:
          - "Mark all as read" button is now always rendered (disabled
            when there's nothing to mark) so the affordance is
            discoverable at a glance.
          - The "You're all caught up" copy that previously lived here
            is moved to the empty state below — it was misleadingly
            appearing above non-empty (all-read) lists. */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="text-[14px] text-ink-soft">
          {unreadCount > 0 ? (
            <>
              <span className="text-ink font-medium">{unreadCount}</span>{" "}
              unread
              {items.length > 0 ? (
                <span className="text-ink-soft/80"> of {items.length}</span>
              ) : null}
            </>
          ) : items.length > 0 ? (
            <>
              <span className="text-ink font-medium">{items.length}</span>{" "}
              total · all read
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onMarkAll}
          disabled={pending || unreadCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stone-300 text-[13px] font-medium text-slate hover:bg-stone-50 hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={
            unreadCount === 0
              ? "Nothing to mark — all read"
              : `Mark all ${unreadCount} unread as read`
          }
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          Mark all as read
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#9A2424]">
          {error}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-4"
            aria-hidden="true"
          >
            <Bell className="w-7 h-7 stroke-[1.5]" />
          </div>
          {/* Session 48a — "You're all caught up" copy moved here from
              the header bar. The Caveat italic accent matches the
              other empty-state moods across the DI surface. */}
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            You&apos;re all caught up.
          </p>
          <p className="font-display text-[20px] text-ink mb-2">No notifications yet.</p>
          <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto">
            When admin reviews your submissions or assigns you new work,
            it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <li
                key={n.id}
                className={
                  n.read
                    ? "rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden"
                    : "rounded-2xl bg-tangerine-mist/30 border border-tangerine-soft shadow-sm overflow-hidden border-l-2 border-l-tangerine"
                }
              >
                <Link
                  href={hrefFor(n)}
                  onClick={() => onClickRow(n)}
                  className="block p-4 hover:bg-tangerine-mist/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="shrink-0 mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-full bg-tangerine-mist text-tangerine-deeper"
                      aria-hidden="true"
                    >
                      <Icon className="w-4 h-4 stroke-[1.75]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={
                          n.read
                            ? "text-[14.5px] text-ink-soft leading-snug"
                            : "text-[14.5px] text-ink font-medium leading-snug"
                        }
                      >
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="text-[11.5px] text-ink-soft/80 mt-2">
                        {formatLongDate(n.dateCreated)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
