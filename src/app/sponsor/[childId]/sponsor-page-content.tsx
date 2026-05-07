"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import {
  formatUsd,
  isValidAmount,
  MIN_AMOUNTS,
  SPONSORSHIP_TIERS,
  type PaymentMode,
} from "@/lib/pricing";
import type { DonorState } from "@/lib/donor-data";
import { ModeSelector } from "@/components/sponsor/ModeSelector";
import { TierGrid } from "@/components/sponsor/TierGrid";
import { AmountInput } from "@/components/sponsor/AmountInput";

type ChildProps = {
  id: string;
  display_name: string;
  age: number | null;
  district: string | null;
  photo: string | null;
  story: string | null;
  story_truncated: boolean;
};

type Props = {
  child: ChildProps;
  signedIn: boolean;
  donorState: DonorState;
  initialCartItemCount: number;
};

const OTHER_TIER_ID = "other" as const;

function pickFirstSentence(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : s.trim().slice(0, 160);
}

export function SponsorPageContent({
  child,
  signedIn,
  donorState,
  initialCartItemCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [tierId, setTierId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(initialCartItemCount);

  const subhead = pickFirstSentence(child.story);
  const photoSrc = directusAssetUrl(child.photo);

  // Resolve effective amount from selected tier OR custom input.
  const amount = useMemo<number | null>(() => {
    if (!mode) return null;
    if (tierId === OTHER_TIER_ID) {
      if (typeof customAmount === "number" && isValidAmount(mode, customAmount)) {
        return customAmount;
      }
      return null;
    }
    if (tierId) {
      const found = SPONSORSHIP_TIERS[mode].find((t) => t.id === tierId);
      return found ? found.amount : null;
    }
    return null;
  }, [mode, tierId, customAmount]);

  const canAdd =
    !pending && mode !== null && amount !== null;

  function selectTier(id: string) {
    setError(null);
    setSuccess(false);
    setTierId(id);
    if (id !== OTHER_TIER_ID) setCustomAmount("");
  }

  async function addToCart() {
    if (!mode || amount === null) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/cart/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            childId: child.id,
            paymentMode: mode,
            amountUsd: amount,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          cart?: { items?: unknown[] };
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Could not add to cart.");
          return;
        }
        setSuccess(true);
        setCartItemCount(Array.isArray(json.cart?.items) ? json.cart.items.length : cartItemCount + 1);
        // Notify the nav cart-icon to refresh
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("og:cart-changed"));
        }
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <section className="px-6 pt-8 pb-24 max-md:pt-6 max-md:pb-16">
      <div className="max-w-[1100px] mx-auto grid grid-cols-[1fr_1.4fr] gap-12 items-start max-lg:grid-cols-1 max-lg:gap-8">
        {/* Left: child summary */}
        <aside>
          <div className="relative aspect-[4/5] rounded-[28px] overflow-hidden shadow-card">
            {photoSrc ? (
              <ProtectedChildImage
                src={photoSrc}
                alt={child.display_name}
                width={600}
                height={750}
                quality={85}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="child-photo-placeholder" aria-hidden="true" />
            )}
          </div>
          <h1 className="mt-6 font-display text-[32px] text-ink leading-tight tracking-[-0.02em]">
            Sponsor {child.display_name.split(" ")[0]}
          </h1>
          <div className="mt-1 font-mono text-[11px] tracking-[0.12em] uppercase text-slate-soft">
            {child.district ? child.district : null}
            {child.district && child.age !== null ? " · " : null}
            {child.age !== null ? `Age ${child.age}` : null}
          </div>
          {subhead ? (
            <p className="mt-5 font-display italic text-[17px] text-slate leading-snug">
              &ldquo;{subhead}&rdquo;
            </p>
          ) : null}
          <Link
            href={`/children/${child.id}`}
            className="mt-5 inline-flex items-center gap-2 text-[13px] text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5"
          >
            ← Back to {child.display_name.split(" ")[0]}&apos;s profile
          </Link>
        </aside>

        {/* Right: choose mode/amount */}
        <div>
          {donorState === "pending_approval" ? (
            <div className="rounded-[18px] bg-[#FEF6EC] border border-tangerine-soft border-l-[4px] border-l-tangerine px-5 py-4 mb-6">
              <div className="font-display text-[17px] text-ink font-medium">
                You can build your cart now.
              </div>
              <p className="mt-1.5 text-[13.5px] text-slate leading-[1.6]">
                You&apos;ll be able to complete checkout once your account is
                approved (usually 1–2 business days).
              </p>
            </div>
          ) : null}
          {!signedIn ? (
            <p className="text-[13.5px] text-slate-soft mb-5">
              You&apos;ll sign in at checkout — no account needed yet.
            </p>
          ) : null}

          <div className="mb-7">
            <h2 className="font-display text-[20px] text-ink mb-3">1. How would you like to give?</h2>
            <ModeSelector value={mode} onChange={(m) => { setMode(m); setTierId(null); setCustomAmount(""); setSuccess(false); }} />
          </div>

          {mode ? (
            <div className="mb-7">
              <h2 className="font-display text-[20px] text-ink mb-3">2. Choose an amount</h2>
              <TierGrid
                mode={mode}
                selectedTierId={tierId === OTHER_TIER_ID ? null : tierId}
                onSelect={selectTier}
              />
              <details
                open={tierId === OTHER_TIER_ID}
                className="mt-4 rounded-[14px] bg-white border border-ink/[0.08] px-4 py-3"
              >
                <summary
                  className="cursor-pointer text-[13px] text-tangerine-deep font-medium select-none"
                  onClick={() => selectTier(OTHER_TIER_ID)}
                >
                  Or choose another amount →
                </summary>
                <div className="mt-3">
                  <AmountInput mode={mode} value={customAmount} onChange={(v) => { setCustomAmount(v); setTierId(OTHER_TIER_ID); setSuccess(false); }} />
                </div>
              </details>
            </div>
          ) : null}

          {mode && amount !== null ? (
            <div className="rounded-[18px] bg-cream border border-tangerine-soft px-5 py-4 mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate-soft">
                  You&apos;ve chosen
                </div>
                <div className="mt-1 font-display text-[24px] text-ink">
                  {formatUsd(amount)}
                  <span className="text-[14px] text-slate-soft">
                    {mode === "monthly" ? "/month" : " one-time"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={addToCart}
                disabled={!canAdd}
                className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-7 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Adding…" : "Add to cart →"}
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B] mb-5">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl bg-moss-soft/60 border border-moss/30 px-5 py-4 flex flex-wrap items-center justify-between gap-3 mb-5">
              <span className="text-[14px] text-ink">
                ✓ Added to your cart.
              </span>
              <div className="flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => router.push("/checkout")}
                  className="text-tangerine-deep font-medium border-b border-tangerine pb-0.5 hover:opacity-80"
                >
                  Continue to checkout →
                </button>
                <Link href="/children" className="text-slate hover:text-ink">
                  Add another child
                </Link>
              </div>
            </div>
          ) : null}

          {cartItemCount > 0 ? (
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 text-[13px] text-slate hover:text-tangerine-deep transition-colors"
            >
              View cart ({cartItemCount} {cartItemCount === 1 ? "item" : "items"}) →
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
