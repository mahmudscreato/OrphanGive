// Session 36 — /children filter bar.
//
// Three controls drive the URL params:
//   • status   → chip toggles (All / Awaiting / Sponsored)
//   • division → dropdown    (All divisions + 8 Bangladesh divisions)
//   • age      → chip toggles (All ages / 0–5 / 6–10 / 11–15 / 16–18)
//
// Implementation notes:
//   - All filter state lives in the URL (`useSearchParams` + `router.replace`),
//     so links are shareable and the back/forward buttons work as expected.
//   - The component is a thin shim over the URL: each interaction
//     synthesises a new query string and calls router.replace. The page
//     re-renders server-side with the new filters applied.
//   - Mobile: the bar collapses into a single "Filters (N)" button. N
//     reflects the active filter count so the user knows there's state
//     hidden behind the toggle.
//   - The "Clear all" link is suppressed when no filter is active.
//
// PRIVACY NOTE — division-level only.
// We list divisions, not districts, even though Directus has district
// data on each child profile. Exposing district-level filters would
// narrow location too aggressively for the public list. This matches
// the BrowseChildCard's Tier 1 contract (region/division surfaced,
// district hidden). See the parallel comment in src/lib/children-data.ts.

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGE_BUCKETS,
  BANGLADESH_DIVISIONS,
  SPONSOR_STATUSES,
  type AgeBucketValue,
  type DivisionValue,
  type SponsorStatus,
} from "@/lib/children-data";

type LocalState = {
  status: SponsorStatus | null;
  division: DivisionValue | null;
  age: AgeBucketValue | null;
};

function readState(sp: URLSearchParams): LocalState {
  const statusRaw = (sp.get("status") || "").toLowerCase();
  const divisionRaw = (sp.get("division") || "").toLowerCase();
  const ageRaw = (sp.get("age") || "").toLowerCase();
  return {
    status:
      (SPONSOR_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as SponsorStatus)
        : null,
    division: BANGLADESH_DIVISIONS.some((d) => d.value === divisionRaw)
      ? (divisionRaw as DivisionValue)
      : null,
    age: AGE_BUCKETS.some((b) => b.value === ageRaw)
      ? (ageRaw as AgeBucketValue)
      : null,
  };
}

function buildQuery(state: LocalState): string {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.division) params.set("division", state.division);
  if (state.age) params.set("age", state.age);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function activeFilterCount(state: LocalState): number {
  let n = 0;
  if (state.status) n++;
  if (state.division) n++;
  if (state.age) n++;
  return n;
}

const CHIP_BASE =
  "px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 ease-soft border";
const CHIP_INACTIVE =
  "bg-white text-slate border-ink/[0.10] hover:bg-tangerine-mist hover:text-ink hover:border-tangerine-soft";
const CHIP_ACTIVE = "bg-tangerine text-ink border-transparent shadow-warm";
const LABEL_CLASS =
  "block font-mono text-[11px] tracking-[0.1em] uppercase text-slate font-medium mb-2";

