// Session 58.6 — resume-payment client.
//
// Calls POST /api/donate/resume with the sponsorshipId to fetch the
// existing PI/sub client_secret, mounts Stripe Elements with it, and
// confirms via stripe.confirmCardPayment / confirmCardSetup based on
// the intent kind. On success → /donate/success?id=… (same path the
// fresh flow uses).
//
// Three states:
//   loading    — initial fetch
//   ready      — Elements mounted, donor confirms
//   already    — Stripe object already succeeded; show a "you're
//                already active" panel + Continue to dashboard
//   error      — endpoint returned a recoverable / unrecoverable
//                error message; render with action hints

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { CheckCircle2 } from "lucide-react";

interface Props {
  sponsorshipId: string;
}

interface InitData {
  clientSecret: string;
  publishableKey: string;
  intentType: "payment" | "setup";
}

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
    invalid: { color: "#A02B2B", iconColor: "#A02B2B" },
  },
  hidePostalCode: false,
};

export function ResumeClient({ sponsorshipId }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: InitData }
    | { kind: "already"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  // Single fetch on mount. StrictMode in dev calls effects twice;
  // the fetched-flag prevents a duplicate POST (the endpoint is
  // idempotent anyway, but no point making the call twice).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/donate/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sponsorshipId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setState({
            kind: "error",
            message: json.message || json.error || "Could not resume payment.",
          });
          return;
        }
        if (json.alreadyPaid) {
          setState({
            kind: "already",
            message:
              json.message ||
              "This payment already completed — your sponsorship is now active.",
          });
          return;
        }
        if (!json.clientSecret || !json.stripePublishableKey) {
          setState({
            kind: "error",
            message: "Resume returned an incomplete payload.",
          });
          return;
        }
        setState({
          kind: "ready",
          data: {
            clientSecret: json.clientSecret,
            publishableKey: json.stripePublishableKey,
            intentType:
              json.intentType === "setup" ? "setup" : "payment",
          },
        });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error.",
        });
      }
    })();
  }, [sponsorshipId]);

  if (state.kind === "loading") {
    return (
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm ring-1 ring-stone-200">
        <p className="text-[14px] text-slate">Loading your payment…</p>
      </div>
    );
  }

  if (state.kind === "already") {
    return (
      <div className="rounded-3xl bg-moss-soft/40 p-6 md:p-7 ring-1 ring-moss-soft">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-moss-soft">
          <CheckCircle2 className="h-5 w-5 text-moss-deep" />
        </div>
        <p className="font-serif text-xl text-moss-deep mb-2">
          Already complete
        </p>
        <p className="text-[14.5px] text-ink-soft mb-4">{state.message}</p>
        <Link
          href={`/donate/success?id=${sponsorshipId}`}
          className="inline-flex items-center rounded-full bg-moss-deep px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
        >
          View your sponsorship
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-3xl bg-white p-6 md:p-7 shadow-sm ring-1 ring-stone-200">
        <p className="font-serif text-xl text-ink mb-2">
          We couldn&apos;t resume this payment
        </p>
        <p className="text-[14px] text-slate leading-relaxed mb-4">
          {state.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/sponsorships"
            className="inline-flex items-center rounded-full bg-orange-solid px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-tangerine-deep"
          >
            Back to your sponsorships
          </Link>
        </div>
      </div>
    );
  }

  const promise = getStripePromise(state.data.publishableKey);
  return (
    <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-serif text-xl text-ink mb-3">Payment</h2>
      <Elements stripe={promise}>
        <ConfirmInline
          clientSecret={state.data.clientSecret}
          intentType={state.data.intentType}
          sponsorshipId={sponsorshipId}
        />
      </Elements>
    </div>
  );
}

function ConfirmInline({
  clientSecret,
  intentType,
  sponsorshipId,
}: {
  clientSecret: string;
  intentType: "payment" | "setup";
  sponsorshipId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const cancelled = useRef(false);

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
      const pmRes = await stripe.createPaymentMethod({ type: "card", card });
      if (pmRes.error || !pmRes.paymentMethod) {
        setError(pmRes.error?.message ?? "Could not read card details.");
        setPending(false);
        return;
      }
      // Use the intentType the endpoint signalled. Defensive: if the
      // clientSecret prefix disagrees (seti_… vs pi_…), prefer the
      // prefix — Stripe's confirm method must match the secret kind.
      const looksLikeSetup = clientSecret.startsWith("seti_");
      const useSetup = intentType === "setup" || looksLikeSetup;
      const result = useSetup
        ? await stripe.confirmCardSetup(clientSecret, {
            payment_method: pmRes.paymentMethod.id,
          })
        : await stripe.confirmCardPayment(clientSecret, {
            payment_method: pmRes.paymentMethod.id,
          });
      if (result.error) {
        setError(result.error.message ?? "Payment could not be completed.");
        setPending(false);
        return;
      }
      if (cancelled.current) return;
      const url = `/donate/success?id=${sponsorshipId}`;
      router.push(url);
      setTimeout(() => {
        if (!window.location.pathname.startsWith("/donate/success")) {
          window.location.assign(url);
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setPending(false);
    }
  }

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
        <p
          role="alert"
          className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-3 py-2 text-[13px] text-[#A02B2B]"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5">
        <button
          type="button"
          onClick={handlePay}
          disabled={!stripe || !cardComplete || pending}
          className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-3 text-[14px] shadow-warm transition-all duration-150 hover:-translate-y-[1px] hover:bg-tangerine-deep hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin"
              />
              Processing…
            </>
          ) : (
            "Confirm payment"
          )}
        </button>
      </div>
    </div>
  );
}
