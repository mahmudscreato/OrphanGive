// Session 42 — DI Dashboard mobile header.
//
// Lightweight branded bar at the top of the viewport on mobile only.
// Hidden on desktop (md:hidden) where the sidebar carries the brand.
// Doesn't include user menu actions — those live in /di/profile
// (Session 46) so the header stays minimal.

import Image from "next/image";
import Link from "next/link";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

export function DiHeader() {
  return (
    <header className="md:hidden bg-cream border-b border-ink/[0.06] px-5 py-3 sticky top-0 z-30">
      <Link href="/di" className="inline-flex items-center gap-2.5">
        <Image
          src={FAVICON_URL}
          alt=""
          width={36}
          height={50}
          unoptimized
          aria-hidden="true"
          className="w-6 h-auto shrink-0"
        />
        <div>
          <div className="font-display text-[16px] text-ink leading-tight">
            OrphanGive
          </div>
          <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-soft -mt-0.5">
            Data Inputter
          </div>
        </div>
      </Link>
    </header>
  );
}
