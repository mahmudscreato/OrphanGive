// Session 26 — shared layout for the 5 legal pages (/privacy,
// /terms, /refund, /cookies, /safeguarding).
//
// Why centralise: each page has the same outer shape — hero with
// eyebrow + dual-font headline, last-updated chip, table of
// contents with anchor links, section blocks with id anchors,
// closing strip pointing at /contact. The content varies; the
// chrome is identical. Keeping it in one place means brand
// adjustments propagate to all five with a single edit.
//
// Print considerations: legal docs get printed. The Tailwind
// `print:` prefix swaps to a white background + black text +
// hides interactive chrome (ToC links, closing strip) so the
// printed copy is clean and ink-efficient.

import Link from "next/link";
import type { ReactNode } from "react";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type Props = {
  /** Small uppercase script eyebrow above the headline. */
  eyebrowText: string;
  /** First headline line (Fraunces ink). */
  headlinePart1: string;
  /** Second headline line (Caveat italic tangerine-deep). */
  headlinePart2: string;
  /** 1-2 sentence intro paragraph under the headline. */
  subCopy: string;
  /** "Last updated" date. Use the placeholder string until legal
   * sign-off lands a real date. */
  lastUpdated: string;
  /** Section blocks rendered in order. Each id anchors a ToC link. */
  sections: LegalSection[];
  /** Closing-strip topic name. Renders: "Have questions about
   * {topic}? Get in touch →". */
  closingTopic: string;
};

export function LegalPageLayout({
  eyebrowText,
  headlinePart1,
  headlinePart2,
  subCopy,
  lastUpdated,
  sections,
  closingTopic,
}: Props) {
  return (
    <div className="bg-cream print:bg-white">
      {/* HERO */}
      <header className="px-6 pt-20 pb-10 max-md:pt-14 max-md:pb-8 print:pt-6 print:pb-4">
        <div className="max-w-[820px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep print:text-black">
            <EyebrowIcon />
            {eyebrowText}
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)] print:text-black print:text-3xl">
              {headlinePart1}
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2 print:text-black print:text-3xl">
              {headlinePart2}
            </span>
          </h1>
          <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-2xl print:text-black print:text-base">
            {subCopy}
          </p>

          {/* Last-updated chip. Session 33 — Draft badge removed
              after Bangladesh counsel review (13 May 2026). */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 rounded-full bg-white border border-ink/[0.08] px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-soft">
              Last updated: {lastUpdated}
            </span>
          </div>
        </div>
      </header>

      {/* TABLE OF CONTENTS */}
      <section className="px-6 py-6 print:hidden">
        <div className="max-w-[820px] mx-auto">
          <div className="rounded-2xl bg-white border border-ink/[0.06] px-6 py-5">
            <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-3">
              Contents
            </div>
            <ol className="grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-1.5 list-decimal list-inside marker:text-ink-soft marker:font-mono marker:text-[12px]">
              {sections.map((s) => (
                <li key={s.id} className="text-sm">
                  <Link
                    href={`#${s.id}`}
                    className="text-ink-soft hover:text-tangerine-deep transition-colors duration-200"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* SECTIONS */}
      <section className="px-6 pt-4 pb-14 max-md:pb-10 print:pb-4">
        <div className="max-w-[820px] mx-auto space-y-12 max-md:space-y-10 print:space-y-6">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 print:break-inside-avoid"
            >
              <h2 className="font-display font-semibold text-2xl max-md:text-xl text-ink leading-tight tracking-[-0.01em] mb-4 print:text-black print:text-lg">
                {s.title}
              </h2>
              <div className="space-y-4 text-base text-ink-soft leading-[1.7] print:text-black print:text-sm">
                {s.content}
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* CLOSING STRIP */}
      <section className="px-6 py-10 max-md:py-8 print:hidden">
        <div className="max-w-[820px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Have questions about {closingTopic}?{" "}
            <Link
              href="/contact"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Get in touch →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

// Small helper for definition-list rows within a section. Renders
// a 2-col grid on desktop, stacked on mobile.
export function LegalDefList({
  items,
}: {
  items: Array<{ term: string; def: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-[200px_1fr] max-md:grid-cols-1 gap-x-6 gap-y-3 max-md:gap-y-1">
      {items.map((it, i) => (
        <div key={i} className="contents max-md:flex max-md:flex-col">
          <dt className="font-display font-semibold text-ink text-sm">
            {it.term}
          </dt>
          <dd className="text-ink-soft text-sm leading-[1.6]">{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

// Small helper for inline bullet lists within section content.
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-2 marker:text-tangerine-deep">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default LegalPageLayout;
