"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDUCATION_LEVELS,
  GENDERS,
  MAX_AGE,
  MIN_AGE,
  type EducationLevel,
  type Gender,
} from "@/lib/children-data";
import { AgeRangeSlider } from "./AgeRangeSlider";

type Props = {
  districts: string[];
};

type LocalState = {
  district: string;
  minAge: number;
  maxAge: number;
  gender: Gender | "all";
  education: EducationLevel | "all";
};

function readState(sp: URLSearchParams): LocalState {
  const minAgeStr = sp.get("min_age");
  const maxAgeStr = sp.get("max_age");
  const minAgeNum = minAgeStr !== null ? Number(minAgeStr) : NaN;
  const maxAgeNum = maxAgeStr !== null ? Number(maxAgeStr) : NaN;
  const minAge = Number.isFinite(minAgeNum)
    ? Math.min(MAX_AGE, Math.max(MIN_AGE, Math.floor(minAgeNum)))
    : MIN_AGE;
  const maxAge = Number.isFinite(maxAgeNum)
    ? Math.min(MAX_AGE, Math.max(MIN_AGE, Math.floor(maxAgeNum)))
    : MAX_AGE;
  const gender = (sp.get("gender") || "").toLowerCase();
  const education = (sp.get("education") || "").toLowerCase();
  return {
    district: sp.get("district") || "",
    minAge: Math.min(minAge, maxAge),
    maxAge: Math.max(minAge, maxAge),
    gender:
      (GENDERS as readonly string[]).includes(gender) ? (gender as Gender) : "all",
    education: (EDUCATION_LEVELS as readonly string[]).includes(education)
      ? (education as EducationLevel)
      : "all",
  };
}

function buildQuery(state: LocalState): string {
  const params = new URLSearchParams();
  if (state.district) params.set("district", state.district);
  if (state.minAge > MIN_AGE) params.set("min_age", String(state.minAge));
  if (state.maxAge < MAX_AGE) params.set("max_age", String(state.maxAge));
  if (state.gender !== "all") params.set("gender", state.gender);
  if (state.education !== "all") params.set("education", state.education);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function isDefault(state: LocalState): boolean {
  return (
    !state.district &&
    state.minAge === MIN_AGE &&
    state.maxAge === MAX_AGE &&
    state.gender === "all" &&
    state.education === "all"
  );
}

const PILL_BASE =
  "px-3.5 py-2 rounded-full text-[13px] font-medium transition-all duration-150 ease-soft border";
const PILL_INACTIVE =
  "bg-cream text-slate border-ink/[0.08] hover:bg-tangerine-mist hover:text-ink hover:border-tangerine-soft";
const PILL_ACTIVE =
  "bg-tangerine text-white border-transparent shadow-warm";

export function FilterBar({ districts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => readState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<LocalState>(initial);
  // Resync local state when URL changes from elsewhere (back/forward, reset link)
  useEffect(() => {
    setState(initial);
  }, [initial]);

  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useCallback(
    (next: LocalState) => {
      if (navTimer.current) clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => {
        router.replace(`${pathname}${buildQuery(next)}`, { scroll: false });
      }, 300);
    },
    [router, pathname],
  );

  // On unmount, flush any pending navigation
  useEffect(() => {
    return () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<LocalState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        navigate(next);
        return next;
      });
    },
    [navigate],
  );

  const reset = useCallback(() => {
    if (navTimer.current) clearTimeout(navTimer.current);
    const cleared: LocalState = {
      district: "",
      minAge: MIN_AGE,
      maxAge: MAX_AGE,
      gender: "all",
      education: "all",
    };
    setState(cleared);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return (
    <div className="sticky top-[100px] z-40 bg-cream/95 backdrop-blur-md border-b border-ink/[0.06] py-5 -mx-6 px-6 max-md:py-4">
      <div className="max-w-[1320px] mx-auto grid grid-cols-[1.2fr_1.5fr_1fr_1.6fr_auto] gap-6 items-end max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
        {/* District */}
        <label className="block">
          <div className="font-mono text-[11px] text-slate tracking-[0.1em] uppercase mb-2">
            District
          </div>
          <div className="relative">
            <select
              value={state.district}
              onChange={(e) => update({ district: e.target.value })}
              className="w-full appearance-none bg-white border border-ink/[0.08] rounded-full px-4 py-2.5 pr-9 text-sm font-medium text-ink hover:border-tangerine-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            >
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
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

        {/* Age */}
        <div>
          <AgeRangeSlider
            min={MIN_AGE}
            max={MAX_AGE}
            value={[state.minAge, state.maxAge]}
            onChange={([lo, hi]) => update({ minAge: lo, maxAge: hi })}
          />
        </div>

        {/* Gender */}
        <div>
          <div className="font-mono text-[11px] text-slate tracking-[0.1em] uppercase mb-2">
            Gender
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", ...GENDERS] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() =>
                  update({ gender: g === "all" ? "all" : (g as Gender) })
                }
                className={`${PILL_BASE} ${
                  state.gender === g ? PILL_ACTIVE : PILL_INACTIVE
                }`}
                aria-pressed={state.gender === g}
              >
                {g === "all" ? "All" : g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Education */}
        <div>
          <div className="font-mono text-[11px] text-slate tracking-[0.1em] uppercase mb-2">
            Education
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", ...EDUCATION_LEVELS] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() =>
                  update({
                    education: lvl === "all" ? "all" : (lvl as EducationLevel),
                  })
                }
                className={`${PILL_BASE} ${
                  state.education === lvl ? PILL_ACTIVE : PILL_INACTIVE
                }`}
                aria-pressed={state.education === lvl}
              >
                {lvl === "all" ? "All" : lvl[0].toUpperCase() + lvl.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        <div className="flex justify-end max-md:justify-start max-md:mt-2">
          <button
            type="button"
            onClick={reset}
            disabled={isDefault(state)}
            className="text-[13px] font-medium text-slate hover:text-tangerine-deep disabled:text-slate-soft disabled:cursor-not-allowed transition-colors"
          >
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilterBar;
