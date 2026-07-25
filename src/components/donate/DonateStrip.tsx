// feat/donate-strip — compact global donate bar.
//
// A one-row inline strip — [cause dropdown] [amount input] [DONATE] —
// mounted once in the root layout (above SiteFooter) so it repeats at the
// bottom of every page it isn't excluded from. ONE-TIME ONLY, no account,
// no frequency/recurring.
//
// It reuses the EXISTING guest flow verbatim: on DONATE it posts the
// selected cause + typed amount to POST /api/donate/guest-init (the SAME
// endpoint /donate/quick uses), which recomputes + validates the amount
// SERVER-SIDE and returns a hosted Stripe Checkout URL. Nothing is charged
// or trusted client-side; the DONATE click is the explicit checkout
// hand-off (never an auto-submit). This is a new UI surface on the same
// backend — no new payment path, no new Stripe logic.
//
// Visibility: self-hides (like SiteNav/SiteFooter) on the donation flow
// itself, mid-payment/checkout surfaces, staff areas, and auth flows —
// see HIDE_PREFIXES. It DOES show on the public site and the donor
// dashboard.

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";

export interface StripCause {
  id: string;
  /** Cause label for the dropdown (donation_package.name_en). */
  name_en: string;
}

// Route prefixes where the strip must NOT appear. Matched with
// startsWith so nested routes are covered.
//   • /donate*  — the guest/account donation flow itself (incl. quick + success)
//   • /sponsor* — the multi-step sponsor flow ends in INLINE payment
//   • /checkout, /cart, /resume* — mid-purchase / resume-payment surfaces
//   • /admin*, /di*, /dev* — staff / internal, not donor-facing
//   • /signin, /signup, /forgot-password, /reset-password, /auth — focused
//     auth flows; a donate CTA mid-signup competes with the task
//   • /maintenance, /offline — system pages (SiteNav/SiteFooter hide here too)
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

export function DonateStrip({
  causes,
  currencySymbol,
  currencyCode,
  customFloor,
}: {
  causes: StripCause[];
  currencySymbol: string;
  currencyCode: string;
  /** Display-currency minimum for the typed amount (server enforces the BDT floor). */
  customFloor: number;
}) {
  const pathname = usePathname();
  const [causeId, setCauseId] = useState<string>(causes[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Self-hide on excluded routes + when there are no active causes.
  const hidden =
    causes.length === 0 ||
    HIDE_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  if (hidden) return null;

  async function donate() {
    setError(null);
    if (!causeId) {
      setError("Please choose a cause.");
      return;
    }
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n < customFloor) {
      // Client-side floor pre-check for a fast, clear message; the server
      // re-validates authoritatively (BDT floor + ceiling) on the same call.
      setError(`Please enter at least ${currencySymbol}${customFloor}.`);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/donate/guest-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: causeId,
          customAmount: Math.round(n),
          currencyCode,
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

  return (
    <aside
      aria-label="Quick donation"
      className="w-full border-t border-tangerine-soft bg-tangerine-soft/60"
    >
      <div className="max-w-[1200px] mx-auto px-6 py-5 max-md:py-4">
        <div className="flex items-center gap-x-5 gap-y-3 flex-wrap max-md:gap-x-3">
          {/* Lead — dignified, not shouty. */}
          <div className="flex items-center gap-2 shrink-0">
            <Heart
              className="h-5 w-5 text-tangerine-deeper stroke-[1.75]"
              aria-hidden="true"
            />
            <span className="font-display text-[18px] text-ink leading-tight max-md:text-[16px]">
              Give a one-time gift
            </span>
          </div>

          {/* Controls — one functional row: cause · amount · donate. */}
          <div className="flex items-center gap-3 flex-wrap max-md:w-full max-md:gap-2">
            {/* Cause dropdown */}
            <label className="sr-only" htmlFor="donate-strip-cause">
              Choose a cause
            </label>
            <select
              id="donate-strip-cause"
              value={causeId}
              onChange={(e) => setCauseId(e.target.value)}
              disabled={pending}
              className="h-11 rounded-full border border-ink/[0.12] bg-white px-4 pr-8 text-[15px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft disabled:opacity-60 max-md:flex-1 max-md:min-w-0"
            >
              {causes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_en}
                </option>
              ))}
            </select>

            {/* Amount input */}
            <label className="sr-only" htmlFor="donate-strip-amount">
              Amount in {currencyCode}
            </label>
            <div className="inline-flex items-center h-11 rounded-full border border-ink/[0.12] bg-white px-4 focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
              <span className="font-display text-[16px] text-ink mr-1">
                {currencySymbol}
              </span>
              <input
                id="donate-strip-amount"
                type="number"
                inputMode="numeric"
                min={customFloor}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                placeholder={String(customFloor)}
                className="w-24 bg-transparent text-[16px] text-ink focus:outline-none max-md:w-full"
              />
            </div>

            {/* Donate → Stripe hand-off (explicit click). */}
            <button
              type="button"
              onClick={donate}
              disabled={pending}
              className="inline-flex items-center gap-2 h-11 shrink-0 font-body font-semibold rounded-full bg-tangerine text-ink px-6 text-[15px] transition-all hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-60 max-md:flex-1 max-md:justify-center"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pending ? "Taking you to checkout…" : "Donate"}
            </button>
          </div>

          {/* Reassurance — sits on the same band, wraps below on narrow. */}
          <p className="text-[12.5px] text-ink-soft/80 leading-[1.5] max-md:w-full">
            No account needed · secure checkout with Stripe.
          </p>
        </div>

        {error ? (
          <p className="mt-2 text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export default DonateStrip;
