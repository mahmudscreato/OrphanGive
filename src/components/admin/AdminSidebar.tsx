// Session 51 — Admin Dashboard desktop sidebar.
//
// Mirror of DiSidebar (Session 42) with:
//   - Brand mark says "Admin" instead of "Data Inputter"
//   - Different nav set: Home / Proposals / Reviews / Children /
//     Sponsorships / Donors. No Tasks/Submissions/Profile.
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
  UserCircle,
  LogOut,
} from "lucide-react";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

// Session 65 — added "donors" to the badgeKey union so the new
// Donors nav entry can surface a pending-approval count alongside
// proposals + reviews.
type BadgeKey = "proposals" | "reviews" | "donors";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  // Session 60 — optional pending-count badge. Driven by the
  // server-side layout fetch; rendered next to the label when > 0.
  badgeKey?: BadgeKey;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  {
    href: "/admin/proposals",
    label: "Proposals",
    icon: ClipboardCheck,
    exact: false,
    badgeKey: "proposals",
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    icon: ListChecks,
    exact: false,
    badgeKey: "reviews",
  },
  { href: "/admin/children", label: "Children", icon: Users, exact: false },
  // Session 61 — live sponsorships management surface.
  { href: "/admin/sponsorships", label: "Sponsorships", icon: HeartHandshake, exact: false },
  // Session 65 — donor management. Lives after Sponsorships so the
  // "people" cluster (Children + Sponsorships + Donors) reads together;
  // badge shows pending first-time approvals.
  {
    href: "/admin/donors",
    label: "Donors",
    icon: UserCircle,
    exact: false,
    badgeKey: "donors",
  },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  badges,
}: {
  // Session 60 — optional per-key pending counts. Null = "still
  // loading / fetch errored" (we hide the badge). 0 = "nothing
  // pending" (also hidden so 0 doesn't read as noise).
  // Session 65 — extended to include 'donors'.
  badges?: Partial<Record<BadgeKey, number | null>>;
} = {}) {
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
            const badgeCount = item.badgeKey
              ? badges?.[item.badgeKey] ?? null
              : null;
            const showBadge =
              typeof badgeCount === "number" && badgeCount > 0;
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
                  <span className="flex-1">{item.label}</span>
                  {showBadge ? (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-tangerine text-white text-[11px] font-semibold tabular-nums"
                      aria-label={`${badgeCount} pending`}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
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
