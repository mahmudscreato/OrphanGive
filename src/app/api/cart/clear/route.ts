import { NextResponse } from "next/server";
import { clearCart } from "@/lib/cart-data";

export const runtime = "nodejs";

export async function POST() {
  await clearCart();
  return NextResponse.json({
    cart: { items: [], monthlyTotal: 0, oneTimeTotal: 0, totalAmountUsd: 0 },
  });
}
