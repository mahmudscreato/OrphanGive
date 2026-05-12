import Link from "next/link";

/**
 * Session 17 — quiet end-note that closes the browse page before
 * the footer. NOT a conversion moment (the per-card Support button
 * is) — just a one-line dignity / verification statement and a
 * link to the verification process.
 */
export function BrowseClosingStrip() {
  return (
    <section className="px-6 py-12 max-md:py-10">
      <div className="max-w-[860px] mx-auto text-center">
        <p className="text-base text-ink-soft leading-relaxed">
          Profiles are added only after careful verification with our
          field partners and with each guardian&apos;s consent.{" "}
          <Link
            href="/how-it-works"
            className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
          >
            How verification works →
          </Link>
        </p>
      </div>
    </section>
  );
}

export default BrowseClosingStrip;
