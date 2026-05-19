// Session 58.2 — client picker + Stripe Elements for /sponsor/[childId].
//
// Mirrors DonateClient but specialized for monthly sponsorships:
//   - Package cards show per-month rate prominently (open-ended) OR
//     upfront total with "N months upfront" tag (prepaid bundle).
//     NO discount or savings copy — prepaid is convenience +
//     commitment, not a price break.
//   - Custom amount input uses smallest-active-monthly-package as
//     the floor (per brief — "monthly minimum is the base education
//     package amount, admin-controlled").
//   - Posts to /api/donate/init with childId + packageId.
//   - On success: navigate to /donate/success?id=…

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DonationMode } from "@/lib/donation-packages";

export interface ClientMonthlyPackage {
  id: string;
  mode: DonationMode;
  duration_months: number | null;
  name_en: string;
  description_en: string;
  icon: string | null;
  perMonthBdt: number;
  perMonthDonorAmount: number;
  totalBdt: number;
  totalDonorAmount: number;
}

interface Props {
  childId: string;
  childName: string;
  packages: ReadonlyArray<ClientMonthlyPackage>;
  donor_currency: { code: string; symbol: string };
  customAmountFloor: number;
  customAmountBdtFloor: number;
  bdt_per_donor_unit: number;
}

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(key: string): Promise<StripeJs | null> {
  if (!stripePromiseCache.has(key)) stripePromiseCache.set(key, loadStripe(key));
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

type Selection =
  | { kind: "preset"; pkg: ClientMonthlyPackage }
  | { kind: "custom"; donorAmount: number; bdtAmount: number };

export function SponsorChildClient({
  childId,
  childName,
  packages,
  donor_currency,
  customAmountFloor,
  customAmountBdtFloor,
  bdt_per_donor_unit,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [customInput, setCustomInput] = useState<string>("");
  const [stage, setStage] = useState<"pick" | "pay">("pick");
  const [initData, setInitData] = useState<{
    clientSecret: string;
    sponsorshipId: string;
    publishableKey: string;
  } | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initing, setIniting] = useState(false);

  function pickPreset(pkg: ClientMonthlyPackage) {
    setSelection({ kind: "preset", pkg });
    setCustomInput("");
  }

  function handleCustomChange(v: string) {
    setCustomInput(v);
    const n = Number.parseInt(v.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n) || n < customAmountFloor) {
      setSelection(null);
      return;
    }
    const bdt = Math.round(n * bdt_per_donor_unit);
    setSelection({ kind: "custom", donorAmount: n, bdtAmount: bdt });
  }

  async function handleContinue() {
    if (!selection) return;
    setInitError(null);
    setIniting(true);
    try {
      const body =
        selection.kind === "preset"
          ? {
              packageId: selection.pkg.id,
              currencyCode: donor_currency.code,
              childId,
            }
          : {
              customAmountBdt: Math.max(
                customAmountBdtFloor,
                selection.bdtAmount,
              ),
              customPackageType: "monthly" as const,
              currencyCode: donor_currency.code,
              childId,
            };

      const res = await fetch("/api/donate/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setInitError(json.error ?? "Could not start checkout");
        setIniting(false);
        return;
      }
      setInitData({
        clientSecret: json.clientSecret,
        sponsorshipId: json.sponsorshipId,
        publishableKey: json.stripePublishableKey,
      });
      setStage("pay");
    } catch (err) {
      setInitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIniting(false);
    }
  }

  const selectedSummary = (() => {
    if (!selection) return null;
    if (selection.kind === "preset") {
      const p = selection.pkg;
      const isPrepaid = p.mode === "prepaid-bundle";
      return {
        line1: p.name_en,
        line2: isPrepaid
          ? `${donor_currency.symbol}${p.totalDonorAmount.toLocaleString()} ${donor_currency.code} — single charge today (${p.duration_months} months upfront)`
          : `${donor_currency.symbol}${p.perMonthDonorAmount.toLocaleString()} ${donor_currency.code} per month`,
        bdtLine: isPrepaid
          ? `≈ ${p.totalBdt.toLocaleString()} BDT total`
          : `≈ ${p.perMonthBdt.toLocaleString()} BDT per month`,
      };
    }
    return {
      line1: `Custom monthly amount for ${childName}`,
      line2: `${donor_currency.symbol}${selection.donorAmount.toLocaleString()} ${donor_currency.code} per month`,
      bdtLine: `≈ ${selection.bdtAmount.toLocaleString()} BDT per month`,
    };
  })();

  if (stage === "pay" && initData) {
    const promise = getStripePromise(initData.publishableKey);
    return (
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm ring-1 ring-stone-200">
        <h2 className="font-serif text-2xl text-ink mb-1">Payment</h2>
        {selectedSummary ? (
          <p className="text-[14px] text-slate mb-5">
            {selectedSummary.line1} —{" "}
            <span className="font-medium text-ink">{selectedSummary.line2}</span>{" "}
            <span className="text-ink-soft">({selectedSummary.bdtLine})</span>
          </p>
        ) : null}
        <Elements stripe={promise}>
          <PayInline
            clientSecret={initData.clientSecret}
            sponsorshipId={initData.sponsorshipId}
            onBack={() => {
              setStage("pick");
              setInitData(null);
            }}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-1">
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          Choose your sponsorship
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {packages.map((p) => {
          const isSel =
            selection?.kind === "preset" && selection.pkg.id === p.id;
          const Icon = resolveIcon(p.icon);
          const isPrepaid = p.mode === "prepaid-bundle";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickPreset(p)}
              className={`text-left rounded-2xl bg-white p-5 shadow-sm ring-1 transition-all hover:shadow-md ${
                isSel
                  ? "ring-2 ring-orange-solid"
                  : "ring-stone-200 hover:ring-tangerine"
              }`}
            >
              <div className="flex items-start gap-3">
                {Icon ? (
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isSel ? "bg-orange-solid text-white" : "bg-tangerine-mist text-tangerine-deep"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[17px] text-ink leading-snug">
                    {p.name_en}
                  </p>
                  <p className="mt-1 text-[13.5px] text-slate leading-relaxed">
                    {p.description_en}
                  </p>
                  {isPrepaid ? (
                    <>
                      <p className="mt-3 font-serif text-[20px] text-ink">
                        {donor_currency.symbol}
                        {p.totalDonorAmount.toLocaleString()}
                        <span className="ml-1.5 text-[12px] font-sans text-ink-soft">
                          one-time charge
                        </span>
                      </p>
                      <p className="text-[12px] text-ink-soft">
                        {p.duration_months} months upfront · no recurring card
                      </p>
                      <p className="text-[11.5px] text-ink-soft mt-0.5">
                        ≈ {p.totalBdt.toLocaleString()} BDT total
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 font-serif text-[20px] text-ink">
                        {donor_currency.symbol}
                        {p.perMonthDonorAmount.toLocaleString()}
                        <span className="ml-1.5 text-[13px] font-sans text-ink-soft">
                          / month
                        </span>
                      </p>
                      <p className="text-[11.5px] text-ink-soft mt-0.5">
                        ≈ {p.perMonthBdt.toLocaleString()} BDT per month
                      </p>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom amount card */}
      <div
        className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition-all ${
          selection?.kind === "custom" ? "ring-2 ring-orange-solid" : "ring-stone-200"
        }`}
      >
        <p className="font-serif text-[17px] text-ink mb-1">
          Or set a custom monthly amount
        </p>
        <p className="text-[13.5px] text-slate mb-3">
          Minimum {donor_currency.symbol}
          {customAmountFloor.toLocaleString()} {donor_currency.code} / month.
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-stone-50 px-3 py-2 text-[15px] text-slate ring-1 ring-stone-200">
            {donor_currency.symbol}
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={customInput}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder={String(customAmountFloor)}
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] text-ink placeholder:text-ink-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
          />
          <span className="text-[13px] text-ink-soft">
            {donor_currency.code} / mo
          </span>
        </div>
      </div>

      {selection && selectedSummary ? (
        <div className="rounded-3xl bg-tangerine-mist/60 p-5 md:p-6 ring-1 ring-tangerine-soft/60">
          <p className="text-[13.5px] text-ink-soft mb-1">Review</p>
          <p className="font-serif text-lg text-ink leading-tight mb-1">
            {selectedSummary.line1}
          </p>
          <p className="text-[14.5px] text-ink">
            {selectedSummary.line2}
            <span className="ml-1.5 text-[13px] text-ink-soft">
              ({selectedSummary.bdtLine})
            </span>
          </p>
          {initError ? (
            <p className="mt-2 text-[13px] text-rose-700">{initError}</p>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={initing}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid px-6 py-3 text-[15px] font-semibold text-white shadow-sm hover:bg-tangerine-deep disabled:opacity-60"
          >
            {initing ? "Preparing payment…" : "Continue to payment"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PayInline({
  clientSecret,
  sponsorshipId,
  onBack,
}: {
  clientSecret: string;
  sponsorshipId: string;
  onBack: () => void;
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
      const isSetup = clientSecret.startsWith("seti_");
      const result = isSetup
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
      {error ? <p className="mt-2 text-[13px] text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePay}
          disabled={!stripe || !cardComplete || pending}
          className="inline-flex items-center justify-center rounded-full bg-orange-solid px-6 py-3 text-[15px] font-semibold text-white shadow-sm hover:bg-tangerine-deep disabled:opacity-60"
        >
          {pending ? "Processing…" : "Pay now"}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-[13.5px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
        >
          ← Change amount
        </button>
      </div>
    </div>
  );
}

function resolveIcon(name: string | null): LucideIcon | null {
  if (!name) return null;
  const lib = Icons as unknown as Record<string, LucideIcon>;
  const found = lib[name];
  return found ?? null;
}
