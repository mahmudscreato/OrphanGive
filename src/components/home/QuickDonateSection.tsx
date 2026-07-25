"use client";

// feat/homepage-donate-section — homepage entry to the guest
// cause-donation flow (/donate/quick). Sits BETWEEN FeaturedChildren
// ("Meet some of our children") and AboutSection ("About OrphanGive"),
// on the peach canvas. A warm white card panel — a peer of the other
// sections, not louder (the orange band is reserved for ClosingCTA).
//
// Presentation only: the actual cause selection + amounts live on
// /donate/quick. The cause chips here are illustrative and static so
// this stays a purely presentational section (no data fetch on the
// homepage).

import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, HeartPulse, Shirt, Utensils } from "lucide-react";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { Button } from "@/components/ui/Button";

const CAUSES: ReadonlyArray<{ label: string; icon: typeof Utensils }> = [
  { label: "Food", icon: Utensils },
  { label: "School supplies", icon: BookOpen },
  { label: "Health care", icon: HeartPulse },
  { label: "Warm clothes", icon: Shirt },
];

export function QuickDonateSection() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="px-6 py-16 max-md:py-12"
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="max-w-[920px] mx-auto rounded-[32px] bg-white border border-ink/[0.06] shadow-md px-10 py-12 max-md:px-6 max-md:py-9 text-center">
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Give in a minute
        </div>

        <h2 className="mt-4">
          <span className="block font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            A small gift,
          </span>
          <span
            className="block font-script text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)]"
            style={{ marginTop: 6 }}
          >
            quietly delivered.
          </span>
        </h2>

        <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-[560px] mx-auto">
          Not ready to sponsor a child? You can still help today. Give a
          quick, one-time gift toward a cause — a warm meal, a term of
          school supplies, a doctor&rsquo;s visit. It joins a pooled fund
          and reaches the children who need it most. No account needed.
        </p>

        {/* Illustrative causes — the real choice happens on /donate/quick. */}
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {CAUSES.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-ink/[0.08] bg-cream/70 px-4 py-2 text-[13.5px] text-ink"
            >
              <Icon
                className="h-4 w-4 text-tangerine-deeper stroke-[1.75]"
                aria-hidden="true"
              />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-9">
          <Button href="/donate/quick" variant="tangerine" size="lg">
            Give in a minute →
          </Button>
          <p className="mt-4 text-[13px] text-slate-soft leading-[1.6]">
            Secure checkout with Stripe · your receipt comes by email.
          </p>
        </div>
      </div>
    </motion.section>
  );
}

export default QuickDonateSection;
