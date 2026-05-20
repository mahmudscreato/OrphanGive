"use client";

import { useId } from "react";
import {
  CUSTOM_DURATION_MAX,
  CUSTOM_DURATION_MIN,
  DURATION_OPTIONS,
} from "@/lib/pricing";

// Selection model used by the parent. We keep the chosen option's id
// alongside a numeric `months` value:
//   - "d_indef"   → months = null (indefinite)
//   - "d_3"/_6/_12 → months = 3/6/12
//   - "d_custom"  → months = the entered integer (or null if empty / invalid)
export type DurationSelection = {
  optionId: string;
  months: number | null;
};

type Props = {
  value: DurationSelection;
  onChange: (next: DurationSelection) => void;
};

export function DurationPicker({ value, onChange }: Props) {
  const customInputId = useId();
  const options = DURATION_OPTIONS.monthly;

  function pickOption(o: (typeof options)[number]) {
    if (o.months === "custom") {
      // Preserve any prior custom value so flipping back to Custom
      // doesn't blank it.
      onChange({
        optionId: o.id,
        months:
          value.optionId === "d_custom" && typeof value.months === "number"
            ? value.months
            : null,
      });
    } else {
      onChange({ optionId: o.id, months: o.months ?? null });
    }
  }

  function setCustom(raw: string) {
    if (raw.trim() === "") {
      onChange({ optionId: "d_custom", months: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      onChange({ optionId: "d_custom", months: null });
      return;
    }
    onChange({ optionId: "d_custom", months: Math.trunc(n) });
  }

  const customValue = value.optionId === "d_custom" ? value.months : null;
  const customInvalid =
    value.optionId === "d_custom" &&
    customValue !== null &&
    (customValue < CUSTOM_DURATION_MIN || customValue > CUSTOM_DURATION_MAX);

  return (
    <div role="radiogroup" aria-label="Duration" className="space-y-3">
      {options.map((o) => {
        const active = value.optionId === o.id;
        return (
          <div key={o.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pickOption(o)}
              aria-controls={o.id === "d_custom" ? customInputId : undefined}
              className={`w-full text-left rounded-[16px] px-5 py-4 transition-all duration-[200ms] ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas ${
                active
                  ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                  : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[18px] text-ink leading-tight">
                  {o.label}
                </span>
                {o.months === null ? (
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-tangerine-deep">
                    Default
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] text-slate leading-snug">
                {o.description}
              </p>
            </button>

            {/* Inline numeric input for "Custom" — only rendered when
                Custom is the active option, so layout stays calm. */}
            {o.id === "d_custom" && active ? (
              <div className="mt-3 flex items-center gap-3 px-1">
                <input
                  id={customInputId}
                  type="number"
                  inputMode="numeric"
                  min={CUSTOM_DURATION_MIN}
                  max={CUSTOM_DURATION_MAX}
                  step={1}
                  value={customValue ?? ""}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={`${CUSTOM_DURATION_MIN}-${CUSTOM_DURATION_MAX}`}
                  className="w-24 px-3 py-2 rounded-xl border border-ink/[0.16] bg-white font-display text-[18px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
                />
                <span className="text-[13px] text-slate">months</span>
                {customInvalid ? (
                  <span className="text-[12.5px] text-[#A02B2B]">
                    Choose between {CUSTOM_DURATION_MIN} and{" "}
                    {CUSTOM_DURATION_MAX}.
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// True when the selection is complete enough to advance.
export function isDurationSelectionValid(s: DurationSelection): boolean {
  if (s.optionId === "d_indef") return s.months === null;
  if (s.optionId === "d_3") return s.months === 3;
  if (s.optionId === "d_6") return s.months === 6;
  if (s.optionId === "d_12") return s.months === 12;
  if (s.optionId === "d_custom") {
    return (
      typeof s.months === "number" &&
      Number.isInteger(s.months) &&
      s.months >= CUSTOM_DURATION_MIN &&
      s.months <= CUSTOM_DURATION_MAX
    );
  }
  return false;
}

export default DurationPicker;
