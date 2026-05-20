"use client";

import { VISIBILITY_OPTIONS, type VisibilityEnum } from "@/lib/visibility";

type Props = {
  value: VisibilityEnum;
  onChange: (next: VisibilityEnum) => void;
  // Donor's first name, when known. Used inside the "Show my name"
  // option's description so the donor sees a concrete preview of what
  // would appear on the child's public page. Falls back to a generic
  // phrasing when null.
  donorFirstName?: string | null;
};

// Two-option radio-style picker for sponsor visibility (Session 14.6).
// Anonymous is pre-selected (faith-conscious / hidden-sadaqah default);
// donors opt INTO 'named'. Visual language matches CausePicker so the
// step 6 visibility step looks at-home next to step 5 (cause).
export function VisibilityPicker({ value, onChange, donorFirstName }: Props) {
  return (
    <fieldset className="m-0 p-0 border-0">
      <legend className="sr-only">
        Choose whether your name appears on the child&rsquo;s public page
      </legend>
      <div className="grid grid-cols-1 gap-3">
        {VISIBILITY_OPTIONS.map((opt) => {
          const selected = opt.enum === value;
          // For 'named', personalize the description with the donor's
          // first name when we have it. Keeps the picker honest about
          // what's about to be public.
          const description =
            opt.enum === "named" && donorFirstName
              ? `“Sponsored by ${donorFirstName}” will appear on the child's public page. Only your first name — no other details.`
              : opt.description;
          return (
            <label
              key={opt.enum}
              className={
                "relative cursor-pointer rounded-[16px] border px-4 py-3.5 transition-all " +
                (selected
                  ? "border-tangerine bg-tangerine-mist/60 shadow-warm"
                  : "border-ink/[0.10] bg-cream hover:border-ink/[0.20] hover:bg-white")
              }
            >
              <input
                type="radio"
                name="visibility"
                value={opt.enum}
                checked={selected}
                onChange={() => onChange(opt.enum)}
                className="sr-only"
              />
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={
                    "shrink-0 mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border-[1.5px] " +
                    (selected ? "border-tangerine" : "border-ink/30")
                  }
                >
                  {selected ? (
                    <span className="block w-2 h-2 rounded-full bg-tangerine" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[15px] text-ink leading-tight m-0">
                    {opt.label}
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-soft italic leading-snug">
                    {description}
                  </p>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <p className="mt-4 text-[12.5px] text-slate-soft italic leading-snug max-w-[520px]">
        You can change this any time from your sponsorship details.
      </p>
    </fieldset>
  );
}

export default VisibilityPicker;
