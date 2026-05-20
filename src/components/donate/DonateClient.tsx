// Session 58.2 — client donation flow shell.
//
// State machine:
//   pick   → donor picks a package card OR enters custom amount,
//            sees inline review, clicks "Continue to payment"
//   pay    → Stripe Elements mount with clientSecret from
//            /api/donate/init, donor enters card, confirm
//   done   → router.push to /donate/success?id=...
//
// SSR provides the prebuilt package cards (with donor-currency
// amounts already rendered server-side). We pass the raw data here
// only so the "amount per card" stays consistent if the donor
// switches between presets and custom amount client-side.

"use client";

import { useMemo, useRef, useState } from "react";
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

export interface ClientPackage {
  id: string;
  name_en: string;
  description_en: string;
  amount_bdt: number;
  cause_tag: string | null;
  icon: string | null;
  /** Pre-converted donor-currency amount (whole units, rounded). */
  donor_amount: number;
}

interface Props {
  packages: ReadonlyArray<ClientPackage>;
  donor_currency: { code: string; symbol: string };
  /** Floor in donor currency for the custom amount input. */
  customAmountFloor: number;
  /** BDT floor — passed to the endpoint when donor uses custom amount. */
  customAmountBdtFloor: number;
  /** Pre-converted "≈ X BDT" string for each donor unit, used to render
   * BDT-equivalent under the donor amount. */
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
  | { kind: "preset"; pkg: ClientPackage }
  | { kind: "custom"; donorAmount: number; bdtAmount: number };

export function DonateClient({
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

  const selectedDonorAmount = selection
    ? selection.kind === "preset"
      ? selection.pkg.donor_amount
      : selection.donorAmount
    : 0;
  const selectedBdt = selection
    ? selection.kind === "preset"
      ? selection.pkg.amount_bdt
      : selection.bdtAmount
    : 0;

  function pickPreset(pkg: ClientPackage) {
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
            }
          : {
              customAmountBdt: customAmountBdtFloor > selection.bdtAmount
                ? customAmountBdtFloor
                : selection.bdtAmount,
              customPackageType: "one_time" as const,
              currencyCode: donor_currency.code,
            };

      const res = await fetch("/api/donate/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        // Session 58.3.2 — currency-lock safety net. Page-load
        // lock normally prevents this; reload with the cookie set
        // to the locked currency if we land here anyway.
        if (
          res.status === 409 &&
          json.error === "currency_locked" &&
          typeof json.lockedCurrency === "string"
        ) {
          const locked = json.lockedCurrency as string;
          setInitError(
            `Showing prices in ${locked} — the currency linked to your account. Reloading…`,
          );
          document.cookie = `og_currency=${locked}; path=/; max-age=${30 * 24 * 3600}; samesite=lax`;
          setTimeout(() => window.location.reload(), 1200);
          setIniting(false);
          return;
        }
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

  if (stage === "pay" && initData) {
    const promise = getStripePromise(initData.publishableKey);
    return (
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm ring-1 ring-stone-200">
        <h2 className="font-serif text-2xl text-ink mb-1">Payment</h2>
        <p className="text-[14px] text-slate mb-5">
          You're giving{" "}
          <span className="font-medium text-ink">
            {donor_currency.symbol}
            {selectedDonorAmount.toLocaleString()} {donor_currency.code}
          </span>{" "}
          <span className="text-ink-soft">
            (≈ {selectedBdt.toLocaleString()} BDT)
          </span>
        </p>
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
      <PackageGrid
        packages={packages}
        donor_currency={donor_currency}
        selected={selection?.kind === "preset" ? selection.pkg.id : null}
        onPick={pickPreset}
      />

      <CustomAmountCard
        donor_currency={donor_currency}
        value={customInput}
        onChange={handleCustomChange}
        floor={customAmountFloor}
        active={selection?.kind === "custom"}
      />

      {selection ? (
        <div className="rounded-3xl bg-tangerine-mist/60 p-5 md:p-6 ring-1 ring-tangerine-soft/60">
          <p className="text-[13.5px] text-ink-soft mb-1">
            You're about to give
          </p>
          <p className="font-serif text-2xl text-ink leading-tight mb-1">
            {donor_currency.symbol}
            {selectedDonorAmount.toLocaleString()} {donor_currency.code}
            <span className="ml-2 text-base text-ink-soft font-sans">
              ≈ {selectedBdt.toLocaleString()} BDT
            </span>
          </p>
          {selection.kind === "preset" ? (
            <p className="text-[14px] text-slate">
              {selection.pkg.name_en}
            </p>
          ) : null}
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

// ─── Package grid ──────────────────────────────────────────────────

function PackageGrid({
  packages,
  donor_currency,
  selected,
  onPick,
}: {
  packages: ReadonlyArray<ClientPackage>;
  donor_currency: { code: string; symbol: string };
  selected: string | null;
  onPick: (p: ClientPackage) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
      {packages.map((p) => {
        const isSel = p.id === selected;
        const Icon = resolveIcon(p.icon);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
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
                <p className="mt-3 font-serif text-[20px] text-ink">
                  {donor_currency.symbol}
                  {p.donor_amount.toLocaleString()}{" "}
                  <span className="text-[13.5px] text-ink-soft font-sans">
                    ≈ {p.amount_bdt.toLocaleString()} BDT
                  </span>
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CustomAmountCard({
  donor_currency,
  value,
  onChange,
  floor,
  active,
}: {
  donor_currency: { code: string; symbol: string };
  value: string;
  onChange: (v: string) => void;
  floor: number;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition-all ${
        active ? "ring-2 ring-orange-solid" : "ring-stone-200"
      }`}
    >
      <p className="font-serif text-[17px] text-ink mb-1">
        Or give a custom amount
      </p>
      <p className="text-[13.5px] text-slate mb-3">
        Minimum {donor_currency.symbol}
        {floor.toLocaleString()} {donor_currency.code}.
      </p>
      <div className="flex items-center gap-2">
        <span className="rounded-xl bg-stone-50 px-3 py-2 text-[15px] text-slate ring-1 ring-stone-200">
          {donor_currency.symbol}
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(floor)}
          className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] text-ink placeholder:text-ink-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
        />
        <span className="text-[13px] text-ink-soft">{donor_currency.code}</span>
      </div>
    </div>
  );
}

// ─── Stripe Elements inline ────────────────────────────────────────

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
        if (window.location.pathname === "/donate") {
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
