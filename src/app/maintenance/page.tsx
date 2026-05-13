// Session 25 — manually-routed maintenance page.
//
// This page is NEVER auto-activated. Mahmud routes traffic here
// manually during planned maintenance windows (Cloudflare worker
// rule, edge-config flag, or a temporary reverse-proxy rewrite
// on the VPS). When this page renders, the rest of the site may
// or may not be reachable — so this file must be totally
// self-contained.
//
// "Self-contained" in practice:
//   - No async / no `getCurrentDonor()` / no Directus
//   - No `cookies()` / no `headers()` calls
//   - No components that import server-only utilities
//   - SiteNav + SiteFooter hide themselves on `/maintenance`
//     (see src/components/layout/{SiteNav,SiteFooter}.tsx)
//   - Logo references a Cloudinary URL — independent of our
//     Directus instance
//
// Expected return time: configure via `NEXT_PUBLIC_MAINTENANCE_
// RETURN_AT` (any human-readable string, rendered as-is). When
// unset, the page renders "Back shortly." without a specific time.

import Image from "next/image";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "We're making improvements — OrphanGive",
  description:
    "OrphanGive is briefly offline for maintenance. Sponsorships and donations are unaffected.",
  robots: { index: false, follow: false },
};

const LOGO_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_L_SVG_h9uduq.svg";

export default function MaintenancePage() {
  // Read directly at render time — Next.js inlines NEXT_PUBLIC_*
  // values into the bundle at build, so this never hits the
  // server's env at request time.
  const returnAt = process.env.NEXT_PUBLIC_MAINTENANCE_RETURN_AT?.trim();

  return (
    <div className="bg-cream min-h-screen flex flex-col">
      {/* Inline logo header — no SiteNav. */}
      <header className="px-6 pt-10 max-md:pt-8">
        <Image
          src={LOGO_URL}
          alt="OrphanGive"
          width={260}
          height={112}
          priority
          unoptimized
          className="h-12 lg:h-14 w-auto mx-auto"
        />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-[640px] text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Maintenance
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3.5rem)]">
              We&apos;re making improvements.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.5rem,5.5vw,4rem)] mt-2">
              Back shortly.
            </span>
          </h1>
          <p className="mt-6 max-w-md mx-auto text-base text-ink-soft leading-[1.7]">
            OrphanGive is briefly offline for planned maintenance.
            Your sponsorships and donations are unaffected — they
            continue processing normally on Stripe&apos;s side. Thank
            you for your patience.
          </p>

          {/* Optional expected-return chip. Renders only when the
              build was run with NEXT_PUBLIC_MAINTENANCE_RETURN_AT set. */}
          {returnAt ? (
            <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-orange-pale text-tangerine-deep px-4 py-2 font-mono text-[11px] tracking-[0.14em] uppercase">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse"
              />
              Expected back by {returnAt}
            </div>
          ) : null}

          <p className="mt-8 text-sm text-ink-soft">
            Need urgent help?{" "}
            <a
              href="mailto:support@orphangive.org"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              support@orphangive.org
            </a>
          </p>
        </div>
      </main>

      {/* Inline footer — no SiteFooter dependency. */}
      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-ink-soft font-mono tracking-wide">
          © {new Date().getFullYear()} OrphanGive · Operated by
          Children&apos;s Heaven Trust
        </p>
      </footer>
    </div>
  );
}
