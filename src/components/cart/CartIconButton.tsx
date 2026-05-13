"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// Small cart icon for the nav. Hidden when count is 0 (avoids empty-cart
// chrome on most pages). Re-fetches count on mount and listens for the
// "og:cart-changed" custom event dispatched by add/remove actions.
export function CartIconButton() {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cart", { cache: "no-store" });
      const json = (await r.json().catch(() => ({}))) as {
        cart?: { items?: unknown[] };
      };
      setCount(Array.isArray(json.cart?.items) ? json.cart.items.length : 0);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    function onChange() { refresh(); }
    window.addEventListener("og:cart-changed", onChange);
    return () => window.removeEventListener("og:cart-changed", onChange);
  }, [refresh]);

  if (count === null || count === 0) return null;

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-tangerine-mist transition-colors"
      aria-label={`Cart (${count} ${count === 1 ? "item" : "items"})`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-5 h-5 text-ink"
        aria-hidden="true"
      >
        <path
          d="M3 4h2l2.5 11h11l2.5-8H7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="19" r="1.6" fill="currentColor" />
        <circle cx="17" cy="19" r="1.6" fill="currentColor" />
      </svg>
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-tangerine text-ink font-mono text-[10px] font-semibold"
      >
        {count}
      </span>
    </Link>
  );
}

export default CartIconButton;
