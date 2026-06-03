"use client";

// "Your analytics choice" control, rendered inside the Cookie Policy page.
// Shows the current analytics-consent state for this browser and lets the
// visitor change or withdraw it.
//
// Withdraw / reset clears the cookie and reloads — so GA does NOT load on the
// next page load (the gate sees no consent), and the consent banner re-appears
// so the visitor can make a fresh choice. This is the GDPR/PECR "withdrawing
// consent must be as easy as giving it" path.

import { useEffect, useState } from "react";
import {
  clearConsent,
  readConsent,
  writeConsent,
  type ConsentValue,
} from "@/lib/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const BTN_BASE =
  "inline-flex items-center justify-center font-body font-semibold rounded-full px-5 py-2.5 text-sm cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream";

export function ConsentControls() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ConsentValue | null>(null);

  // Cookie isn't readable during SSR — resolve on the client after mount to
  // avoid a hydration mismatch.
  useEffect(() => {
    setState(readConsent());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const status =
    state === "granted"
      ? "Analytics is currently ON for this browser."
      : state === "denied"
        ? "Analytics is currently OFF for this browser — you declined."
        : "You haven't made an analytics choice on this browser yet.";

  const reloadAfter = (fn: () => void) => {
    fn();
    window.location.reload();
  };

  return (
    <div className="not-prose rounded-xl border border-ink/10 bg-cream/70 p-5">
      <p className="text-[14px] font-medium text-ink">{status}</p>
      {!GA_ID && (
        <p className="mt-1 text-[13px] text-ink-soft">
          (Analytics isn&rsquo;t configured on this environment, so nothing runs
          regardless of this setting.)
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {state === "granted" ? (
          <button
            type="button"
            onClick={() => reloadAfter(clearConsent)}
            className={`${BTN_BASE} border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-cream focus-visible:ring-ink`}
          >
            Withdraw analytics consent
          </button>
        ) : (
          <button
            type="button"
            onClick={() => reloadAfter(() => writeConsent("granted"))}
            className={`${BTN_BASE} bg-ink text-cream hover:bg-tangerine hover:text-ink focus-visible:ring-tangerine-deep`}
          >
            Turn analytics on
          </button>
        )}
        {state !== null && (
          <button
            type="button"
            onClick={() => reloadAfter(clearConsent)}
            className={`${BTN_BASE} text-tangerine-deeper underline-offset-4 hover:underline focus-visible:ring-tangerine-deep`}
          >
            Reset my choice
          </button>
        )}
      </div>
    </div>
  );
}

export default ConsentControls;
