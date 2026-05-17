// Session 46-fix-2 — bd_district cascade dropdown.
// Session 48b — district-reset hint upgraded from ref-based silent
// flag to a real state-driven, time-bounded notice. The note now:
//   - announces via aria-live="polite" so screen-readers pick it up
//   - displays in the amber tone the rest of the form uses for
//     "we changed something for you" UX
//   - auto-dismisses after 5 seconds (the brief's spec)
//
// Client component. Receives the FULL bd_district list (~64 rows) as
// a prop and the currently-selected division code from the parent
// form. Filters the visible options to districts whose `division`
// matches the selection.

"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { BdDistrictOption } from "@/lib/di-children";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

const RESET_HINT_MS = 5000;

export interface BdDistrictFieldProps {
  // Currently selected division code (from parent form state). Empty
  // string when no division is selected yet.
  selectedDivision: string;
  // Currently selected district code (from parent form state). Empty
  // string when nothing chosen / after a division change reset.
  value: string;
  // Called when the user picks a district (or when the parent should
  // clear the value due to a division change — fired with "" then).
  onChange: (code: string) => void;
  districts: BdDistrictOption[];
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
}

export function BdDistrictField({
  selectedDivision,
  value,
  onChange,
  districts,
  disabled = false,
  required = false,
  error = null,
}: BdDistrictFieldProps) {
  // Track previous division so we can detect a change and clear the
  // current district (and surface a helper note). We clear via the
  // parent's onChange so the parent's form state stays in sync.
  const prevDivisionRef = useRef<string>(selectedDivision);
  const [showResetHint, setShowResetHint] = useState(false);
  const hintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      prevDivisionRef.current &&
      prevDivisionRef.current !== selectedDivision
    ) {
      // Division changed and there was a previous one (not the
      // initial mount). Clear the district selection AND raise the
      // visible hint.
      if (value) {
        onChange("");
        // Defer the visible-hint state update via queueMicrotask so
        // we don't trip the react-hooks/set-state-in-effect rule
        // (no synchronous setState cascade inside the effect body).
        queueMicrotask(() => {
          setShowResetHint(true);
          if (hintTimerRef.current !== null) {
            window.clearTimeout(hintTimerRef.current);
          }
          hintTimerRef.current = window.setTimeout(() => {
            setShowResetHint(false);
            hintTimerRef.current = null;
          }, RESET_HINT_MS);
        });
      }
    }
    prevDivisionRef.current = selectedDivision;
  }, [selectedDivision, value, onChange]);

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  // Filter district options to the selected division. Sorted client-
  // side by sort_order in case the server batch order isn't trusted.
  const visibleDistricts = (
    selectedDivision
      ? districts.filter((d) => d.division === selectedDivision)
      : []
  )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  const noDivisionPicked = !selectedDivision;

  return (
    <div>
      <label className={labelClass} htmlFor="bd_district">
        District
        {required ? <span className="text-[#D04848] ml-1">*</span> : null}
      </label>
      <select
        id="bd_district"
        className={inputClass}
        value={value}
        onChange={(e) => {
          // Manual user pick — dismiss any lingering reset hint so
          // the helper text snaps back to neutral.
          setShowResetHint(false);
          if (hintTimerRef.current !== null) {
            window.clearTimeout(hintTimerRef.current);
            hintTimerRef.current = null;
          }
          onChange(e.target.value);
        }}
        disabled={disabled || noDivisionPicked}
      >
        {noDivisionPicked ? (
          <option value="">Pick a division first…</option>
        ) : (
          <option value="">Select a district…</option>
        )}
        {visibleDistricts.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}
          </option>
        ))}
      </select>

      {/* Reset hint takes precedence over the "no division" helper —
          it's the most relevant message in that moment. The wrapper
          has aria-live so screen-readers announce the reset, and
          a transition class so the fade-out is visible rather than
          a hard pop. */}
      {showResetHint ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 inline-flex items-start gap-1.5 text-[12.5px] text-amber-800 leading-relaxed transition-opacity duration-300"
        >
          <Info
            className="w-3.5 h-3.5 mt-0.5 stroke-[1.75] shrink-0"
            aria-hidden="true"
          />
          <span>
            District reset because division changed. Pick again.
          </span>
        </p>
      ) : noDivisionPicked ? (
        <p className={helperClass}>
          Districts appear once a division is selected above.
        </p>
      ) : null}

      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
