// Session 42 — DI Dashboard mobile bottom navigation.
//
// 5 fixed tabs along the bottom of the viewport on mobile. Hidden
// on desktop (md:hidden) where DiSidebar takes over. Active state
// uses tangerine; inactive is ink-soft.
//
// Tap targets are min 56px tall — comfortable for thumb reach.
// Fixed positioning so the nav stays visible while scrolling; the
// (authed) layout adds bottom padding to <main> so content isn't
// hidden behind it.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileEdit,
  History,
  Home,
  Inbox,
  ListTodo,
  User,
  Users,
} from "lucide-react";

// Session 52d — Drafts added as 4th tab (between Children and
// Tasks) to mirror the desktop sidebar. 6 tabs on mobile is
// tighter but workable; the badge gives Drafts visual priority
// when there's work waiting.
const TABS: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  badgeKey?: "drafts";
}> = [
  { href: "/di", label: "Home", icon: Home, exact: true },
  { href: "/di/children", label: "Children", icon: Users, exact: false },
  {
    href: "/di/drafts",
    label: "Drafts",
    icon: FileEdit,
    exact: false,
    badgeKey: "drafts",
  },
  { href: "/di/tasks", label: "Tasks", icon: ListTodo, exact: false },
  { href: "/di/submissions", label: "Submissions", icon: Inbox, exact: false },
  { href: "/di/activity", label: "Activity", icon: History, exact: false },
  { href: "/di/profile", label: "Profile", icon: User, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface DiBottomNavProps {
  draftCount?: number;
}

export function DiBottomNav({ draftCount = 0 }: DiBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-cream border-t border-ink/[0.08] shadow-[0_-2px_8px_rgba(42,42,44,0.04)]"
    >
      <ul className="flex items-stretch justify-between px-2 py-1.5 max-w-screen-md mx-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(pathname, tab.href, tab.exact);
          const badge =
            tab.badgeKey === "drafts" && draftCount > 0 ? draftCount : 0;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-colors min-h-[56px] ${
                  active
                    ? "text-tangerine-deeper"
                    : "text-ink-soft hover:text-tangerine-deeper"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`} />
                  {badge > 0 ? (
                    <span
                      aria-label={`${badge} draft${badge === 1 ? "" : "s"}`}
                      className="absolute -top-1.5 -right-2.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-tangerine text-white text-[9px] font-bold leading-none"
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] font-medium tracking-wide">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
