"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CartItemCard } from "@/components/cart/CartItemCard";
import { CartTotals } from "@/components/cart/CartTotals";
import type { HydratedCartItem } from "@/lib/cart-data";

type Props = {
  items: HydratedCartItem[];
  monthlyTotal: number;
  oneTimeTotal: number;
};

export function CartContent({ items: initialItems, monthlyTotal, oneTimeTotal }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [m, setM] = useState(monthlyTotal);
  const [o, setO] = useState(oneTimeTotal);

  async function refresh() {
    const r = await fetch("/api/cart", { cache: "no-store" });
    const json = (await r.json().catch(() => ({}))) as {
      cart?: { items?: HydratedCartItem[]; monthlyTotal?: number; oneTimeTotal?: number };
    };
    if (json.cart) {
      setItems(Array.isArray(json.cart.items) ? json.cart.items : []);
      setM(json.cart.monthlyTotal ?? 0);
      setO(json.cart.oneTimeTotal ?? 0);
      // Empty cart → re-render parent to switch to empty state.
      if ((json.cart.items?.length ?? 0) === 0) {
        router.refresh();
      }
    }
  }

  const monthlyItems = items.filter((i) => i.paymentMode === "monthly");
  const oneTimeItems = items.filter((i) => i.paymentMode === "one_time");

  return (
    <div className="mt-8 grid grid-cols-[1fr_320px] gap-8 items-start max-lg:grid-cols-1">
      <div className="space-y-8">
        {monthlyItems.length > 0 ? (
          <section>
            <h2 className="font-display text-[18px] text-ink mb-3">Monthly sponsorships</h2>
            <div className="space-y-3">
              {monthlyItems.map((item) => (
                <CartItemCard
                  key={`${item.childId}-${item.paymentMode}`}
                  item={item}
                  onChanged={refresh}
                />
              ))}
            </div>
          </section>
        ) : null}
        {oneTimeItems.length > 0 ? (
          <section>
            <h2 className="font-display text-[18px] text-ink mb-3">One-time gifts</h2>
            <div className="space-y-3">
              {oneTimeItems.map((item) => (
                <CartItemCard
                  key={`${item.childId}-${item.paymentMode}`}
                  item={item}
                  onChanged={refresh}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-32">
        <CartTotals monthlyTotal={m} oneTimeTotal={o} />
        <Link
          href="/checkout"
          className="w-full inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[14px] text-[15px] hover:bg-tangerine-deep hover:shadow-warm transition-all"
        >
          Proceed to checkout →
        </Link>
        <Link
          href="/children"
          className="w-full inline-flex items-center justify-center gap-2 text-[13px] text-slate hover:text-tangerine-deep transition-colors"
        >
          ← Continue browsing
        </Link>
      </aside>
    </div>
  );
}
