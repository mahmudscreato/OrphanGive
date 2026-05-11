import { Button } from "@/components/ui/Button";
import {
  HeartDoodle,
  SketchArrow,
} from "@/components/decorations/Sketches";

const TRUST_ITEMS = [
  "Verified profiles",
  "Secure payment",
  "Zakat-eligible",
  "Cancel anytime",
];

export function ClosingCTA() {
  return (
    <section className="relative overflow-hidden text-center bg-cream px-6 py-40 max-md:py-24">
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none opacity-70"
        style={{
          background:
            "radial-gradient(circle, var(--tangerine-mist) 0%, transparent 60%)",
        }}
      />
      <div className="relative max-w-[720px] mx-auto">
        <h2 className="font-display font-normal text-ink leading-[0.98] tracking-[-0.03em] text-[clamp(2.5rem,5.5vw,4.75rem)]">
          Begin{" "}
          {/* Session 16 — handwritten Caveat "today" replaces the
              italic Fraunces. Slight rotation + tangerine-deep give
              the word the "scrawled in the margin" feel without
              overpowering the rest of the headline. */}
          <span className="inline-block font-script text-tangerine-deep -rotate-[3deg] align-baseline">
            today.
          </span>
        </h2>
        <p className="mt-7 text-[18px] text-slate leading-[1.65]">
          A child somewhere is finishing dinner, picking up a pencil, opening
          a notebook. They are waiting on no one in particular. Be the no one
          in particular they were waiting on.
        </p>
        <div className="relative mt-12 flex gap-4 justify-center flex-wrap">
          {/* Session 16 — decorative arrow pointing toward the
              primary CTA. Desktop-only; the stacked-button mobile
              layout doesn't need it. */}
          <SketchArrow
            direction="down-right"
            className="hidden md:block absolute -left-4 -top-10 w-16 h-10 text-tangerine-deep opacity-60 pointer-events-none"
          />
          <Button href="/sponsor" variant="tangerine" size="lg">
            Sponsor a Child →
          </Button>
          <Button href="/children" variant="outline" size="lg">
            Browse children
          </Button>
        </div>
        <div className="mt-10 flex gap-5 justify-center items-center flex-wrap font-mono text-[11px] tracking-[0.1em] text-slate-soft">
          {/* Session 16 — small heart doodle anchors the trust
              badges. Aria-hidden via the Sketches component default. */}
          <HeartDoodle className="w-4 h-4 text-tangerine opacity-75" />
          {TRUST_ITEMS.map((t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <span className="w-[5px] h-[5px] rounded-full bg-moss" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ClosingCTA;
