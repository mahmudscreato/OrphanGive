"use client";

import { CAUSES, type CauseEnum } from "@/lib/cause";

type Props = {
  value: CauseEnum;
  onChange: (next: CauseEnum) => void;
};

// 5-option radio-style picker. general_care is pre-selected by the
// parent state machine so a donor who skips engagement still produces
// a valid value. Layout: 2-column grid on desktop, vertical stack on
// mobile — matches the editorial spacing of the existing sponsor flow
// pickers (DurationPicker, PaymentSchedulePicker).
export function CausePicker({ value, onChange }: Props) {
  return (
    <fieldset className="m-0 p-0 border-0">
      <legend className="sr-only">
        Choose what your sponsorship should support
      </legend>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {CAUSES.map((c) => {
          const selected = c.enum === value;
          return (
            <label
              key={c.enum}
              className={
                "relative cursor-pointer rounded-[16px] border px-4 py-3.5 transition-all " +
                (selected
                  ? "border-tangerine bg-tangerine-mist/60 shadow-warm"
                  : "border-ink/[0.10] bg-cream hover:border-ink/[0.20] hover:bg-white")
              }
            >
              <input
                type="radio"
                name="cause"
                value={c.enum}
                checked={selected}
                onChange={() => onChange(c.enum)}
                className="sr-only"
              />
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={
                    "shrink-0 mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border-[1.5px] " +
                    (selected
                      ? "border-tangerine"
                      : "border-ink/30")
                  }
                >
                  {selected ? (
                    <span className="block w-2 h-2 rounded-full bg-tangerine" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[15px] text-ink leading-tight m-0">
                    {c.label}
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-soft italic leading-snug">
                    {c.description}
                  </p>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <p className="mt-4 text-[12.5px] text-slate-soft italic leading-snug max-w-[520px]">
        Your selection guides the charity&rsquo;s allocation. Funds may
        ultimately be applied where they&rsquo;re most needed.
      </p>
    </fieldset>
  );
}

export default CausePicker;
