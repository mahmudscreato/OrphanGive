// Donor-facing Education + Interests section.
//
// Session 50 — replaced the local 4-value EDUCATION_LABELS map (which
// pre-dated Session 48a's 10-value enum and was rendering new values
// like `primary_1_5` as raw slugs to donors) with the shared
// `getEducationLevelLabel` + `getAreasOfInterestLabels` helpers from
// form-constants.
//
// Session 52b — composeSchoolingLine collapses the "Class N,
// EducationLevel (Class A–B)" redundancy into "EducationLevel,
// class N" using the new short labels. Same label source still
// drives the DI dropdowns + form-constants OPTIONS.

import type { ChildProfile } from "@/lib/child-profile-data";
import {
  composeSchoolingLine,
  getAreasOfInterestLabels,
} from "@/lib/form-constants";

export function EducationSection({ child }: { child: ChildProfile }) {
  const schoolingLine = composeSchoolingLine(
    child.education_level,
    child.class_grade,
  );
  const interestLabels = getAreasOfInterestLabels(child.areas_of_interest);

  const hasContent = schoolingLine || interestLabels.length > 0;
  if (!hasContent) return null;

  return (
    <section className="px-6 py-24 bg-linen max-md:py-16">
      <div className="max-w-[1100px] mx-auto">
        <div className="eyebrow-tag">Education &amp; interests</div>
        <h2 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3vw,2.5rem)]">
          What {child.display_name.split(" ")[0]} is learning, and what lights
          them up.
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-5 max-md:grid-cols-1">
          {schoolingLine ? (
            <div className="rounded-[20px] bg-white border border-ink/[0.05] px-6 py-5">
              <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-soft mb-2">
                Schooling
              </div>
              <div className="font-display text-[22px] text-ink leading-snug">
                {schoolingLine}
              </div>
            </div>
          ) : null}

          {interestLabels.length > 0 ? (
            <div className="rounded-[20px] bg-white border border-ink/[0.05] px-6 py-5">
              <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-soft mb-3">
                Interests
              </div>
              <div className="flex flex-wrap gap-2">
                {interestLabels.map((label, i) => (
                  <span
                    key={`${label}-${i}`}
                    className="inline-flex items-center bg-tangerine-mist text-tangerine-deeper rounded-full px-3.5 py-1.5 text-[13px] font-medium"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default EducationSection;
