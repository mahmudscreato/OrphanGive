import {
  ScribbleAccent,
  SketchArrow,
} from "@/components/decorations/Sketches";

type Step = {
  num: string;
  // Session 16 — handwritten numeral shown in Caveat. Pairs with
  // `num` for callers who want both forms (e.g. analytics labels
  // using the numeric form, visuals using the script).
  script: string;
  title: string;
  body: string;
  meta: string;
  tilt: number;
};

const STEPS: Step[] = [
  {
    num: "01",
    script: "one",
    title: "Choose a child whose journey moves you.",
    body: "Browse verified profiles. Each child has been registered with their guardian's consent and verified by our field team. Filter by location, age, or education level.",
    meta: "Average decision time: 8 minutes",
    tilt: -0.6,
  },
  {
    num: "02",
    script: "two",
    title: "Sponsor them on a monthly basis.",
    body: "From BDT 1,500 a month — covering education, books, meals, and care. Tiers are flexible. Payments are zakat-eligible. Cancel any time, no questions asked.",
    meta: "Most chosen: 12 months at BDT 3,000/mo",
    tilt: 0.4,
  },
  {
    num: "03",
    script: "three",
    title: "Watch them grow.",
    body: "Quarterly reports. School photos. Their actual handwritten letters. Updates from the caretaker who sees them every day. Sensitive details stay private to protect them.",
    meta: "94% of sponsors continue past year one",
    tilt: -0.4,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-cream px-6 py-[140px] max-md:py-24"
    >
      <div className="max-w-[1320px] mx-auto">
        <div className="text-center mb-20 max-w-[720px] mx-auto">
          <div className="eyebrow-tag justify-center">How it works</div>
          <h2 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,4rem)]">
            Three steps. <em className="italic text-tangerine">Years</em> of
            difference.
          </h2>
          <p className="mt-6 text-[18px] text-slate leading-[1.6]">
            The journey from a single click to a multi-year sponsorship is
            simple by design — but the relationship itself is anything but.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1 relative">
          {STEPS.map((step, idx) => (
            <div
              key={step.num}
              // Session 16 — per-card tilt + corner scribble. Tilt
              // settles to 0 on hover (transition handled by the
              // existing `hover:rotate-0` Tailwind utility added
              // below).
              style={{ transform: `rotate(${step.tilt}deg)` }}
              className={`group bg-white rounded-[28px] py-10 px-8 relative border border-ink/[0.05] transition-all duration-[400ms] ease-soft hover:-translate-y-1.5 hover:shadow-lift hover:border-tangerine-soft hover:rotate-0 ${
                idx === 1 ? "max-lg:mt-0 mt-8" : ""
              } ${idx === 2 ? "max-lg:mt-0 mt-4" : ""}`}
            >
              {/* Caveat-script numeral. Replaces the clean 01/02/03
                  with handwritten "one / two / three". Keeps the
                  pill background so the visual weight matches the
                  rest of the card. */}
              <div className="inline-flex items-center justify-center min-w-14 h-14 px-4 rounded-full bg-tangerine-mist text-tangerine-deep mb-7 transition-all duration-[350ms] ease-spring group-hover:bg-tangerine group-hover:text-white group-hover:scale-105 group-hover:-rotate-[3deg]">
                <span className="font-script text-[28px] leading-none -mt-1">
                  {step.script}
                </span>
              </div>
              {/* Tiny scribble doodle in the top-right corner —
                  "doodled in the margin" accent. */}
              <ScribbleAccent
                variant={idx === 1 ? "swirl" : "spark"}
                className="absolute top-5 right-5 w-5 h-5 text-tangerine opacity-50 pointer-events-none"
              />
              <h3 className="font-display font-normal text-[1.85rem] tracking-[-0.015em] leading-[1.15] text-ink">
                {step.title}
              </h3>
              <p className="mt-4 text-[15px] text-slate leading-[1.65]">
                {step.body}
              </p>
              <div className="mt-6 pt-5 border-t border-ink/[0.06] font-mono text-[11px] text-slate-soft tracking-[0.1em] flex items-center gap-2">
                <span className="w-[5px] h-[5px] rounded-full bg-tangerine" />
                {step.meta}
              </div>
              {/* Connector arrow to the next card. Hidden on the
                  last card and on small screens (the stacked
                  mobile layout doesn't need a horizontal arrow). */}
              {idx < STEPS.length - 1 ? (
                <SketchArrow
                  direction="right"
                  className="hidden lg:block absolute top-1/2 -right-7 -translate-y-1/2 w-12 h-6 text-tangerine-deep opacity-50 pointer-events-none"
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
