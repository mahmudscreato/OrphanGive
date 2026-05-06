"use client";

import { useCallback } from "react";

type Props = {
  min: number;
  max: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
};

export function AgeRangeSlider({ min, max, value, onChange }: Props) {
  const [lo, hi] = value;
  const span = max - min;
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  const handleLo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Math.min(Number(e.target.value), hi);
      onChange([next, hi]);
    },
    [hi, onChange],
  );

  const handleHi = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Math.max(Number(e.target.value), lo);
      onChange([lo, next]);
    },
    [lo, onChange],
  );

  return (
    <div className="w-full">
      <div className="flex justify-between mb-2 font-mono text-[11px] text-slate tracking-[0.1em] uppercase">
        <span>Age</span>
        <span className="text-ink">
          {lo} – {hi}{" "}
          <span className="text-slate-soft normal-case tracking-normal">
            yrs
          </span>
        </span>
      </div>
      <div className="range-slider relative h-7">
        <div className="absolute h-1 top-3 left-0 right-0 bg-slate-mist/60 rounded-full" />
        <div
          className="absolute h-1 top-3 bg-tangerine rounded-full"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={lo}
          onChange={handleLo}
          aria-label="Minimum age"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={hi}
          onChange={handleHi}
          aria-label="Maximum age"
        />
      </div>
    </div>
  );
}

export default AgeRangeSlider;
