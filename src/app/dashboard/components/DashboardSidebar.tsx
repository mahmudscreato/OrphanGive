"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Bell,
  KeyRound,
  CreditCard,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { Donor } from "@/lib/donor-data";
import { signOutAction } from "@/app/(auth)/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  {
    href: "/dashboard/sponsorships",
    label: "Children you support",
    icon: Users,
  },
  { href: "/dashboard/updates", label: "Updates", icon: Bell },
  {
    href: "/dashboard/information-access",
    label: "Information access",
    icon: KeyRound,
  },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

function isRouteActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ donor }: { donor: Donor }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const firstName =
    donor.first_name?.trim() || donor.email.split("@")[0] || "friend";
  const fullName =
    [donor.first_name, donor.last_name].filter(Boolean).join(" ").trim() ||
    firstName;

  const closeMobile = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-ink/[0.08] text-ink shadow-sm hover:bg-cream transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open ? (
        <button
          type="button"
          onClick={closeMobile}
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
        />
      ) : null}

      <aside
        className={
          "fixed top-0 left-0 bottom-0 z-50 w-60 bg-white border-r border-ink/[0.06] flex flex-col transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <Link href="/dashboard" onClick={closeMobile} className="inline-flex">
            {/* fix/donor-ui-consistency — the real OG logo lockup used by
                the public SiteNav (mark + wordmark SVG), replacing the
                bespoke mark-png + text wordmark. Plain <img> like SiteNav
                (external SVG; avoids next/image remote config). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_L_SVG_h9uduq.svg"
              alt="OrphanGive"
              className="h-9 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-soft hover:text-ink hover:bg-cream transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 mt-4 overflow-y-auto">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isRouteActive(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={closeMobile}
                    className={
                      // fix/donor-ui-consistency — match SiteNav's nav-item
                      // vocabulary: rounded-full pill, tangerine-mist +
                      // text-ink active, text-slate + tangerine-mist hover.
                      "flex items-center gap-3 px-3 py-2.5 rounded-full text-[14px] transition-colors " +
                      (active
                        ? "bg-tangerine-mist text-ink font-medium"
                        : "text-slate hover:bg-tangerine-mist hover:text-ink")
                    }
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-3 pb-5 pt-3 border-t border-ink/[0.05]">
          <Link
            href="/dashboard/profile"
            onClick={closeMobile}
            className="block px-3 py-2.5 rounded-lg hover:bg-cream transition-colors"
          >
            <div className="text-[13px] font-medium text-ink truncate">
              {fullName}
            </div>
            <div className="text-[11.5px] text-slate-soft truncate">
              {donor.email}
            </div>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-slate-soft hover:bg-cream hover:text-ink transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

export default DashboardSidebar;
