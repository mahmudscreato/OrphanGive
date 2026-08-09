// feat/quick-donation — guest (no-account) cause picker.
//
// Minimal 2-step flow: pick a cause → choose how many children (or a
// custom amount) → Donate. Posts to /api/donate/guest-init, which
// recomputes the amount SERVER-SIDE and returns a hosted Stripe Checkout
// URL. Stripe collects the card + email; no account is created here.
//
// fix/donate-checkout-and-copy — the cause list is now the SAME curated
// taxonomy the bottom strip + homepage section use (loadDonateModuleData →
// DonateCause), so both surfaces show the same causes (incl. Zakat). Each
// cause carries a server-resolved representative packageId (what guest-init
// charges) + the donor's picked cause enum (drives the Stripe line-item
// label). Amounts are BDT (taka) — the guest flow is BDT-only.

"use client";

import { useRef, useState } from "react";
import { Heart, Loader2, Minus, Plus } from "lucide-react";
import type { DonateCause } from "@/lib/donate-module";

const MAX_CHILDREN = 100;

export function QuickDonateClient({
  causes,
  currencySymbol,
  currencyCode,
  customFloor,
}: {
  causes: DonateCause[];
  currencySymbol: string;
  currencyCode: string;
  /** Display-currency minimum for the custom amount (server enforces BDT floor). */
  customFloor: number;
}) {
  const [causeEnum, setCauseEnum] = useState<string | null>(
    causes[0]?.enum ?? null,
  );
  const [count, setCount] = useState(1);
  const [useCustom, setUseCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // feat/sslcommerz-phase1-guest — gateway choice. Default to SSLCommerz for
  // BDT (geo-resolved Bangladesh) donors, Stripe otherwise; always overridable.
  const [gateway, setGateway] = useState<"sslcommerz" | "stripe">(
    currencyCode === "BDT" ? "sslcommerz" : "stripe",
  );
  // Email is required only for the SSLCommerz path (it needs cus_email + it's
  // the receipt address). Stripe collects the email on its hosted Checkout.
  const [email, setEmail] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const cause = causes.find((c) => c.enum === causeEnum) ?? null;
  const presetTotal = cause ? cause.unitAmountBdt * count : 0;

  async function donate() {
    setError(null);
    if (!cause) {
      setError("Please choose a cause.");
      return;
    }

    // Amount is computed the same way for both gateways; the server re-validates
    // authoritatively (never trusts these). One of customAmount | childCount.
    let amountPart: Record<string, unknown>;
    if (useCustom) {
      const n = Number(customAmount);
      if (!Number.isFinite(n) || n < customFloor) {
        setError(`Please enter at least ${currencySymbol}${customFloor}.`);
        return;
      }
      amountPart = { customAmount: Math.round(n) };
    } else {
      amountPart = { childCount: count };
    }

    // ── SSLCommerz (bKash/Nagad/local card, BDT) ──────────────────────
    if (gateway === "sslcommerz") {
      const em = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        // SSLCommerz REQUIRES cus_email at session init (unlike Stripe, which
        // collects it on its own hosted page), so we must have it before the
        // redirect. Make the requirement unmissable — focus + scroll the field
        // and say exactly what's needed — instead of a silent no-op.
        setError(
          "Add your email for the receipt, then tap “Pay with bKash · Nagad · card”.",
        );
        emailRef.current?.focus();
        emailRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      setPending(true);
      try {
        const res = await fetch("/api/donate/sslcommerz/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: cause.packageId,
            cause: cause.enum,
            cusEmail: em,
            ...amountPart,
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
        // Hand off to the SSLCommerz hosted payment page.
        window.location.href = data.url;
      } catch {
        setError("Network error. Please try again.");
        setPending(false);
      }
      return;
    }

    // ── Stripe hosted Checkout (international card) — UNCHANGED path ───
    const payload: Record<string, unknown> = {
      packageId: cause.packageId,
      currencyCode,
      // Fix 1 — the curated cause drives the Stripe line-item label
      // (server-validated; the charge is still keyed by packageId).
      cause: cause.enum,
      ...amountPart,
    };
    setPending(true);
    try {
      const res = await fetch("/api/donate/guest-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start the donation. Please try again.");
        setPending(false);
        return;
      }
      // Hand off to Stripe's hosted Checkout.
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  if (causes.length === 0) {
    return (
      <p className="rounded-2xl border border-ink/[0.08] bg-white p-6 text-[15px] text-slate italic">
        No causes are open for giving right now. Please check back soon.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Step 1: cause ─────────────────────────────────────────── */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-3">
          1 · Choose a cause
        </h2>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {causes.map((c) => {
            const selected = c.enum === causeEnum;
            return (
              <button
                key={c.enum}
                type="button"
                onClick={() => setCauseEnum(c.enum)}
                disabled={pending}
                className={`text-left rounded-2xl border p-4 transition-all disabled:opacity-60 ${
                  selected
                    ? "border-tangerine bg-tangerine-mist/40 shadow-warm"
                    : "border-ink/[0.08] bg-white hover:border-tangerine-soft"
                }`}
              >
                <p className="font-display text-[17px] text-ink leading-snug">
                  {c.label}
                </p>
                <p className="mt-1 text-[13px] text-slate leading-[1.5] line-clamp-2">
                  {c.description}
                </p>
                <p className="mt-2 text-[13px] text-tangerine-deeper font-medium">
                  {currencySymbol}
                  {c.unitAmountBdt} per child
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Step 2: how much ──────────────────────────────────────── */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-3">
          2 · How much
        </h2>

        {!useCustom ? (
          <div className="rounded-2xl border border-ink/[0.08] bg-white p-5">
            <p className="text-[14px] text-slate mb-3">
              How many children would you like to support?
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="inline-flex items-center gap-3 rounded-full border border-ink/[0.12] px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setCount((n) => Math.max(1, n - 1))}
                  disabled={pending || count <= 1}
                  aria-label="Fewer children"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-tangerine-mist disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-[2.5rem] text-center font-display text-[22px] text-ink tabular-nums">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => setCount((n) => Math.min(MAX_CHILDREN, n + 1))}
                  disabled={pending || count >= MAX_CHILDREN}
                  aria-label="More children"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-tangerine-mist disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="font-display text-[26px] text-ink tabular-nums">
                {currencySymbol}
                {presetTotal}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              disabled={pending}
              className="mt-4 text-[13px] text-tangerine-deeper underline-offset-4 hover:underline"
            >
              Or enter your own amount →
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/[0.08] bg-white p-5">
            <label
              htmlFor="quick-custom"
              className="block text-[14px] text-slate mb-2"
            >
              Enter an amount ({currencyCode})
            </label>
            <div className="flex items-center gap-2">
              <span className="font-display text-[20px] text-ink">
                {currencySymbol}
              </span>
              <input
                id="quick-custom"
                type="number"
                inputMode="numeric"
                min={customFloor}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                disabled={pending}
                placeholder={String(customFloor)}
                className="w-40 rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[16px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
              />
            </div>
            <button
              type="button"
              onClick={() => setUseCustom(false)}
              disabled={pending}
              className="mt-4 text-[13px] text-tangerine-deeper underline-offset-4 hover:underline"
            >
              ← Back to per-child amounts
            </button>
          </div>
        )}
      </section>

      {/* ── Step 3: how to pay (gateway choice) ─────────────────────── */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-3">
          3 · How to pay
        </h2>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <button
            type="button"
            onClick={() => setGateway("sslcommerz")}
            disabled={pending}
            aria-pressed={gateway === "sslcommerz"}
            className={`text-left rounded-2xl border p-4 transition-all ${
              gateway === "sslcommerz"
                ? "border-tangerine bg-white shadow-warm"
                : "border-ink/[0.08] bg-white hover:border-ink/20"
            }`}
          >
            <div className="font-display text-[16px] text-ink leading-tight">
              bKash · Nagad · Card
            </div>
            <div className="mt-0.5 text-[12px] text-slate">
              Pay in BDT (Bangladesh)
            </div>
          </button>
          <button
            type="button"
            onClick={() => setGateway("stripe")}
            disabled={pending}
            aria-pressed={gateway === "stripe"}
            className={`text-left rounded-2xl border p-4 transition-all ${
              gateway === "stripe"
                ? "border-tangerine bg-white shadow-warm"
                : "border-ink/[0.08] bg-white hover:border-ink/20"
            }`}
          >
            <div className="font-display text-[16px] text-ink leading-tight">
              International card
            </div>
            <div className="mt-0.5 text-[12px] text-slate">
              Visa · Mastercard · Amex
            </div>
          </button>
        </div>
        {gateway === "sslcommerz" ? (
          <div className="mt-3">
            <label
              htmlFor="ssl-email"
              className="block text-[13px] text-slate mb-1.5"
            >
              Email for your receipt{" "}
              <span className="text-tangerine-deeper">(required)</span>
            </label>
            <input
              ref={emailRef}
              id="ssl-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="you@example.com"
              className="w-full max-w-[360px] rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[15px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
            />
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="text-[13.5px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={donate}
          disabled={pending}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-7 py-3.5 text-[15px] transition-all hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Heart className="h-4 w-4" aria-hidden="true" />
          )}
          {pending
            ? "Taking you to checkout…"
            : gateway === "sslcommerz"
              ? "Pay with bKash · Nagad · card"
              : "Donate"}
        </button>
        <p className="mt-3 text-[12.5px] text-slate-soft leading-[1.6] max-w-[440px]">
          No account needed.{" "}
          {gateway === "sslcommerz"
            ? "You’ll pay securely on SSLCommerz (bKash, Nagad, or card) in BDT, and your receipt goes to the email above."
            : "You’ll pay securely on Stripe, and your receipt goes to the email you enter there."}
        </p>
      </div>
    </div>
  );
}

export default QuickDonateClient;
