// fix/donate-strip-polish — the guest quick-donation module, in two
// presentations that share one interactive control + one guest backend:
//
//   variant="strip"    — the compact one-row band repeated at the bottom of
//                        every page (self-hides on the donation flow,
//                        mid-payment/checkout, staff, auth, and the homepage —
//                        the homepage renders the section variant instead).
//   variant="section"  — the inspiring, highlighted mid-page block on the
//                        homepage (after "Meet some of our Children").
//
// Both post the selected cause + typed amount to the EXISTING
// POST /api/donate/guest-init (the same endpoint /donate/quick uses), which
// recomputes + validates the amount SERVER-SIDE and returns a hosted Stripe
// Checkout URL. ONE-TIME ONLY, no account, no frequency. The DONATE click is
// the explicit checkout hand-off — never an auto-submit.
//
// FIX 1: the dropdown lists the 6 curated cause taxonomy labels; each carries
// a server-resolved representative packageId (see @/lib/donate-module) so the
// charge always maps to a valid one_time package. FIX 4: the label mark is the
// OG logo mark (EyebrowIcon), not a generic heart.

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import type { DonateCause } from "@/lib/donate-module";

// Route prefixes where the bottom STRIP must NOT appear (matched with
// startsWith so nested routes are covered). The homepage ("/") is handled
// separately below — it shows the SECTION variant mid-page instead.
//   • /donate*  — the guest/account donation flow itself (incl. quick + success)
//   • /sponsor* — the multi-step sponsor flow ends in INLINE payment
//   • /checkout, /cart, /resume* — mid-purchase / resume-payment surfaces
//   • /admin*, /di*, /dev* — staff / internal, not donor-facing
//   • /signin, /signup, /forgot-password, /reset-password, /auth — auth flows
//   • /maintenance, /offline — system pages
const HIDE_PREFIXES = [
  "/donate",
  "/sponsor",
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
  const [causeEnum, setCauseEnum] = useState<string>(causes[0]?.enum ?? "");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to charge → render nothing (both variants).
  if (causes.length === 0) return null;

  // The bottom strip self-hides on excluded routes AND the homepage (which
  // shows the section variant mid-page, so the strip would be a duplicate).
  if (variant === "strip") {
    const hidden =
      pathname === "/" ||
      HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (hidden) return null;
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
          // Fix 1 — the curated cause the donor picked drives the Stripe
          // line-item label (server-validated; charge still keyed by packageId).
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
    return (
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[960px] mx-auto">
          <div className="relative overflow-hidden rounded-[32px] border border-tangerine-soft bg-gradient-to-br from-tangerine-mist via-cream to-tangerine-soft/60 shadow-warm px-10 py-12 max-md:px-6 max-md:py-9">
            {/* Soft warm glow, top-right — adds depth without noise. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-tangerine-light/25 blur-3xl"
            />
            {/* Fix 4 — center-aligned to match the other homepage sections. */}
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

              {/* Fix 5 — emotional, human copy; leads with heart, keeps the
                  practical reassurance, no "pooled fund" language. */}
              <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-[560px] mx-auto">
                Somewhere in Bangladesh, a child is waiting for someone to care.
                In just a minute — no account needed — your gift becomes a warm
                meal, school supplies, or a doctor&rsquo;s visit for a child who
                needs it, reaching them exactly where the need is greatest.
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

  // ── STRIP variant — compact, tastefully-elevated bottom band ─────────
  return (
    <aside
      aria-label="Quick donation"
      className="w-full border-t border-tangerine-soft bg-gradient-to-r from-tangerine-mist via-tangerine-soft/70 to-tangerine-mist"
    >
      <div className="max-w-[1200px] mx-auto px-6 py-5 max-md:py-4">
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
      </div>
    </aside>
  );
}

export default DonateModule;
