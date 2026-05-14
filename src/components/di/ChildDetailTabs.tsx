// Session 43 — Tabbed shell for Child Detail.
//
// Client component. Six tabs total — Profile + Sponsorship are wired
// to real data; Moments / Reports / Deliveries / History are placeholder
// panels (passed in as already-rendered server content).
//
// Mobile (< md): horizontal scrolling pill row at top, panel below.
// Desktop (>= md): vertical sidebar 200px wide on the left, panel on
// the right. Active tab gets a 4px tangerine left border + tinted bg
// on desktop; tangerine pill on mobile.
//
// Implementation note: all six panels are rendered server-side and
// passed in as ReactNode props. Switching tabs only toggles which
// panel is visible — there's no per-tab fetch and no client-side
// data fetching at all in V1. This keeps the heavy work (Directus
// reads, redaction) on the server where the admin token lives.

"use client";

import { useState } from "react";
import {
  Camera,
  FileBarChart,
  Heart,
  History,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react";

type TabKey =
  | "profile"
  | "moments"
  | "reports"
  | "deliveries"
  | "sponsorship"
  | "history";

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "profile", label: "Profile", icon: User },
  { key: "moments", label: "Moments", icon: Camera },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "deliveries", label: "Deliveries", icon: Truck },
  { key: "sponsorship", label: "Sponsorship", icon: Heart },
  { key: "history", label: "History", icon: History },
];

export interface ChildDetailTabsProps {
  profileContent: React.ReactNode;
  momentsContent: React.ReactNode;
  reportsContent: React.ReactNode;
  deliveriesContent: React.ReactNode;
  sponsorshipContent: React.ReactNode;
  historyContent: React.ReactNode;
}

export function ChildDetailTabs(props: ChildDetailTabsProps) {
  const [active, setActive] = useState<TabKey>("profile");

  const contentByKey: Record<TabKey, React.ReactNode> = {
    profile: props.profileContent,
    moments: props.momentsContent,
    reports: props.reportsContent,
    deliveries: props.deliveriesContent,
    sponsorship: props.sponsorshipContent,
    history: props.historyContent,
  };

  return (
    <div className="md:flex md:gap-6 md:items-start">
      {/* Mobile pill strip — horizontal scroll */}
      <div
        role="tablist"
        aria-label="Child detail sections"
        className="md:hidden flex gap-2 overflow-x-auto -mx-4 px-4 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.key)}
              className={`shrink-0 inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13.5px] font-medium transition-colors ${
                selected
                  ? "bg-tangerine text-white"
                  : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
              }`}
            >
              <Icon className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Desktop vertical sidebar */}
      <nav
        role="tablist"
        aria-label="Child detail sections"
        className="hidden md:block w-[200px] shrink-0"
      >
        <ul className="space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const selected = t.key === active;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(t.key)}
                  className={`w-full inline-flex items-center gap-3 h-12 pl-4 pr-3 text-[14px] font-medium text-left transition-colors rounded-r-md ${
                    selected
                      ? "bg-tangerine-mist/60 text-ink border-l-[3px] border-tangerine"
                      : "text-slate hover:bg-tangerine-mist/30 hover:text-ink border-l-[3px] border-transparent"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${selected ? "stroke-[2.25] text-tangerine-deeper" : "stroke-[1.75]"}`}
                    aria-hidden="true"
                  />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tab panel — only the active one is rendered to keep the
          DOM small. Each panel is a fully-rendered server tree so
          there's no flash on switch. */}
      <div className="flex-1 min-w-0" role="tabpanel">
        {contentByKey[active]}
      </div>
    </div>
  );
}
