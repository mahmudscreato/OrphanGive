// fix/child-profile-support-cta — guest one-time gift FOR a specific child.
//
// No account required. Reuses the EXISTING guest machinery: on submit it posts
// to POST /api/donate/guest-init with the child's id + a typed BDT amount, and
// is handed to Stripe hosted Checkout (Stripe collects email + name + card).
// The charge runs on the resolved general one_time package (packageId prop);
// guest-init labels the gift "Support <Name>" and records the child link. After
// payment, the existing /donate/quick/success page offers OPTIONAL account
// creation (prefilled email) — never a gate.
//
// This is a NEW entry surface on the SAME backend — no new payment path, no new
// donation model, no schema change. Monthly/recurring sponsorship genuinely
// needs an account and stays on /sponsor/[childId] (offered as a secondary,
// clearly account-gated option on the page).

"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export function SupportChildClient({
  childId,
  childFirstName,
  packageId,
  currencySymbol,
  currencyCode,
  customFloor,
}: {
  childId: string;
  childFirstName: string;
  /** Resolved general one_time package — the charge vehicle (server-picked). */
  packageId: string;
  currencySymbol: string;
  currencyCode: string;
  /** Display-currency minimum (server enforces the BDT floor authoritatively). */
  customFloor: number;
}) {
  const [amount, setAmount] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function support() {
    setError(null);
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n < customFloor) {
      // Fast client-side floor pre-check; the server re-validates
      // authoritatively (BDT floor + ceiling) on the same call.
      setError(`Please enter at least ${currencySymbol}${customFloor}.`);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/donate/guest-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          customAmount: Math.round(n),
          currencyCode,
          childId,
          whatsapp: whatsapp.trim() || undefined,
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
    <div className="rounded-[28px] border border-tangerine-soft bg-white shadow-warm px-8 py-8 max-md:px-5 max-md:py-6">
      <div className="inline-flex items-center text-script-md text-tangerine-deep">
        <EyebrowIcon />
        Give in a minute
      </div>
      <h1 className="mt-3 font-display font-normal text-ink leading-[1.1] tracking-[-0.02em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
        Support {childFirstName}
      </h1>
      <p className="mt-3 text-[15.5px] text-slate leading-[1.6] max-w-[440px]">
        A one-time gift for {childFirstName} in Bangladesh — food, learning,
        health care, delivered with dignity. No account needed.
      </p>

      {/* Amount */}
      <label
        htmlFor="support-amount"
        className="block mt-6 text-[13px] font-medium text-ink"
      >
        Your gift ({currencyCode})
      </label>
      <div className="mt-2 inline-flex items-center h-12 rounded-full border border-ink/[0.14] bg-white px-5 shadow-sm focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
        <span className="font-display text-[16px] text-ink mr-1">
          {currencySymbol}
        </span>
        <input
          id="support-amount"
          type="number"
          inputMode="numeric"
          min={customFloor}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
          placeholder={String(customFloor)}
          className="w-32 bg-transparent text-[16px] text-ink focus:outline-none"
        />
      </div>

      {/* Optional WhatsApp — for updates about the child. Email + name are
          collected by Stripe at checkout; this is the one extra, optional. */}
      <label
        htmlFor="support-whatsapp"
        className="block mt-5 text-[13px] font-medium text-ink"
      >
        WhatsApp for updates{" "}
        <span className="font-normal text-slate-soft">(optional)</span>
      </label>
      <input
        id="support-whatsapp"
        type="tel"
        inputMode="tel"
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        disabled={pending}
        placeholder="+880…"
        className="mt-2 w-full max-w-[280px] h-12 rounded-full border border-ink/[0.14] bg-white px-5 text-[15px] text-ink shadow-sm focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
      />

      {error ? (
        <p className="mt-4 text-[13.5px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-7">
        <button
          type="button"
          onClick={support}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-12 font-body font-semibold rounded-full bg-tangerine text-ink px-8 text-[15px] transition-all hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {pending ? "Taking you to checkout…" : `Support ${childFirstName}`}
        </button>
        <p className="mt-3 text-[12.5px] text-slate-soft leading-[1.6] max-w-[440px]">
          No account needed. You&rsquo;ll pay securely on Stripe, and your
          receipt goes to the email you enter there. Creating an account
          afterward is optional — it just lets you follow {childFirstName}.
        </p>
      </div>

      {/* Monthly/recurring genuinely needs an account — offered as a clear,
          secondary, account-gated option (never a gate on the one-time gift). */}
      <div className="mt-6 border-t border-ink/[0.08] pt-5">
        <p className="text-[13.5px] text-slate leading-[1.6]">
          Prefer ongoing monthly sponsorship?{" "}
          <Link
            href={`/signin?next=/sponsor/${childId}`}
            className="text-tangerine-deeper font-medium underline-offset-4 hover:underline"
          >
            Sign in to set it up →
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SupportChildClient;
