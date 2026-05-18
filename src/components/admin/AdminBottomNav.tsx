// Session 51 — Admin Dashboard mobile bottom navigation.
//
// Mirror of DiBottomNav with the admin's 4-tab set. Sign-out lives
// in the AdminHeader's overflow on mobile (vs the sidebar's anchored
// bottom button on desktop) — admins use mobile rarely so the cost
// of rebuilding a hamburger menu wasn't worth it for V1.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardCheck, ListChecks, Users } from "lucide-react";

// Session 66 — mirror sidebar's BadgeKey union for mobile parity.
type BadgeKey = "children";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  badgeKey?: BadgeKey;
};

const TABS: ReadonlyArray<Tab> = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/proposals", label: "Proposals", icon: ClipboardCheck, exact: false },
  { href: "/admin/reviews", label: "Reviews", icon: ListChecks, exact: false },
  { href: "/admin/children", label: "Children", icon: Users, exact: false, badgeKey: "children" },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminBottomNav({
  badges,
}: {
  badges?: Partial<Record<BadgeKey, number | null>>;
} = {}) {
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
          const count = tab.badgeKey ? badges?.[tab.badgeKey] ?? null : null;
          const showBadge = typeof count === "number" && count > 0;
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
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`}
                  />
                  {showBadge ? (
                    <span
                      className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-tangerine-soft text-tangerine-deeper text-[9.5px] font-semibold tabular-nums"
                      aria-label={`${count} active`}
                    >
                      {count > 99 ? "99+" : count}
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
