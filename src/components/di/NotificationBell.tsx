// Session 47 — Notification bell + dropdown.
//
// Client component. Polls /api/di/notifications on mount + every 60s
// to keep the unread badge fresh. Click opens a dropdown showing the
// last 10 notifications with relative timestamps; "View all" routes
// to /di/notifications.
//
// Placed in BOTH the mobile DiHeader (top-right) and the desktop
// DiSidebar (above the nav). Both call sites pass `variant` to pick
// the dropdown anchor direction (mobile: drop down-right; desktop:
// drop down-left so it sits inside the sidebar column).

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  Edit3,
  FileBarChart,
  FileEdit,
  HeartHandshake,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  NotificationSummary,
  NotificationType,
} from "@/lib/di-notifications";

const POLL_INTERVAL_MS = 60_000;

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  admin_approved_proposal: CheckCircle2,
  admin_rejected_proposal: XCircle,
  // Session 60 — change-request lands the proposal back in the DI's
  // drafts queue; FileEdit signals "your turn to edit".
  admin_requested_proposal_changes: FileEdit,
  // Session 52b — review queue notifications reuse the proposal pair's
  // approval/rejection icons for visual consistency.
  admin_approved_document: CheckCircle2,
  admin_rejected_document: XCircle,
  admin_approved_intake_photo: CheckCircle2,
  admin_rejected_intake_photo: XCircle,
  admin_approved_moment: CheckCircle2,
  admin_rejected_moment: XCircle,
  // Session 52d — post-approval removes.
  admin_removed_approved_document: XCircle,
  admin_removed_approved_intake_photo: XCircle,
  admin_assigned_child: HeartHandshake,
  admin_assigned_task: FileBarChart,
  // fix/task-fulfillment-loop — task verified vs sent back to redo.
  admin_verified_task: CheckCircle2,
  admin_rejected_task: Edit3,
  admin_verified_delivery: Truck,
  // Session 66 — re-upload requests. Edit3 reads as "needs revision".
  admin_requested_document_reupload: Edit3,
  admin_requested_intake_reupload: Edit3,
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

function hrefFor(n: NotificationSummary): string {
  if (n.relatedCollection === "child_proposal") return "/di/submissions";
  if (n.relatedCollection === "task") return "/di/tasks";
  if (n.relatedCollection === "child" && n.relatedId) {
    return `/di/children/${n.relatedId}`;
  }
  return "/di/notifications";
}

export function NotificationBell({
  variant = "header",
  fallbackUnreadCount = 0,
}: {
  variant?: "header" | "sidebar";
  // Optional initial count from a server-side render to avoid bell
  // flicker before the first /api fetch returns.
  fallbackUnreadCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(fallbackUnreadCount);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadCount = useCallback(async () => {
    try {
      // Cheap call: just need the unreadCount on the badge; we use
      // limit=1 to keep the response small but still get the count.
      const res = await fetch("/api/di/notifications?limit=1", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { unreadCount?: number };
      if (typeof body.unreadCount === "number") {
        setUnreadCount(body.unreadCount);
      }
    } catch {
      // Silent — bell badge is informational, not critical.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/di/notifications?limit=10", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        notifications?: NotificationSummary[];
        unreadCount?: number;
      };
      if (Array.isArray(body.notifications)) setItems(body.notifications);
      if (typeof body.unreadCount === "number") setUnreadCount(body.unreadCount);
    } catch {
      // Silent.
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial count fetch + poll.
  useEffect(() => {
    void loadCount();
    const t = setInterval(() => {
      void loadCount();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadCount]);

  // Load the list when opened.
  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  // Click-outside dismissal.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onClickItem(n: NotificationSummary) {
    if (!n.read) {
      // Optimistic: drop the count immediately, then fire-and-forget
      // the read POST. If it fails, the next poll re-syncs.
      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((arr) =>
        arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      void fetch(`/api/di/notifications/${n.id}/read`, { method: "POST" });
    }
    setOpen(false);
  }

  // Sidebar variant drops the dropdown to the LEFT-ALIGNED inside
  // the sidebar; header variant drops to the right edge of the
  // viewport (mobile-friendly).
  const dropdownPosition =
    variant === "sidebar"
      ? "left-0 top-full mt-2"
      : "right-0 top-full mt-2";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-tangerine-mist/50 transition-colors"
      >
        <Bell className="w-5 h-5 stroke-[1.75] text-ink-soft" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-tangerine text-white text-[10px] font-semibold tabular-nums"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute ${dropdownPosition} z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-stone-200 shadow-lg overflow-hidden`}
        >
          <div className="px-4 py-3 border-b border-stone-200">
            <h3 className="font-display text-[16px] text-ink leading-tight">
              Notifications
            </h3>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-ink-soft">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[13.5px] text-ink-soft">All caught up.</p>
                <p className="font-script italic text-[15px] text-tangerine-deeper mt-1">
                  Nothing new here.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  return (
                    <li
                      key={n.id}
                      className={
                        n.read
                          ? "border-b border-stone-100 last:border-b-0"
                          : "border-b border-stone-100 last:border-b-0 bg-tangerine-mist/30 border-l-2 border-l-tangerine"
                      }
                    >
                      <Link
                        href={hrefFor(n)}
                        onClick={() => onClickItem(n)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-tangerine-mist/40 transition-colors"
                      >
                        <span
                          className="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-tangerine-mist text-tangerine-deeper"
                          aria-hidden="true"
                        >
                          <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={
                              n.read
                                ? "text-[13.5px] text-ink-soft leading-snug"
                                : "text-[13.5px] text-ink font-medium leading-snug"
                            }
                          >
                            {n.title}
                          </p>
                          {n.body ? (
                            <p className="text-[12.5px] text-ink-soft mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          ) : null}
                          <p className="text-[11.5px] text-ink-soft/80 mt-1">
                            {relativeTime(n.dateCreated)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-stone-200 bg-stone-50/50">
            <Link
              href="/di/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-[13px] font-medium text-tangerine-deeper hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
