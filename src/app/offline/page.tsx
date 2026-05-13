// Session 25 — offline fallback page.
//
// This page exists so a service worker (when one is eventually
// added) can fall back to it when the network is unavailable. The
// app does NOT currently ship a service worker — see the Session
// 25 ship report. Without one, this page is unreachable in the
// "user is offline" sense; it's reachable only if the user
// directly navigates to `/offline` while online.
//
// Why ship it now: when next-pwa or a hand-rolled service worker
// lands, the SW config can declare this URL as its offline
// fallback without a code change to this file. Lower coupling
// when the PWA work happens.
//
// Same self-contained constraints as /maintenance — no Directus,
// no async, no cookies / headers, SiteNav + SiteFooter hide
// themselves on `/offline`.

import Image from "next/image";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "You're offline — OrphanGive",
  description:
    "OrphanGive needs an internet connection. Please reconnect and try again.",
  robots: { index: false, follow: false },
};

const LOGO_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_L_SVG_h9uduq.svg";

export default function OfflinePage() {
  return (
    <div className="bg-cream min-h-screen flex flex-col">
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
            No connection
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3.5rem)]">
              You&apos;re offline.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.5rem,5.5vw,4rem)] mt-2">
              We&apos;ll be here when you&apos;re back.
            </span>
          </h1>
          <p className="mt-6 max-w-md mx-auto text-base text-ink-soft leading-[1.7]">
            OrphanGive needs an internet connection to load child
            profiles, donations, and your account. Please reconnect
            and try again.
          </p>

          <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-orange-pale text-tangerine-deep px-4 py-2 font-mono text-[11px] tracking-[0.14em] uppercase">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-ink/40"
            />
            Offline
          </div>

          {/* If the page is reachable, the user IS online (no SW
              is shipped). Surface a one-line nudge to retry the
              homepage — useful even in the future-PWA scenario. */}
          <p className="mt-8 text-sm text-ink-soft">
            Already reconnected?{" "}
            <a
              href="/"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Try the homepage →
            </a>
          </p>
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-ink-soft font-mono tracking-wide">
          © {new Date().getFullYear()} OrphanGive
        </p>
      </footer>
    </div>
  );
}
