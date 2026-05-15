// Session 42 — DI Dashboard desktop sidebar.
//
// Fixed left, 240px wide. Same 5 destinations as DiBottomNav, plus
// the OG logo at top + sign-out at bottom. Hidden on mobile
// (hidden md:flex) where DiBottomNav takes over.
//
// Sign-out is a client-side fetch + redirect, NOT a form action.
// Reason: the (authed) layout already enforces the auth redirect,
// so after fetch + cookie clear, a router.push('/di/login') gets
// us there. (Form action with redirect would also work but client
// fetch keeps us aligned with the rest of the dashboard's pattern.)

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Home, Users, ListTodo, Inbox, User, LogOut } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

const NAV_ITEMS = [
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

export function DiSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/di/logout", { method: "POST" });
    } catch {
      // ignore — we still redirect to login below
    }
    router.push("/di/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="DI Dashboard navigation"
      className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[240px] bg-cream border-r border-ink/[0.08] px-4 py-6 z-30"
    >
      {/* Logo + brand + bell.
          Session 47 — bell sits on the right of the brand row so the
          unread count is always one glance away, regardless of which
          page the DI is on. */}
      <div className="px-2 mb-8 flex items-center justify-between gap-2">
        <Link href="/di" className="inline-flex items-center gap-3 group">
          <Image
            src={FAVICON_URL}
            alt=""
            width={36}
            height={50}
            unoptimized
            aria-hidden="true"
            className="w-7 h-auto shrink-0"
          />
          <div>
            <div className="font-display text-[18px] text-ink leading-tight group-hover:text-tangerine-deeper transition-colors">
              OrphanGive
            </div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
              Data Inputter
            </div>
          </div>
        </Link>
        <NotificationBell variant="sidebar" />
      </div>

      {/* Nav items */}
      <nav className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                    active
                      ? "bg-tangerine-mist text-tangerine-deeper"
                      : "text-ink-soft hover:bg-tangerine-mist/50 hover:text-tangerine-deeper"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign out — anchored inside the sidebar with a border-top
          separator above so it visually belongs to the sidebar
          rather than floating disconnected at the bottom-left of
          the viewport. (Session 42-FIX3) */}
      <div className="pt-3 mt-3 border-t border-ink/[0.08]">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-ink-soft hover:bg-tangerine-mist/50 hover:text-tangerine-deeper transition-colors disabled:opacity-50"
        >
          <LogOut className="w-4 h-4 stroke-[1.75]" />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
