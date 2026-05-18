// Session 51 — Admin Dashboard mobile bottom navigation.
//
// Mirror of DiBottomNav with the admin's 4-tab set. Sign-out lives
// in the AdminHeader's overflow on mobile (vs the sidebar's anchored
// bottom button on desktop) — admins use mobile rarely so the cost
// of rebuilding a hamburger menu wasn't worth it for V1.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardCheck,
  ListChecks,
  Users,
  HeartHandshake,
} from "lucide-react";

// Mobile nav is space-constrained; we still fit five tabs at 375px
// because the labels are 10px font-mono. If a sixth tab gets added,
// switch this to a horizontal scroller or icon-only mode.
const TABS = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/proposals", label: "Proposals", icon: ClipboardCheck, exact: false },
  { href: "/admin/reviews", label: "Reviews", icon: ListChecks, exact: false },
  { href: "/admin/children", label: "Children", icon: Users, exact: false },
  // Session 61
  { href: "/admin/sponsorships", label: "Sponsors", icon: HeartHandshake, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminBottomNav() {
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
                <Icon
                  className={`w-5 h-5 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`}
                />
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
