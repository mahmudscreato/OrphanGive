// fix/donate-strip-polish — the guest quick-donation module, in two
// presentations that share one interactive control + one guest backend:
//
//   variant="strip"    — feat/donate-strip-sticky: a compact one-row bar FIXED
//                        to the bottom of the viewport (sticky while scrolling),
//                        with a session-level dismiss. Repeats on every page
//                        except the exclusions below. Self-suppresses while the
//                        cookie-consent banner is up (both are bottom-fixed).
//   variant="section"  — the inspiring, highlighted mid-page block on the
//                        homepage (after "Meet some of our Children").
//
// Both post the selected cause + typed amount to the EXISTING
// POST /api/donate/guest-init (the same endpoint /donate/quick uses), which
// recomputes + validates the amount SERVER-SIDE and returns a hosted Stripe
// Checkout URL. ONE-TIME ONLY, no account, no frequency. The DONATE click is
// the explicit checkout hand-off — never an auto-submit.
//
// The dropdown lists the curated cause taxonomy labels; each carries a
// server-resolved representative packageId (see @/lib/donate-module) so the
// charge always maps to a valid one_time package. The label mark is the OG
// logo mark (EyebrowIcon), not a generic heart.

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import type { DonateCause } from "@/lib/donate-module";
import {
  CONSENT_EVENT,
  isAnalyticsExcludedPath,
  readConsent,
} from "@/lib/consent";

// Route prefixes where the sticky STRIP must NOT appear (matched with
// startsWith so nested routes are covered).
//   • /donate*  — the guest/account donation flow itself (incl. quick + success)
//   • /sponsor* — the multi-step sponsor flow ends in INLINE payment
//   • /checkout, /cart, /resume* — mid-purchase / resume-payment surfaces
//   • /admin*, /di*, /dev* — staff / internal, not donor-facing
//   • /signin, /signup, /forgot-password, /reset-password, /auth — auth flows
//   • /maintenance, /offline — system pages
// NOTE: the homepage ("/") is intentionally NOT excluded — per the founder
// default the sticky bar shows there too, alongside the mid-page section (they
// serve different moments: a persistent nudge vs. an in-content invitation).
const HIDE_PREFIXES = [
  "/donate",
  "/sponsor",
  "/support",
  "/checkout",
  "/cart",
  "/resume",
  "/admin",
  "/di",
  "/dev",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/maintenance",
  "/offline",
] as const;

// Session-level dismissal — the sticky bar hides for the rest of the browsing
// session once the donor closes it, and returns on a fresh visit
// (sessionStorage, never localStorage → never a permanent hide).
const DISMISS_KEY = "og_donate_strip_dismissed";

// Shared input styling so the control reads identically in both variants.
const SELECT_CLASS =
  "h-12 rounded-full border border-ink/[0.14] bg-white px-5 pr-9 text-[15px] text-ink shadow-sm focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft disabled:opacity-60";
const AMOUNT_WRAP_CLASS =
  "inline-flex items-center h-12 rounded-full border border-ink/[0.14] bg-white px-5 shadow-sm focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft";
const AMOUNT_INPUT_CLASS =
  "w-24 bg-transparent text-[16px] text-ink focus:outline-none max-md:w-full";
const BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 h-12 shrink-0 font-body font-semibold rounded-full bg-tangerine text-ink px-7 text-[15px] transition-all hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-60";

