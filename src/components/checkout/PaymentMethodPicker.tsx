"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  monthlyTotalUsd: number;
  oneTimeTotalUsd: number;
  bdtRate: number;
  // Children = the active Stripe form. Rendered inside the active card.
  stripeForm: ReactNode;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function formatBdt(usd: number, rate: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(usd * rate));
}

function CardLogo({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center justify-center w-9 h-6 rounded-md border border-ink/[0.08] bg-white text-[9px] font-mono font-medium text-slate uppercase">
      {name}
    </span>
  );
}

// Generic logo "chip" used inside the disabled cards. We don't ship the
// actual partner logos yet — these are subtle placeholders that read as
// "logo" without claiming to be one.
function BankLogoPlaceholder() {
  return (
    <span className="inline-block w-12 h-5 rounded-sm bg-slate-mist/60" />
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────
// Tiny self-contained tooltip — visible on:
//   • hover (desktop, via mouseenter/mouseleave)
//   • focus (keyboard, via focus/blur)
//   • click/tap (mobile, via click toggle)
// Closes on outside click and Escape.
function CardTooltip({
  open,
  id,
  children,
}: {
  open: boolean;
  id: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tooltip"
      id={id}
      aria-hidden={!open}
      style={{
        // Inline backgroundColor + z-index defeat any class-resolution or
        // sibling-stacking-context surprises (a sibling card with opacity
        // < 1 forms its own context that can paint over our bg-ink class).
        backgroundColor: "#2A2A2C",
        zIndex: 50,
      }}
      className={
        "absolute left-3 right-3 top-full mt-2 " +
        "rounded-xl text-cream text-[12.5px] leading-[1.55] " +
        "px-4 py-3 shadow-[0_8px_24px_rgba(42,42,44,0.18)] " +
        "transition-all duration-150 origin-top " +
        (open
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-1 pointer-events-none")
      }
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: "#2A2A2C" }}
        className="absolute -top-1.5 left-6 w-3 h-3 rotate-45 rounded-[2px]"
      />
      <span className="relative">{children}</span>
    </div>
  );
}

// ─── Disabled method card ───────────────────────────────────────────────────
function DisabledMethodCard({
  title,
  titleColor,
  subline,
  amountLine,
  trustLine,
  logos,
  tooltip,
}: {
  title: string;
  titleColor: string; // brand colour for the wordmark
  subline: string;
  amountLine: string;
  trustLine: string;
  logos: ReactNode;
  tooltip: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  // Close on outside click + Escape. mousedown fires before click so the
  // toggle's own click won't immediately re-close.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current && !wrapRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{
        // `isolation: isolate` forces a new stacking context regardless
        // of z-index. Combined with the high zIndex when open, this
        // guarantees the tooltip paints above sibling cards even if they
        // have their own implicit stacking contexts (opacity < 1).
        isolation: "isolate",
        zIndex: open ? 50 : "auto",
      }}
      className="relative"
    >
      {/* role=button + aria-disabled (not <button disabled>) so hover/focus
          events still fire on all browsers. tabIndex={-1} skips it in
          keyboard navigation, per spec. */}
      <div
        role="button"
        aria-disabled="true"
        aria-describedby={open ? tooltipId : undefined}
        tabIndex={-1}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className={
          "relative rounded-[18px] border-[1.5px] border-ink/[0.08] " +
          "bg-ink/[0.025] px-5 py-4 cursor-not-allowed select-none " +
          "opacity-60 transition-opacity hover:opacity-70 focus:outline-none"
        }
      >
        {/* "Coming soon" badge — top-right, tangerine */}
        <span
          className={
            "absolute top-3 right-3 inline-flex items-center px-2 py-0.5 " +
            "rounded-full font-mono text-[9.5px] tracking-[0.12em] uppercase " +
            "bg-tangerine text-cream font-medium"
          }
        >
          Coming soon
        </span>

        {/* Body — same shape as the active Stripe card so vertical heights
            match: radio + (title row, logos row, trust line). */}
        <div className="flex items-start gap-3">
          <input
            type="radio"
            disabled
            tabIndex={-1}
            className="mt-1.5 h-4 w-4 cursor-not-allowed accent-slate-soft"
            aria-hidden="true"
            // Visible disabled state without making it a focus stop.
          />
          <div className="flex-1 min-w-0 pr-24">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <div
                  className="font-display text-[17px] leading-tight"
                  style={{ color: titleColor }}
                >
                  {title}
                </div>
                <div className="mt-0.5 text-[12px] text-slate-soft">
                  {subline}
                </div>
              </div>
              <div className="text-[13px] text-slate font-mono">
                {amountLine}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {logos}
            </div>
            <div className="mt-3 text-[11px] text-slate-soft">{trustLine}</div>
          </div>
        </div>
      </div>

      <CardTooltip open={open} id={tooltipId}>
        {tooltip}
      </CardTooltip>
    </div>
  );
}

// ─── Picker ─────────────────────────────────────────────────────────────────
export function PaymentMethodPicker({
  monthlyTotalUsd,
  oneTimeTotalUsd,
  bdtRate,
  stripeForm,
}: Props) {
  const bdtLines = [
    monthlyTotalUsd > 0
      ? `BDT ${formatBdt(monthlyTotalUsd, bdtRate)}/month`
      : null,
    oneTimeTotalUsd > 0
      ? `BDT ${formatBdt(oneTimeTotalUsd, bdtRate)} one-time`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const usdLines = [
    monthlyTotalUsd > 0 ? `${formatUsd(monthlyTotalUsd)}/month` : null,
    oneTimeTotalUsd > 0 ? `${formatUsd(oneTimeTotalUsd)} one-time` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <section>
      <h2 className="font-display text-[22px] text-ink mb-4">
        Choose how to pay
      </h2>
      <div className="space-y-3">
        <DisabledMethodCard
          title="bKash"
          titleColor="#E2136E"
          subline="Mobile wallet · Bangladesh"
          amountLine={bdtLines || "BDT —"}
          trustLine="Secured payments with bKash"
          logos={<BankLogoPlaceholder />}
          tooltip="bKash integration is in progress. We're working with bKash to enable mobile wallet payments for Bangladesh donors. For now, please use International Card."
        />

        <DisabledMethodCard
          title="SSLCommerz"
          titleColor="#2563EB"
          subline="Local cards · BDT pricing"
          amountLine={bdtLines || "BDT —"}
          trustLine="Secured payments with SSLCommerz"
          logos={
            <>
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
              <BankLogoPlaceholder />
            </>
          }
          tooltip="Local card payment via SSLCommerz arrives in approximately 60 days. This will let you pay in BDT with your local bank card. For now, please use International Card."
        />

        {/* Active method: Stripe */}
        <div className="rounded-[18px] border-[1.5px] border-tangerine bg-white px-5 py-4 shadow-warm">
          <div className="flex items-start gap-3">
            <input
              type="radio"
              checked
              readOnly
              className="mt-1.5 h-4 w-4 accent-tangerine"
              aria-label="International card (selected)"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-display text-[17px] text-ink leading-tight">
                    International Card
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate">
                    Visa, Mastercard, Amex, Discover · USD
                  </div>
                </div>
                <div className="text-[13px] text-tangerine-deep font-mono">
                  {usdLines}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <CardLogo name="Visa" />
                <CardLogo name="MC" />
                <CardLogo name="Amex" />
                <CardLogo name="Disc" />
                <CardLogo name="JCB" />
              </div>
              <div className="mt-3 text-[11px] text-slate-soft">
                Secured payments with Stripe Inc.
              </div>
              <div className="mt-4">{stripeForm}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PaymentMethodPicker;
