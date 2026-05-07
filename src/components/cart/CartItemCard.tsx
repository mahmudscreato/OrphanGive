"use client";

import Link from "next/link";
import { useState } from "react";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatUsd } from "@/lib/pricing";
import type { HydratedCartItem } from "@/lib/cart-data";

type Props = {
  item: HydratedCartItem;
  // Whether to show edit/remove buttons. False on the read-only checkout
  // summary; true on /cart.
  editable?: boolean;
  onChanged?: () => void;
};

export function CartItemCard({ item, editable = true, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const photoSrc = directusAssetUrl(item.photo);

  async function remove() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/cart/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: item.childId,
          paymentMode: item.paymentMode,
        }),
      });
      window.dispatchEvent(new CustomEvent("og:cart-changed"));
      onChanged?.();
    } finally {
      setPending(false);
    }
  }

  const config = describeItem(item);
  const headlineAmount = headlineFor(item);
  const editHref = editLinkFor(item);

  return (
    <div className="rounded-[20px] bg-white border border-ink/[0.06] p-4 flex items-center gap-4 max-md:flex-wrap">
      <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-tangerine-mist shrink-0">
        {photoSrc ? (
          <ProtectedChildImage
            src={photoSrc}
            alt={item.display_name ?? "Child"}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="child-photo-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-[18px] text-ink leading-snug truncate">
          {item.display_name ?? "Child"}
        </div>
        <div className="mt-0.5 text-[12.5px] text-slate leading-snug">
          {config}
        </div>
        {item.district ? (
          <div className="mt-1 font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-soft">
            {item.district}
          </div>
        ) : null}
      </div>
      <div className="text-right min-w-[110px]">
        <div className="font-display text-[20px] text-ink leading-none">
          {headlineAmount.amount}
          {headlineAmount.suffix ? (
            <span className="text-[12px] text-slate-soft">
              {headlineAmount.suffix}
            </span>
          ) : null}
        </div>
        {headlineAmount.subline ? (
          <div className="mt-1 font-mono text-[10px] tracking-[0.1em] uppercase text-slate-soft">
            {headlineAmount.subline}
          </div>
        ) : null}
        {editable ? (
          <div className="mt-2 flex justify-end gap-3 text-[12px]">
            <Link
              href={editHref}
              className="text-slate hover:text-tangerine-deep transition-colors underline-offset-4 hover:underline"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-slate hover:text-[#A02B2B] transition-colors disabled:opacity-60"
            >
              {pending ? "Removing…" : "Remove"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Describes the item in plain language. Examples:
//   "Monthly · $25/mo · until I cancel"
//   "Monthly · $25/mo × 6 months ($150 total)"
//   "Monthly prepaid · $150 once for 6 months"
//   "One-time gift · $100"
function describeItem(item: HydratedCartItem): string {
  if (item.paymentMode === "one_time") {
    return `One-time gift · ${formatUsd(item.amountUsd)}`;
  }
  // monthly
  if (item.paymentSchedule === "monthly_prepaid" && item.durationMonths) {
    const total = item.amountUsd * item.durationMonths;
    return `Monthly prepaid · ${formatUsd(total)} once for ${item.durationMonths} months`;
  }
  // monthly recurring
  if (item.durationMonths === null || item.durationMonths === undefined) {
    return `Monthly · ${formatUsd(item.amountUsd)}/mo · until I cancel`;
  }
  const total = item.amountUsd * item.durationMonths;
  return `Monthly · ${formatUsd(item.amountUsd)}/mo × ${item.durationMonths} months (${formatUsd(total)} total)`;
}

// What the right-rail amount column shows. Prepaid carts show the full
// upfront sum (since that's what the donor will be charged today);
// recurring carts show the per-month rate.
function headlineFor(item: HydratedCartItem): {
  amount: string;
  suffix: string;
  subline: string | null;
} {
  if (item.paymentMode === "one_time") {
    return { amount: formatUsd(item.amountUsd), suffix: "", subline: null };
  }
  if (item.paymentSchedule === "monthly_prepaid" && item.durationMonths) {
    return {
      amount: formatUsd(item.amountUsd * item.durationMonths),
      suffix: "",
      subline: "today",
    };
  }
  return {
    amount: formatUsd(item.amountUsd),
    suffix: "/mo",
    subline: null,
  };
}

// Edit link points back at the sponsor page with all current selections
// pre-filled via search params. The sponsor page reads these on mount
// and jumps straight to the review step.
function editLinkFor(item: HydratedCartItem): string {
  const params = new URLSearchParams();
  params.set("mode", item.paymentMode);
  params.set("amount", String(item.amountUsd));
  if (item.paymentMode === "monthly") {
    params.set(
      "duration",
      item.durationMonths === null || item.durationMonths === undefined
        ? "indef"
        : String(item.durationMonths),
    );
    if (item.paymentSchedule) {
      params.set("schedule", item.paymentSchedule);
    }
  }
  params.set("edit", "1");
  return `/sponsor/${item.childId}?${params.toString()}`;
}

export default CartItemCard;