export function DonateModule({
  variant,
  causes,
  currencySymbol,
  currencyCode,
  customFloor,
}: {
  variant: "strip" | "section";
  causes: DonateCause[];
  currencySymbol: string;
  currencyCode: string;
  /** Display-currency minimum for the typed amount (server enforces the BDT floor). */
  customFloor: number;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [causeEnum, setCauseEnum] = useState<string>(causes[0]?.enum ?? "");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Sticky-strip state (strip variant only; harmless no-ops for section) ──
  const isStrip = variant === "strip";
  const barRef = useRef<HTMLElement>(null);
  // Client-only gate: the sticky bar is a client enhancement — never rendered
  // during SSR, so there's no flash before the dismissal/consent checks run.
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Suppress the bar while the cookie-consent banner is up — it's also fixed to
  // the bottom (z-[55]); showing both would collide. Consent is a one-time gate.
  const [consentBlocking, setConsentBlocking] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* sessionStorage unavailable (private-mode edge cases) — just show it */
    }
  }, []);

  // Mirror the ConsentBanner's own visibility logic so the two never overlap,
  // and re-check when the donor makes a consent choice (CONSENT_EVENT).
  useEffect(() => {
    if (!isStrip) return;
    const check = () => {
      const gaConfigured = Boolean(process.env.NEXT_PUBLIC_GA_ID);
      setConsentBlocking(
        gaConfigured &&
          !isAnalyticsExcludedPath(pathname) &&
          readConsent() === null,
      );
    };
    check();
    window.addEventListener(CONSENT_EVENT, check);
    return () => window.removeEventListener(CONSENT_EVENT, check);
  }, [isStrip, pathname]);

  const routeExcluded = HIDE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const showStrip =
    isStrip &&
    hydrated &&
    causes.length > 0 &&
    !dismissed &&
    !consentBlocking &&
    !routeExcluded;

  // Reserve space equal to the bar's height so the fixed bar never permanently
  // covers footer content. Only the strip instance touches body padding (the
  // homepage also mounts a section instance — it must not fight over it).
  useEffect(() => {
    if (!isStrip) return;
    if (!showStrip) {
      document.body.style.paddingBottom = "";
      return;
    }
    const el = barRef.current;
    if (!el) return;
    const apply = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
    };
    apply();
    // ResizeObserver catches the bar re-wrapping; the window resize listener is
    // a belt-and-braces fallback so the footer spacing stays correct on
    // viewport width / orientation changes even where RO is unreliable.
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      document.body.style.paddingBottom = "";
    };
  }, [isStrip, showStrip]);

  function dismissStrip() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  async function donate() {
    setError(null);
    const cause = causes.find((c) => c.enum === causeEnum) ?? null;
    if (!cause) {
      setError("Please choose a cause.");
      return;
    }
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n < customFloor) {
      // Fast client-side floor pre-check; the server re-validates
      // authoritatively (BDT floor + ceiling) on the same call.
      setError(`Please enter at least ${currencySymbol}${customFloor}.`);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/donate/guest-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: cause.packageId,
          customAmount: Math.round(n),
          currencyCode,
          // The curated cause the donor picked drives the Stripe line-item label
          // (server-validated; charge still keyed by packageId).
          cause: cause.enum,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(
          data.error ?? "Could not start the donation. Please try again.",
        );
        setPending(false);
        return;
      }
      // Explicit hand-off to Stripe's hosted Checkout.
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  // ── Shared interactive control: cause · amount · donate ──────────────
  const controls = (
    <div className="flex items-center gap-3 flex-wrap max-md:w-full max-md:gap-2">
      <label className="sr-only" htmlFor={`donate-cause-${variant}`}>
        Choose a cause
      </label>
      <select
        id={`donate-cause-${variant}`}
        value={causeEnum}
        onChange={(e) => setCauseEnum(e.target.value)}
        disabled={pending}
        className={`${SELECT_CLASS} max-md:flex-1 max-md:min-w-0`}
      >
        {causes.map((c) => (
          <option key={c.enum} value={c.enum}>
            {c.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`donate-amount-${variant}`}>
        Amount in {currencyCode}
      </label>
      <div className={AMOUNT_WRAP_CLASS}>
        <span className="font-display text-[16px] text-ink mr-1">
          {currencySymbol}
        </span>
        <input
          id={`donate-amount-${variant}`}
          type="number"
          inputMode="numeric"
          min={customFloor}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
          placeholder={String(customFloor)}
          className={AMOUNT_INPUT_CLASS}
        />
      </div>

      <button
        type="button"
        onClick={donate}
        disabled={pending}
        className={`${BUTTON_CLASS} max-md:flex-1`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? "Taking you to checkout…" : "Donate"}
      </button>
    </div>
  );

  const errorLine = error ? (
    <p className="text-[13px] text-danger" role="alert">
      {error}
    </p>
  ) : null;

  // ── SECTION variant — inspiring, highlighted mid-page block ──────────
  if (variant === "section") {
    if (causes.length === 0) return null;
    return (
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[960px] mx-auto">
          <div className="relative overflow-hidden rounded-[32px] border border-tangerine-soft bg-gradient-to-br from-tangerine-mist via-cream to-tangerine-soft/60 shadow-warm px-10 py-12 max-md:px-6 max-md:py-9">
            {/* Soft warm glow, top-right — adds depth without noise. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-tangerine-light/25 blur-3xl"
            />
            {/* Center-aligned to match the other homepage sections. */}
            <div className="relative text-center">
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
                Every child deserves to feel held. Your gift reaches a child in
                Bangladesh as a warm meal, a health check, or a day of school —
                real care, delivered with dignity.
              </p>

              {/* Control panel — a clean white inset keeps the one-row
                  cause · amount · donate flow crisp on the warm card. */}
              <div className="mt-8 rounded-3xl border border-ink/[0.06] bg-white/70 backdrop-blur-sm px-6 py-5 max-md:px-4 max-md:py-4">
                <div className="flex justify-center">{controls}</div>
                {errorLine ? <div className="mt-3">{errorLine}</div> : null}
              </div>

              <p className="mt-4 text-[13px] text-slate-soft leading-[1.6]">
                Secure checkout with Stripe · your receipt comes by email.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── STRIP variant — sticky, dismissible bottom bar ───────────────────
  // feat/donate-strip-sticky. Fixed to the viewport bottom (z-40, below the
  // nav z-50 and consent z-[55]); warm-but-dignified so it reads as a calm
  // invitation even above a child's story. Gentle slide-up on first appearance
  // (respects prefers-reduced-motion). Body padding (above) keeps the footer
  // readable; the × dismisses for the session.
  if (!showStrip) return null;
  return (
    <motion.aside
      ref={barRef}
      aria-label="Quick donation"
      initial={reduceMotion ? false : { y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-tangerine bg-gradient-to-r from-tangerine-mist via-tangerine-soft/80 to-tangerine-mist backdrop-blur-sm shadow-[0_-6px_24px_-6px_rgba(45,45,45,0.18)]"
    >
      <div className="relative max-w-[1200px] mx-auto px-6 py-4 pr-12 max-md:px-4 max-md:pr-10">
        <div className="flex items-center gap-x-5 gap-y-3 flex-wrap max-md:gap-x-3">
          {/* Lead — OG mark + dignified prompt. */}
          <div className="flex items-center gap-2 shrink-0">
            <EyebrowIcon className="!h-6 !mr-0" />
            <span className="font-display text-[18px] text-ink leading-tight max-md:text-[16px]">
              Give a one-time gift
            </span>
          </div>

          {controls}

          <p className="text-[12.5px] text-ink-soft/80 leading-[1.5] max-md:w-full">
            No account needed · secure checkout with Stripe.
          </p>
        </div>

        {errorLine ? <div className="mt-2">{errorLine}</div> : null}

        {/* Session-level dismiss. */}
        <button
          type="button"
          onClick={dismissStrip}
          aria-label="Dismiss donation bar"
          className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:text-ink hover:bg-ink/[0.06] transition-colors focus:outline-none focus:ring-2 focus:ring-tangerine-soft"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </motion.aside>
  );
}

export default DonateModule;
