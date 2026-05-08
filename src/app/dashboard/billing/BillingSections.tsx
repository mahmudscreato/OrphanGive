"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useToast } from "@/components/ui/Toast";
import type { PublicPaymentMethod } from "@/lib/payment-methods";

// ── Stripe.js singleton ───────────────────────────────────────────────────
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(): Promise<StripeJs | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key) ?? null;
}

const CARD_ELEMENT_OPTIONS = {
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

const cardClass =
  "rounded-[20px] bg-white border border-ink/[0.06] px-7 py-6 max-md:px-5 max-md:py-5";

type Props = {
  hasStripeCustomer: boolean;
  initialPaymentMethods: PublicPaymentMethod[];
};

export function BillingSections({
  hasStripeCustomer,
  initialPaymentMethods,
}: Props) {
  return (
    <div className="space-y-6">
      <PaymentMethodsSection
        hasStripeCustomer={hasStripeCustomer}
        initial={initialPaymentMethods}
      />
      <InvoiceHistorySection hasStripeCustomer={hasStripeCustomer} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — saved payment methods
// ═══════════════════════════════════════════════════════════════

function PaymentMethodsSection({
  hasStripeCustomer,
  initial,
}: {
  hasStripeCustomer: boolean;
  initial: PublicPaymentMethod[];
}) {
  const toast = useToast();
  const [pms, setPms] = useState<PublicPaymentMethod[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // `ready` gates user actions until the initial mount-fetch resolves.
  // The page passed `initial` for fast first paint, but that list could
  // be stale (other browser tab, earlier session, diagnostic spike, etc.)
  // — we always re-sync from the server before letting the donor click
  // anything that mutates state.
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/donor/me/payment-methods");
      const json: {
        paymentMethods?: PublicPaymentMethod[];
        error?: string;
      } = await res.json().catch(() => ({}));
      if (res.ok && json.paymentMethods) {
        setPms(json.paymentMethods);
        return true;
      }
      return false;
    } catch {
      // Silent — UI keeps showing the previous list (initial server
      // props or last known good).
      return false;
    }
  }, []);

  // Mount-time canonical re-sync. Cancellation token guards against the
  // tab being unmounted before the fetch resolves.
  useEffect(() => {
    if (!hasStripeCustomer) {
      // Customer hasn't been created yet — nothing to fetch, ready
      // immediately so the empty-state copy renders without delay.
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasStripeCustomer, refresh]);

  async function setDefault(pmId: string) {
    if (!ready) return;
    setBusyId(pmId);
    try {
      const res = await fetch(
        `/api/donor/me/payment-methods/${pmId}/set-default`,
        { method: "POST" },
      );
      const json: {
        success?: boolean;
        error?: string;
        paymentMethods?: PublicPaymentMethod[];
      } = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Could not set default.");
        return;
      }
      if (json.paymentMethods) setPms(json.paymentMethods);
      else await refresh();
      toast.success("Default payment method updated.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function removePm(pmId: string) {
    if (!ready) return;
    setBusyId(pmId);
    try {
      const res = await fetch(`/api/donor/me/payment-methods/${pmId}/remove`, {
        method: "POST",
      });
      const json: {
        success?: boolean;
        error?: string;
        paymentMethods?: PublicPaymentMethod[];
      } = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Could not remove payment method.");
        return;
      }
      if (json.paymentMethods) setPms(json.paymentMethods);
      else await refresh();
      toast.success("Payment method removed.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={cardClass}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[20px] text-ink leading-tight m-0">
            Saved payment methods
          </h2>
          {hasStripeCustomer && !ready ? (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-soft"
              aria-live="polite"
            >
              <SyncSpinner />
              Syncing
            </span>
          ) : null}
        </div>
        {hasStripeCustomer ? (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            disabled={!ready}
            className="font-body text-[12.5px] text-tangerine-deep underline-offset-4 hover:underline disabled:text-slate-soft disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            {showAdd ? "Cancel" : "+ Add a payment method"}
          </button>
        ) : null}
      </div>

      {!hasStripeCustomer ? (
        <p className="text-[14px] text-slate-soft leading-[1.6] max-w-[560px] mt-3">
          Payment methods will appear here after your first donation.
        </p>
      ) : (
        <>
          {showAdd ? (
            <div className="mt-5">
              <AddPaymentMethodForm
                onSuccess={(pms) => {
                  setPms(pms);
                  setShowAdd(false);
                  toast.success("Payment method added.");
                }}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          ) : null}

          {pms.length === 0 ? (
            <p className="text-[14px] text-slate-soft leading-[1.6] max-w-[560px] mt-4">
              No payment methods on file. Add one to enable extensions
              and modifications.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/[0.06]">
              {pms.map((pm) => (
                <li
                  key={pm.id}
                  className="flex items-center justify-between gap-4 py-4 flex-wrap"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <BrandIcon brand={pm.brand} />
                    <div>
                      <div className="font-display text-[15px] text-ink">
                        •••• {pm.last4}
                      </div>
                      <div className="font-mono text-[11px] tracking-[0.05em] text-slate-soft mt-0.5">
                        Expires {String(pm.exp_month).padStart(2, "0")}/{String(
                          pm.exp_year,
                        ).slice(-2)}
                      </div>
                    </div>
                    {pm.isDefault ? (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border bg-moss-soft text-moss border-moss/30">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <PmActions
                    pm={pm}
                    busy={busyId === pm.id}
                    disabled={!ready}
                    canRemove={pm.isDefault ? pms.length === 1 : true}
                    onSetDefault={() => setDefault(pm.id)}
                    onRemove={() => removePm(pm.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PmActions({
  pm,
  busy,
  disabled,
  canRemove,
  onSetDefault,
  onRemove,
}: {
  pm: PublicPaymentMethod;
  busy: boolean;
  disabled: boolean;
  canRemove: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy || disabled}
        aria-label="Payment method actions"
        title={disabled && !busy ? "Syncing payment methods…" : undefined}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-soft hover:text-ink hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="3"
            />
            <path
              d="M21 12a9 9 0 0 1-9 9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span className="text-[18px] leading-none">⋯</span>
        )}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white border border-ink/[0.08] shadow-card z-10 overflow-hidden">
          {!pm.isDefault ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSetDefault();
              }}
              className="block w-full text-left px-4 py-2.5 text-[13.5px] text-ink hover:bg-cream"
            >
              Set as default
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canRemove}
            title={
              canRemove
                ? undefined
                : "Set another payment method as default before removing this one."
            }
            onClick={() => {
              if (!canRemove) return;
              setOpen(false);
              onRemove();
            }}
            className="block w-full text-left px-4 py-2.5 text-[13.5px] text-[#A02B2B] hover:bg-[#FEEFEF] disabled:text-slate-soft disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BrandIcon({ brand }: { brand: string }) {
  const label = brand.toUpperCase();
  // Render a brand-coloured wordmark tile. Stripe sends consistent
  // strings ("visa", "mastercard", "amex", etc) so a small switch
  // beats hauling in a logo SVG library.
  const palette: Record<string, { bg: string; text: string; short: string }> = {
    visa: { bg: "#1A1F71", text: "#fff", short: "VISA" },
    mastercard: { bg: "#EB001B", text: "#fff", short: "MC" },
    amex: { bg: "#2E77BC", text: "#fff", short: "AMEX" },
    discover: { bg: "#FF6000", text: "#fff", short: "DISC" },
    jcb: { bg: "#0F4A8A", text: "#fff", short: "JCB" },
    diners: { bg: "#0079BE", text: "#fff", short: "DC" },
    unionpay: { bg: "#005BAC", text: "#fff", short: "UP" },
  };
  const p = palette[brand.toLowerCase()] ?? {
    bg: "#2A2A2C",
    text: "#FFFAF2",
    short: label.slice(0, 4),
  };
  return (
    <div
      className="w-12 h-8 rounded-[6px] flex items-center justify-center font-mono font-semibold text-[10.5px] tracking-[0.05em] shrink-0"
      style={{ background: p.bg, color: p.text }}
      aria-hidden="true"
    >
      {p.short}
    </div>
  );
}

// Tiny low-key spinner for the "Syncing" indicator next to the heading
// while the mount-fetch resolves. Subtle by design — same colour as the
// surrounding mono text.
function SyncSpinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin text-slate-soft"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Add Payment Method form ───────────────────────────────────────────────

function AddPaymentMethodForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (pms: PublicPaymentMethod[]) => void;
  onCancel: () => void;
}) {
  const promise = getStripePromise();
  if (!promise) {
    return (
      <div className="rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B]">
        Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in
        .env.local.
      </div>
    );
  }
  return (
    <Elements stripe={promise}>
      <AddPaymentMethodInner onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}

function AddPaymentMethodInner({
  onSuccess,
  onCancel,
}: {
  onSuccess: (pms: PublicPaymentMethod[]) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const [pending, startTransition] = useTransition();
  const [cardComplete, setCardComplete] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) {
      setLocalError("Card form not ready. Please refresh.");
      return;
    }
    setLocalError(null);

    startTransition(async () => {
      const created = await stripe.createPaymentMethod({
        type: "card",
        card,
      });
      if (created.error || !created.paymentMethod) {
        setLocalError(
          created.error?.message ?? "Could not validate the card.",
        );
        return;
      }
      try {
        const res = await fetch("/api/donor/me/payment-methods/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethodId: created.paymentMethod.id,
          }),
        });
        const json: {
          success?: boolean;
          error?: string;
          paymentMethods?: PublicPaymentMethod[];
        } = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          setLocalError(json.error ?? "Could not save the card.");
          return;
        }
        onSuccess(json.paymentMethods ?? []);
      } catch {
        setLocalError("Network error. Please try again.");
        toast.error("Network error.");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-ink/[0.08] bg-cream/40 p-4"
    >
      <div className="rounded-xl border-[1.5px] border-ink/[0.12] bg-white px-4 py-3 transition-all focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
        <CardElement
          options={CARD_ELEMENT_OPTIONS}
          onChange={(e) => {
            setCardComplete(e.complete);
            if (e.error) setLocalError(e.error.message);
            else if (localError && e.complete) setLocalError(null);
          }}
        />
      </div>
      {localError ? (
        <div className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-3.5 py-2.5 text-[13px] text-[#A02B2B]">
          {localError}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !cardComplete || !stripe}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-2.5 text-[13.5px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {pending ? "Saving…" : "Save card"}
        </button>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — invoice history (Stripe Customer Portal)
// ═══════════════════════════════════════════════════════════════

function InvoiceHistorySection({
  hasStripeCustomer,
}: {
  hasStripeCustomer: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function openPortal() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/donor/me/billing-portal");
        const json: { url?: string; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !json.url) {
          toast.error(json.error ?? "Could not open the billing portal.");
          return;
        }
        window.location.href = json.url;
      } catch {
        toast.error("Network error. Please try again.");
      }
    });
  }

  return (
    <section className={cardClass}>
      <h2 className="font-display text-[20px] text-ink leading-tight m-0">
        Invoice history
      </h2>
      <p className="mt-3 text-[14px] text-slate leading-[1.6] max-w-[560px]">
        View and download all your payment receipts and tax documents in
        our secure billing portal.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={openPortal}
          disabled={pending || !hasStripeCustomer}
          title={
            hasStripeCustomer
              ? undefined
              : "No payment history yet. Make a donation to access your billing portal."
          }
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-2.5 text-[13.5px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {pending ? "Opening…" : "Open billing portal →"}
        </button>
      </div>
    </section>
  );
}
