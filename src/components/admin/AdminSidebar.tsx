// Session 51 — Admin Dashboard desktop sidebar.
//
// Mirror of DiSidebar (Session 42) with:
//   - Brand mark says "Admin" instead of "Data Inputter"
//   - Different nav set: Home / Proposals / Reviews (placeholder) /
//     Children. No Tasks/Submissions/Profile.
//   - Sign out POSTs to /api/admin/logout (separate cookie pair from
//     DI/donor sessions — see admin-auth.ts).

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Home,
  ClipboardCheck,
  ListChecks,
  Users,
  HeartHandshake,
  LogOut,
} from "lucide-react";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

const NAV_ITEMS = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/proposals", label: "Proposals", icon: ClipboardCheck, exact: false },
  { href: "/admin/reviews", label: "Reviews", icon: ListChecks, exact: false },
  { href: "/admin/children", label: "Children", icon: Users, exact: false },
  // Session 61 — live sponsorships management surface.
  { href: "/admin/sponsorships", label: "Sponsorships", icon: HeartHandshake, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore — we still redirect to login below
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="Admin Dashboard navigation"
      className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[240px] bg-cream border-r border-ink/[0.08] px-4 py-6 z-30"
    >
      <div className="px-2 mb-8">
        <Link href="/admin" className="inline-flex items-center gap-3 group">
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
              Admin
            </div>
          </div>
        </Link>
      </div>

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
                  <Icon
                    className={`w-4 h-4 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

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
