"use client";

// Analytics consent banner — GDPR/PECR opt-in (deny-by-default).
//
// Shows once, on the first visit to a public page, when no choice has been
// recorded. Two equally-weighted buttons: "Accept analytics" and "Decline".
// PECR requires refusing to be as easy as accepting, so Decline is a real
// button of the same size and prominence — never a buried link or a faint
// "x". There are no pre-ticked boxes (there are no boxes at all). The choice
// is written to a first-party cookie and the banner does not re-appear until
// the choice is withdrawn (see /cookies). The banner can only be dismissed by
// making a choice — ignoring or scrolling does not dismiss it, and there is no
// implied consent.
//
// Excluded from staff/auth surfaces via the SAME list Analytics uses, so the
// two never disagree about where they appear.
//
// Button colors mirror the site's <Button> variants ("primary" =
// bg-ink/text-cream, "outline" = bordered ink) — both already WCAG-AA-checked
// (see components/ui/Button.tsx) — but are hand-rolled here so the two can be
// flex-1 equal-width columns with explicit focus rings.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isAnalyticsExcludedPath,
  readConsent,
  writeConsent,
  type ConsentValue,
} from "@/lib/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const BTN_BASE =
  "flex-1 inline-flex items-center justify-center font-body font-semibold rounded-full px-5 py-3 text-sm cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream";

export function ConsentBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  // Decide visibility on the client only (the cookie isn't available during
  // SSR), so there's no hydration mismatch and no flash for visitors who have
  // already chosen. If GA isn't configured at all, never show — there is
  // nothing to consent to.
  useEffect(() => {
    if (!GA_ID || isAnalyticsExcludedPath(pathname)) {
      setShow(false);
      return;
    }
    setShow(readConsent() === null);
  }, [pathname]);

  if (!show) return null;

  const choose = (value: ConsentValue) => {
    writeConsent(value); // dispatches CONSENT_EVENT → a mounted <Analytics> reacts
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="Analytics cookie consent"
      className="fixed inset-x-0 bottom-0 z-[55] px-4 pb-4 max-md:px-3 max-md:pb-3"
    >
      <div className="mx-auto max-w-[680px] rounded-2xl border border-ink/10 bg-cream p-5 shadow-xl shadow-ink/10 max-md:p-4">
        <p className="text-[14px] leading-relaxed text-ink">
          We&rsquo;d like to use{" "}
          <span className="font-semibold">Google Analytics</span>{" "}
          to understand how people use OrphanGive &mdash; anonymous usage only.
          We never send
          anything that identifies a child or a donor, and analytics stays off
          until you choose.{" "}
          <Link
            href="/cookies"
            className="font-medium text-tangerine-deeper underline-offset-4 hover:underline"
          >
            How we handle cookies
          </Link>
          .
        </p>
        <div className="mt-4 flex gap-3 max-sm:flex-col">
          <button
            type="button"
            onClick={() => choose("granted")}
            className={`${BTN_BASE} bg-ink text-cream hover:bg-tangerine hover:text-ink focus-visible:ring-tangerine-deep`}
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={() => choose("denied")}
            className={`${BTN_BASE} border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-cream focus-visible:ring-ink`}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConsentBanner;
