// Session 57 — Mobile-only sticky sponsor CTA.
//
// Appears as a slide-up tray pinned to the bottom of the viewport
// AFTER the user has scrolled past the hero. Gives the primary
// action a permanent home on small screens without taking attention
// from the warm card stack above it on first paint.
//
// Show/hide trigger: we observe the hero section's bottom edge
// crossing the top 25% of the viewport via IntersectionObserver.
// Pure client-side (no layout shift on initial SSR — the tray is
// rendered with `translate-y-full opacity-0` and only slides in
// once the observer fires).
//
// Desktop (`md:hidden`) hides this entirely — the bottom SponsorCTA
// section is already prominent on wider screens.

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ViewerTier } from "@/lib/child-profile-data";

export function StickyMobileSponsorCTA({
  childId,
  childFirstName,
  tier,
}: {
  childId: string;
  childFirstName: string;
  tier: ViewerTier;
}) {
  const [show, setShow] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Mount a sentinel just below the hero (the page renders this
  // component right after <ProfileHero/>). When the sentinel
  // leaves the top of the viewport, the user has scrolled past
  // the hero — show the tray.
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Show when the sentinel is ABOVE the viewport (scrolled
        // past). Hide when it's in or below the viewport (still
        // looking at hero / above it).
        setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: "0px 0px -90% 0px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  const href =
    tier === "public"
      ? `/signin?from=/children/${childId}`
      : `/sponsor/${childId}`;
  const label =
    tier === "public"
      ? `Sign in to sponsor ${childFirstName}`
      : `Sponsor ${childFirstName}`;

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px md:hidden" />
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
                    bg-warmth-50/95 backdrop-blur border-t border-warmth-accent/15
                    transition-transform duration-300 ease-out
                    ${show ? "translate-y-0" : "translate-y-full"}`}
        aria-hidden={!show}
      >
        <Link
          href={href}
          tabIndex={show ? 0 : -1}
          className="flex items-center justify-center gap-2
                     w-full rounded-full bg-tangerine hover:bg-tangerine-deep
                     px-6 py-3.5 text-white font-medium text-[15px]
                     shadow-warm transition-colors"
        >
          {label} →
        </Link>
      </div>
    </>
  );
}

export default StickyMobileSponsorCTA;
