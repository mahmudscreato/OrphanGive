"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StripePaymentSection } from "./StripePaymentSection";

type InitOk = {
  clientSecrets: string[];
  sponsorshipIds: string[];
  stripePublishableKey: string;
  monthlyTotal: number;
  oneTimeTotal: number;
  reused?: boolean;
};

type Props = {
  totalUsd: number;
};

// Calls /api/checkout/init on mount (NOT during SSR — this avoids creating
// new Stripe Subscriptions / PaymentIntents on every page render). Renders
// a small loading state, then hands off to <StripePaymentSection> once
// clientSecrets arrive. Errors get a retry button.
export function CheckoutInitializer({ totalUsd }: Props) {
  const [data, setData] = useState<InitOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // StrictMode mounts components twice in dev. Guard against double-fire so
  // we don't make two POSTs in quick succession.
  const inflight = useRef(false);

  const init = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<InitOk> & {
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not initialize checkout.");
        setData(null);
        return;
      }
      if (
        !Array.isArray(json.clientSecrets) ||
        !Array.isArray(json.sponsorshipIds) ||
        !json.stripePublishableKey
      ) {
        setError("Checkout init returned an unexpected response.");
        setData(null);
        return;
      }
      setData({
        clientSecrets: json.clientSecrets,
        sponsorshipIds: json.sponsorshipIds,
        stripePublishableKey: json.stripePublishableKey,
        monthlyTotal: json.monthlyTotal ?? 0,
        oneTimeTotal: json.oneTimeTotal ?? 0,
        reused: json.reused,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setData(null);
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  if (loading && !data) {
    return (
      <div className="rounded-[18px] border border-ink/[0.08] bg-white px-5 py-6 flex items-center gap-3">
        <span
          className="inline-block w-4 h-4 rounded-full border-2 border-tangerine/30 border-t-tangerine animate-spin"
          aria-hidden="true"
        />
        <div className="text-[13.5px] text-slate">
          Preparing secure checkout…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[18px] bg-[#FEEFEF] border border-[#F4C7C7] px-5 py-4">
        <div className="font-display text-[17px] text-[#A02B2B] font-medium">
          Couldn&apos;t start checkout.
        </div>
        <p className="mt-1.5 text-[13.5px] text-[#A02B2B]/80 leading-[1.6]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void init()}
          className="inline-flex mt-3 items-center gap-2 font-body font-semibold rounded-full bg-[#A02B2B] text-white px-5 py-2 text-[13px] hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <StripePaymentSection
      publishableKey={data.stripePublishableKey}
      clientSecrets={data.clientSecrets}
      sponsorshipIds={data.sponsorshipIds}
      totalUsd={totalUsd}
    />
  );
}

export default CheckoutInitializer;
