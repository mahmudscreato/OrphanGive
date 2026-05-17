// Session 46-fix-2 — bd_district cascade dropdown.
//
// Client component. Receives the FULL bd_district list (~64 rows) as
// a prop and the currently-selected division code from the parent
// form. Filters the visible options to districts whose `division`
// matches the selection.
//
// When the division changes (parent updates `selectedDivision`), the
// helper text below the field surfaces a "District reset because
// division changed" note so DI knows their previous selection was
// dropped — the parent's onChange is responsible for actually
// clearing the form's bd_district value.

"use client";

import { useEffect, useRef } from "react";
import type { BdDistrictOption } from "@/lib/di-children";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

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
  const justResetRef = useRef<boolean>(false);

  useEffect(() => {
    if (prevDivisionRef.current && prevDivisionRef.current !== selectedDivision) {
      // Division changed and there was a previous one (not the
      // initial mount). Clear the district selection.
      if (value) {
        justResetRef.current = true;
        onChange("");
      }
    }
    prevDivisionRef.current = selectedDivision;
  }, [selectedDivision, value, onChange]);

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
          justResetRef.current = false;
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
      {noDivisionPicked ? (
        <p className={helperClass}>
          Districts appear once a division is selected above.
        </p>
      ) : justResetRef.current ? (
        <p className={helperClass}>
          District reset because division changed. Pick again.
        </p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
