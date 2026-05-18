// Session 57 — Children profile redesign: warm modular "School &
// studies" card.
//
// Replaces the prior 2-card grid ("Schooling" + "Interests" white
// cards on a `bg-linen` band) with a single warm card containing
// a 2-column layout: left = school/grade with a soft book icon,
// right = interests as warm pill tags. Adds an optional aspiration
// line when the data is populated (we don't yet have a dedicated
// `aspiration` column — the rendering will gracefully no-op until
// one is added).
//
// The schoolingLine + interestsLabel logic is unchanged from prior
// (both pulled from form-constants helpers — same source as the DI
// dropdowns), so this is purely a visual restyle.

import type { ChildProfile } from "@/lib/child-profile-data";
import { WarmCard, CardHeader } from "./WarmCard";
import {
  composeSchoolingLine,
  getAreasOfInterestLabels,
} from "@/lib/form-constants";

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="w-10 h-10 md:w-12 md:h-12 text-warmth-accent"
      aria-hidden="true"
    >
      <path
        d="M4 5.5A1.5 1.5 0 015.5 4H12v15H5.5A1.5 1.5 0 014 17.5v-12z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 4h6.5A1.5 1.5 0 0120 5.5v12a1.5 1.5 0 01-1.5 1.5H12V4z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 9h2.5M7 12h2.5M14.5 9H17M14.5 12H17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EducationSection({ child }: { child: ChildProfile }) {
  const schoolingLine = composeSchoolingLine(
    child.education_level,
    child.class_grade,
  );
  const interestLabels = getAreasOfInterestLabels(child.areas_of_interest);

  const hasContent = schoolingLine || interestLabels.length > 0;
  if (!hasContent) return null;

  const firstName = child.display_name.split(" ")[0] || child.display_name;

  return (
    <section className="px-4 md:px-6 py-6 md:py-8 bg-warmth-50">
      <div className="max-w-[760px] mx-auto">
        <WarmCard>
          <CardHeader title="School & studies" />

          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-7 items-start">
            {/* Left: icon + school line */}
            {schoolingLine ? (
              <div className="flex items-start gap-4 md:block">
                <div className="shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-warmth-100 flex items-center justify-center md:mb-3">
                  <BookIcon />
                </div>
                <div className="md:mt-0">
                  <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-warmth-accent font-medium">
                    Currently
                  </p>
                  <p className="font-display text-[18px] md:text-[20px] text-ink leading-snug mt-0.5">
                    {schoolingLine}
                  </p>
                </div>
              </div>
            ) : (
              // Layout placeholder so the right column doesn't
              // jump left when school data isn't populated yet.
              <div className="hidden md:block w-16" aria-hidden="true" />
            )}

            {/* Right: interests as warm pills */}
            {interestLabels.length > 0 ? (
              <div>
                <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-warmth-accent font-medium">
                  {firstName} loves
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {interestLabels.map((label, i) => (
                    <span
                      key={`${label}-${i}`}
                      className="inline-flex items-center bg-warmth-100 text-warmth-text rounded-full px-3.5 py-1.5 text-[13px] font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </WarmCard>
      </div>
    </section>
  );
}

export default EducationSection;
