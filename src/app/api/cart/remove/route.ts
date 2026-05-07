import { NextResponse, type NextRequest } from "next/server";
import { hydrateCart, removeItem } from "@/lib/cart-data";
import { isPaymentMode } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { childId, paymentMode } = body as Record<string, unknown>;
  if (typeof childId !== "string" || !isPaymentMode(paymentMode)) {
    return NextResponse.json({ error: "childId and paymentMode required." }, { status: 400 });
  }
  const cart = await removeItem({ childId, paymentMode });
  if (!cart) {
    return NextResponse.json({
      cart: { items: [], monthlyTotal: 0, oneTimeTotal: 0, totalAmountUsd: 0 },
    });
  }
  const hydrated = await hydrateCart(cart);
  return NextResponse.json({ cart: hydrated });
}
