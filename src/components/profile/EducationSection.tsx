import type { ChildProfile } from "@/lib/child-profile-data";

const EDUCATION_LABELS: Record<string, string> = {
  primary: "Primary school",
  secondary: "Secondary school",
  madrasa: "Madrasa",
  vocational: "Vocational training",
};

export function EducationSection({ child }: { child: ChildProfile }) {
  const eduLabel = child.education_level
    ? EDUCATION_LABELS[child.education_level.toLowerCase()] ?? child.education_level
    : null;
  const hasContent =
    eduLabel || child.class_grade || child.areas_of_interest.length > 0;
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
          {(eduLabel || child.class_grade) ? (
            <div className="rounded-[20px] bg-white border border-ink/[0.05] px-6 py-5">
              <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-soft mb-2">
                Schooling
              </div>
              <div className="font-display text-[22px] text-ink leading-snug">
                {eduLabel}
                {child.class_grade ? `, class ${child.class_grade}` : ""}
              </div>
            </div>
          ) : null}

          {child.areas_of_interest.length > 0 ? (
            <div className="rounded-[20px] bg-white border border-ink/[0.05] px-6 py-5">
              <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-soft mb-3">
                Interests
              </div>
              <div className="flex flex-wrap gap-2">
                {child.areas_of_interest.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center bg-tangerine-mist text-tangerine-deeper rounded-full px-3.5 py-1.5 text-[13px] font-medium"
                  >
                    {interest}
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
