// Session 51 — Admin Dashboard desktop sidebar.
//
// Mirror of DiSidebar (Session 42) with:
//   - Brand mark says "Admin" instead of "Data Inputter"
//   - Different nav set: Home / Proposals / Reviews / Children /
//     Sponsorships / Donors / Audit log.
//   - Sign out POSTs to /api/admin/logout (separate cookie pair from
//     DI/donor sessions — see admin-auth.ts).
//
// Session 67 — `group` distinguishes the daily-use cluster (primary)
// from operational / forensic surfaces (secondary). The render below
// inserts a divider between groups.

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
  ScrollText,
  LogOut,
  Gift,
  Banknote,
} from "lucide-react";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

// Sessions 60 + 65 + 66 — combined badge key union.
type BadgeKey = "proposals" | "reviews" | "donors" | "children";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  badgeKey?: BadgeKey;
  group: "primary" | "secondary";
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/admin", label: "Home", icon: Home, exact: true, group: "primary" },
  {
    href: "/admin/proposals",
    label: "Proposals",
    icon: ClipboardCheck,
    exact: false,
    badgeKey: "proposals",
    group: "primary",
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    icon: ListChecks,
    exact: false,
    badgeKey: "reviews",
    group: "primary",
  },
  // Session 66 — children gets an active-count badge.
  {
    href: "/admin/children",
    label: "Children",
    icon: Users,
    exact: false,
    badgeKey: "children",
    group: "primary",
  },
  // Session 61 — live sponsorships management surface.
  {
    href: "/admin/sponsorships",
    label: "Sponsorships",
    icon: HeartHandshake,
    exact: false,
    group: "primary",
  },
  // Donation Lifecycle sub-phase 3 — fulfillment overview across
  // every sponsorship. Distinct from Sponsorships (payment-axis):
  // this is the fulfillment-axis "what's stuck / on hold / disputed"
  // operational view.
  {
    href: "/admin/donations",
    label: "Donations",
    icon: HeartHandshake,
    exact: false,
    group: "primary",
  },
  // Spine 1.1 — admin field-task surface. Sits next to Sponsorships
  // because the natural origin for a task is a sponsorship detail
  // page; the /admin/tasks queue is the operational triage view.
  {
    href: "/admin/tasks",
    label: "Tasks",
    icon: ListChecks,
    exact: false,
    group: "primary",
  },
  // Session 65 — donor management.
  {
    href: "/admin/donors",
    label: "Donors",
    icon: UserCircle,
    exact: false,
    badgeKey: "donors",
    group: "primary",
  },
  // Session 58.2 — donation_package + currency_rate admin. Sits in the
  // primary cluster next to Donors since both are donor-side data;
  // Mahmud touches these to adjust pricing presets and FX rates
  // without needing a deploy.
  {
    href: "/admin/donation-packages",
    label: "Packages",
    icon: Gift,
    exact: false,
    group: "primary",
  },
  {
    href: "/admin/currency-rates",
    label: "Currency rates",
    icon: Banknote,
    exact: false,
    group: "primary",
  },
  // Session 67 — forensic surface. Secondary group; lives at the
  // bottom of the nav above Sign out so it's accessible without
  // crowding the daily-use cluster.
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: ScrollText,
    exact: false,
    group: "secondary",
  },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  badges,
}: {
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
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            const count = item.badgeKey ? badges?.[item.badgeKey] ?? null : null;
            const showBadge = typeof count === "number" && count > 0;
            // Session 67 — divider before the first secondary item.
            const previousItem = idx > 0 ? NAV_ITEMS[idx - 1] : null;
            const showDivider =
              item.group === "secondary" &&
              (!previousItem || previousItem.group !== "secondary");
            return (
              <li key={item.href}>
                {showDivider ? (
                  <div
                    className="my-2 border-t border-ink/[0.08]"
                    aria-hidden="true"
                  />
                ) : null}
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
                      aria-label={`${count} pending`}
                    >
                      {count > 99 ? "99+" : count}
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
