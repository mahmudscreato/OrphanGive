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
import { Home, Users, ListTodo, Inbox, User } from "lucide-react";

const TABS = [
  { href: "/di", label: "Home", icon: Home, exact: true },
  { href: "/di/children", label: "Children", icon: Users, exact: false },
  { href: "/di/tasks", label: "Tasks", icon: ListTodo, exact: false },
  { href: "/di/submissions", label: "Submissions", icon: Inbox, exact: false },
  { href: "/di/profile", label: "Profile", icon: User, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DiBottomNav() {
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
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-colors min-h-[56px] ${
                  active
                    ? "text-tangerine-deeper"
                    : "text-ink-soft hover:text-tangerine-deeper"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`} />
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
