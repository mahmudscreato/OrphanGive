"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { formatUsd } from "@/lib/pricing";

type Props = {
  publishableKey: string;
  clientSecrets: string[];
  sponsorshipIds: string[];
  totalUsd: number;
};

// Cached Stripe.js promise — loaded once per session.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(key: string): Promise<StripeJs | null> {
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key)!;
}

const CARD_OPTIONS = {
  style: {
    base: {
      fontSize: "15px",
      color: "#2A2A2C",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      "::placeholder": { color: "#8B8B8E" },
    },
    invalid: {
      color: "#A02B2B",
      iconColor: "#A02B2B",
    },
  },
  hidePostalCode: false,
};

function PayForm({ clientSecrets, sponsorshipIds, totalUsd }: Omit<Props, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  async function handlePay() {
    if (!stripe || !elements) return;
    setError(null);
    setPending(true);

    const card = elements.getElement(CardElement);
    if (!card) {
      setError("Card form not ready. Please refresh.");
      setPending(false);
      return;
    }

    try {
      // Step 1: create ONE PaymentMethod from the CardElement. Reusing
      // the CardElement across multiple confirmCardPayment() calls is
      // unreliable — Stripe consumes the element on first confirm and
      // subsequent confirms can hang or silently fail.
      const pmRes = await stripe.createPaymentMethod({
        type: "card",
        card,
      });
      if (pmRes.error || !pmRes.paymentMethod) {
        setError(pmRes.error?.message ?? "Could not read card details.");
        setPending(false);
        return;
      }
      const paymentMethodId = pmRes.paymentMethod.id;

      // Step 2: confirm each clientSecret with the same payment_method id.
      // No `card:` field — that's only used at PaymentMethod creation.
      //
      // Two intent types appear in this list (Session 14.7):
      //   - PaymentIntent  (`pi_…_secret_…`) — normal active checkout
      //     and prepaid queue joins. Use stripe.confirmCardPayment.
      //   - SetupIntent    (`seti_…_secret_…`) — recurring queue joins
      //     where the sub is created with trial_end and Stripe wants
      //     to capture the card today for off-session charge later.
      //     Use stripe.confirmCardSetup.
      // The terminal-status set is largely the same for both intent
      // kinds; we just read .paymentIntent or .setupIntent based on
      // which call we made.
      for (let i = 0; i < clientSecrets.length; i++) {
        const cs = clientSecrets[i]!;
        const isSetup = cs.startsWith("seti_");
        const result = isSetup
          ? await stripe.confirmCardSetup(cs, {
              payment_method: paymentMethodId,
            })
          : await stripe.confirmCardPayment(cs, {
              payment_method: paymentMethodId,
            });
        if (result.error) {
          console.warn(`[checkout] confirm ${i + 1} failed:`, result.error);
          setError(result.error.message ?? "Payment could not be completed.");
          setPending(false);
          return;
        }
        const finalStatus = isSetup
          ? (
              result as {
                setupIntent?: { status?: string };
              }
            ).setupIntent?.status
          : (
              result as {
                paymentIntent?: { status?: string };
              }
            ).paymentIntent?.status;
        if (
          finalStatus === "succeeded" ||
          finalStatus === "processing" ||
          finalStatus === "requires_capture"
        ) {
          // Captured or in-flight — continue. SetupIntent can also
          // sit in 'succeeded' once the card is saved; the future
          // trial_end charge then runs off-session.
        } else if (
          finalStatus === "requires_action" ||
          finalStatus === "requires_confirmation"
        ) {
          console.warn(
            `[checkout] confirm ${i + 1} returned ${finalStatus} — Stripe.js should have driven 3DS but didn't`,
          );
          setError("Additional verification required. Please try again.");
          setPending(false);
          return;
        } else {
          console.warn(
            `[checkout] confirm ${i + 1} returned unexpected status:`,
            finalStatus,
          );
          setError(
            `Payment status: ${finalStatus ?? "unknown"}. Please try again or contact support.`,
          );
          setPending(false);
          return;
        }
      }
      // ── Post-confirm: navigate ──────────────────────────────────────
      // We deliberately do NOT consult the `cancelled` ref here.
      // In React 18+ StrictMode (Next.js dev default), every effect
      // setup is preceded by an artificial cleanup that flips the ref
      // permanently — which used to silently kill the redirect. The
      // ref is still useful for guarding setState in async error
      // paths, but a successful navigation must fire unconditionally.
      const successUrl = `/checkout/success?ids=${sponsorshipIds.join(",")}`;
      try {
        router.push(successUrl);
        // Safety net: if the URL hasn't changed in 500ms, fall back to a
        // hard nav. router.push can no-op silently if the App Router
        // tries to reuse a cached layout that errors during render.
        setTimeout(() => {
          if (window.location.pathname === "/checkout") {
            console.warn(
              "[checkout] router.push did not navigate, forcing window.location.assign",
            );
            window.location.assign(successUrl);
          }
        }, 500);
      } catch (err) {
        console.error("[checkout] router.push threw:", err);
        window.location.assign(successUrl);
      }
    } catch (err) {
      console.error("[checkout] handlePay threw:", err);
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setPending(false);
    }
  }

  const canPay = stripe !== null && cardComplete && !pending;

  return (
    <div>
      <div className="rounded-xl border-[1.5px] border-ink/[0.12] bg-white px-4 py-3.5 transition-all focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
        <CardElement
          options={CARD_OPTIONS}
          onChange={(e) => {
            setCardComplete(e.complete);
            if (e.error) setError(e.error.message);
            else if (error && e.complete) setError(null);
          }}
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[13.5px] text-[#A02B2B]"
        >
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={handlePay}
        disabled={!canPay}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Processing…
          </>
        ) : (
          <>Pay {formatUsd(totalUsd)}</>
        )}
      </button>
      <p className="mt-3 text-[11.5px] text-slate-soft leading-snug">
        By paying, you agree to OrphanGive&apos;s Terms. Monthly sponsorships
        will charge automatically each month until you cancel from your
        dashboard.
      </p>
    </div>
  );
}

export function StripePaymentSection({
  publishableKey,
  clientSecrets,
  sponsorshipIds,
  totalUsd,
}: Props) {
  const stripePromise = useMemo(
    () => getStripePromise(publishableKey),
    [publishableKey],
  );

  if (clientSecrets.length === 0) {
    return (
      <div className="rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[13.5px] text-[#A02B2B]">
        Cart was empty when checkout started. Please add at least one item.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PayForm
        clientSecrets={clientSecrets}
        sponsorshipIds={sponsorshipIds}
        totalUsd={totalUsd}
      />
    </Elements>
  );
}

export default StripePaymentSection;
