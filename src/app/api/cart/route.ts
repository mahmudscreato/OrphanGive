import { NextResponse } from "next/server";
import { hydrateCart, readCart } from "@/lib/cart-data";

export const runtime = "nodejs";

export async function GET() {
  const cart = await readCart();
  if (!cart) {
    return NextResponse.json({
      cart: { items: [], monthlyTotal: 0, oneTimeTotal: 0, totalAmountUsd: 0 },
    });
  }
  const hydrated = await hydrateCart(cart);
  return NextResponse.json({ cart: hydrated });
}
