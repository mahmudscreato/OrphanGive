"use client";

import Link from "next/link";
import { useState } from "react";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatUsd, type PaymentMode } from "@/lib/pricing";
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

  const modeLabel = item.paymentMode === "monthly" ? "Monthly" : "One-time";
  const amountSuffix = item.paymentMode === "monthly" ? "/month" : "";

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
        <div className="mt-0.5 font-mono text-[10.5px] tracking-[0.12em] uppercase text-slate-soft">
          {modeLabel}
          {item.district ? <> · {item.district}</> : null}
        </div>
      </div>
      <div className="text-right min-w-[100px]">
        <div className="font-display text-[20px] text-ink leading-none">
          {formatUsd(item.amountUsd)}
          <span className="text-[12px] text-slate-soft">{amountSuffix}</span>
        </div>
        {editable ? (
          <div className="mt-2 flex justify-end gap-3 text-[12px]">
            <Link
              href={`/sponsor/${item.childId}`}
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

export default CartItemCard;
