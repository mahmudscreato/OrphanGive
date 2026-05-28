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

// Admin Lot 1 — section axis for visual grouping. `group` is kept
// for backwards-compat (existing primary/secondary divider logic
// elsewhere doesn't break) but `section` is what now drives the
// rendered section labels + dividers. Future entries should pick the
// section that best fits their daily use:
//   - "overview"    — landing surfaces (Home)
//   - "operations"  — triage queues + the things admin actions
//                     on most days (proposals, reviews, tasks)
//   - "people"      — record-level surfaces (children, donors,
//                     sponsorships)
//   - "config"      — settings / catalog (packages, currency rates)
//   - "forensic"    — read-only history (audit log)
type Section = "overview" | "operations" | "people" | "config" | "forensic";

const SECTION_LABEL: Record<Section, string | null> = {
  overview: null, // Home stands alone, no label needed
  operations: "Operations",
  people: "People",
  config: "Config",
  forensic: "Forensic",
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  badgeKey?: BadgeKey;
  // Legacy axis from Session 67; new rendering uses `section`.
  group: "primary" | "secondary";
  section: Section;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: "/admin",
    label: "Home",
    icon: Home,
    exact: true,
    group: "primary",
    section: "overview",
  },
  {
    href: "/admin/proposals",
    label: "Proposals",
    icon: ClipboardCheck,
    exact: false,
    badgeKey: "proposals",
    group: "primary",
    section: "operations",
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    icon: ListChecks,
    exact: false,
    badgeKey: "reviews",
    group: "primary",
    section: "operations",
  },
  // Spine 1.1 — admin field-task surface. Lives next to Reviews
  // because both are "what admin actions on most days."
  {
    href: "/admin/tasks",
    label: "Tasks",
    icon: ListChecks,
    exact: false,
    group: "primary",
    section: "operations",
  },
  // Donation Lifecycle sub-phase 3 — fulfillment overview across
  // every sponsorship. Distinct from Sponsorships (payment-axis):
  // this is the fulfillment-axis "what's stuck / on hold / disputed"
  // operational view. Lives in `operations` per Lot 1's section axis
  // because it IS a triage queue ("what's stuck"), even though it
  // reads against the sponsorship record.
  {
    href: "/admin/donations",
    label: "Donations",
    icon: HeartHandshake,
    exact: false,
    group: "primary",
    section: "operations",
  },
  // Session 66 — children gets an active-count badge.
  {
    href: "/admin/children",
    label: "Children",
    icon: Users,
    exact: false,
    badgeKey: "children",
    group: "primary",
    section: "people",
  },
  // Session 61 — live sponsorships management surface.
  {
    href: "/admin/sponsorships",
    label: "Sponsorships",
    icon: HeartHandshake,
    exact: false,
    group: "primary",
    section: "people",
  },
  // Session 65 — donor management.
  {
    href: "/admin/donors",
    label: "Donors",
    icon: UserCircle,
    exact: false,
    badgeKey: "donors",
    group: "primary",
    section: "people",
  },
  // Session 58.2 — donation_package + currency_rate admin. Mahmud
  // touches these to adjust pricing presets and FX rates without
  // needing a deploy.
  {
    href: "/admin/donation-packages",
    label: "Packages",
    icon: Gift,
    exact: false,
    group: "primary",
    section: "config",
  },
  {
    href: "/admin/currency-rates",
    label: "Currency rates",
    icon: Banknote,
    exact: false,
    group: "primary",
    section: "config",
  },
  // Session 67 — forensic surface. Lives at the bottom of the nav
  // above Sign out so it's accessible without crowding the daily-use
  // cluster.
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: ScrollText,
    exact: false,
    group: "secondary",
    section: "forensic",
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

      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            const count = item.badgeKey ? badges?.[item.badgeKey] ?? null : null;
            const showBadge = typeof count === "number" && count > 0;
            // Admin Lot 1 — section-driven dividers + tiny labels.
            // We render a divider + uppercase eyebrow at every section
            // transition (except the first item, which is the "overview"
            // Home and gets no label).
            const previousItem = idx > 0 ? NAV_ITEMS[idx - 1] : null;
            const isFirstInSection =
              !previousItem || previousItem.section !== item.section;
            const sectionLabel = SECTION_LABEL[item.section];
            const showSectionHeader =
              isFirstInSection && sectionLabel !== null;
            const showDivider =
              isFirstInSection && idx > 0;
            return (
              <li key={item.href}>
                {showDivider ? (
                  <div
                    className="my-2 border-t border-ink/[0.06]"
                    aria-hidden="true"
                  />
                ) : null}
                {showSectionHeader ? (
                  <p
                    className="px-3 pt-1 pb-1.5 font-mono text-[9.5px] tracking-[0.16em] uppercase text-slate-soft font-medium"
                    aria-hidden="true"
                  >
                    {sectionLabel}
                  </p>
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
