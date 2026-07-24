// feat/quick-donation — guest (no-account) cause picker.
//
// Minimal 2-step flow: pick a cause → choose how many children (or a
// custom amount) → Donate. Posts to /api/donate/guest-init, which
// recomputes the amount SERVER-SIDE and returns a hosted Stripe Checkout
// URL. Stripe collects the card + email; no account is created here.
//
// The numbers rendered are display-only (server-converted on first
// paint); the charged amount always comes from the server.

"use client";

import { useState } from "react";
import { Heart, Loader2, Minus, Plus } from "lucide-react";

export interface QuickCause {
  id: string;
  name_en: string;
  description_en: string;
  cause_tag: string | null;
  /** Unit price per child, in the donor's display currency. */
  unit_donor_amount: number;
}

const MAX_CHILDREN = 100;

export function QuickDonateClient({
  causes,
  currencySymbol,
  currencyCode,
  customFloor,
}: {
  causes: QuickCause[];
  currencySymbol: string;
  currencyCode: string;
  /** Display-currency minimum for the custom amount (server enforces BDT floor). */
  customFloor: number;
}) {
  const [causeId, setCauseId] = useState<string | null>(causes[0]?.id ?? null);
  const [count, setCount] = useState(1);
  const [useCustom, setUseCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cause = causes.find((c) => c.id === causeId) ?? null;
  const presetTotal = cause ? cause.unit_donor_amount * count : 0;

  async function donate() {
    setError(null);
    if (!cause) {
      setError("Please choose a cause.");
      return;
    }
    let payload: Record<string, unknown> = {
      packageId: cause.id,
      currencyCode,
    };
    if (useCustom) {
      const n = Number(customAmount);
      if (!Number.isFinite(n) || n < customFloor) {
        setError(`Please enter at least ${currencySymbol}${customFloor}.`);
        return;
      }
      payload = { ...payload, customAmount: Math.round(n) };
    } else {
      payload = { ...payload, childCount: count };
    }

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
            const selected = c.id === causeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCauseId(c.id)}
                disabled={pending}
                className={`text-left rounded-2xl border p-4 transition-all disabled:opacity-60 ${
                  selected
                    ? "border-tangerine bg-tangerine-mist/40 shadow-warm"
                    : "border-ink/[0.08] bg-white hover:border-tangerine-soft"
                }`}
              >
                <p className="font-display text-[17px] text-ink leading-snug">
                  {c.name_en}
                </p>
                <p className="mt-1 text-[13px] text-slate leading-[1.5] line-clamp-2">
                  {c.description_en}
                </p>
                <p className="mt-2 text-[13px] text-tangerine-deeper font-medium">
                  {currencySymbol}
                  {c.unit_donor_amount} per child
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
          {pending ? "Taking you to checkout…" : "Donate"}
        </button>
        <p className="mt-3 text-[12.5px] text-slate-soft leading-[1.6] max-w-[440px]">
          No account needed. You&rsquo;ll pay securely on Stripe, and your
          receipt goes to the email you enter there.
        </p>
      </div>
    </div>
  );
}

export default QuickDonateClient;