export function ChildrenFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => readState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<LocalState>(initial);
  // Resync local state if URL changes externally (back/forward, clear link)
  useEffect(() => {
    setState(initial);
  }, [initial]);

  // Mobile: panel is collapsed by default. State persists per session.
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = useCallback(
    (next: LocalState) => {
      router.replace(`${pathname}${buildQuery(next)}`, { scroll: false });
    },
    [router, pathname],
  );

  // Session 38 — `update` used to call navigate() inside the
  // setState updater function, which fires router.replace() during
  // React's render commit phase. React (correctly) flagged this with:
  //   "Cannot update a component (`Router`) while rendering a different
  //    component (`ChildrenFilterBar`)"
  // Fix: read current state via the closure, compute next, then run
  // setState and navigate as two independent statements outside any
  // updater. The closure now depends on `state`, so the callback
  // re-creates whenever state changes — fine, and far cheaper than the
  // render-phase router update React was warning about.
  const update = useCallback(
    (patch: Partial<LocalState>) => {
      const next = { ...state, ...patch };
      setState(next);
      navigate(next);
    },
    [state, navigate],
  );

  const clear = useCallback(() => {
    const cleared: LocalState = { status: null, division: null, age: null };
    setState(cleared);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const count = activeFilterCount(state);
  const hasAny = count > 0;

  // ─── Status chips (All / Awaiting / Sponsored) ────────────────────
  const statusChips = (
    <div>
      <div className={LABEL_CLASS}>Sponsored status</div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => update({ status: null })}
          className={`${CHIP_BASE} ${state.status === null ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          aria-pressed={state.status === null}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => update({ status: "awaiting" })}
          className={`${CHIP_BASE} ${state.status === "awaiting" ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          aria-pressed={state.status === "awaiting"}
        >
          Awaiting
        </button>
        <button
          type="button"
          onClick={() => update({ status: "sponsored" })}
          className={`${CHIP_BASE} ${state.status === "sponsored" ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          aria-pressed={state.status === "sponsored"}
        >
          Sponsored
        </button>
      </div>
    </div>
  );

  // ─── Division dropdown ────────────────────────────────────────────
  const divisionDropdown = (
    <label className="block">
      <div className={LABEL_CLASS}>Division</div>
      <div className="relative">
        <select
          value={state.division ?? ""}
          onChange={(e) =>
            update({
              division:
                e.target.value === ""
                  ? null
                  : (e.target.value as DivisionValue),
            })
          }
          className="w-full appearance-none bg-white border border-ink/[0.10] rounded-full px-4 py-2 pr-9 text-[13px] font-medium text-ink hover:border-tangerine-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
        >
          <option value="">All divisions</option>
          {BANGLADESH_DIVISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-soft text-xs"
        >
          ▾
        </span>
      </div>
    </label>
  );

  // ─── Age chips ────────────────────────────────────────────────────
  const ageChips = (
    <div>
      <div className={LABEL_CLASS}>Age range</div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => update({ age: null })}
          className={`${CHIP_BASE} ${state.age === null ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          aria-pressed={state.age === null}
        >
          All ages
        </button>
        {AGE_BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => update({ age: b.value })}
            className={`${CHIP_BASE} ${state.age === b.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            aria-pressed={state.age === b.value}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );

  const clearLink = hasAny ? (
    <button
      type="button"
      onClick={clear}
      className="text-[13px] font-medium text-tangerine-deeper underline-offset-4 hover:underline transition-colors whitespace-nowrap"
    >
      Clear all filters
    </button>
  ) : null;

  return (
    <div className="px-6 mb-10 max-md:mb-8">
      <div className="max-w-[1320px] mx-auto">
        {/* ─── Desktop layout: inline three-column grid ───────────────
            Hidden on mobile; the toggle below replaces it. */}
        <div className="hidden md:block rounded-2xl border border-ink/[0.06] bg-white/60 backdrop-blur-sm px-6 py-5">
          <div className="grid grid-cols-[1.1fr_0.9fr_1.6fr_auto] gap-6 items-end">
            {statusChips}
            {divisionDropdown}
            {ageChips}
            <div className="self-end pb-1.5 min-h-[28px]">{clearLink}</div>
          </div>
        </div>

        {/* ─── Mobile layout: collapsible panel ──────────────────────
            Tap the "Filters (N)" button to expand. The count gives
            users a hint about active state without opening. */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-ink/[0.10] text-[13.5px] font-medium text-ink hover:border-tangerine-soft transition-colors"
            >
              <span>Filters{count > 0 ? ` (${count})` : ""}</span>
              <span
                aria-hidden="true"
                className={`text-[10px] transition-transform ${mobileOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
            {clearLink}
          </div>
          {mobileOpen ? (
            <div className="mt-4 rounded-2xl border border-ink/[0.06] bg-white/60 backdrop-blur-sm px-5 py-5 space-y-5">
              {statusChips}
              {divisionDropdown}
              {ageChips}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ChildrenFilterBar;
