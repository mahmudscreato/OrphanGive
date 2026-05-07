import { NextResponse, type NextRequest } from "next/server";
import {
  addOrUpdateItem,
  hydrateCart,
  isChildAvailable,
} from "@/lib/cart-data";
import { isPaymentMode, isValidAmount } from "@/lib/pricing";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { childId, paymentMode, amountUsd } = body as Record<string, unknown>;
  if (typeof childId !== "string") {
    return NextResponse.json({ error: "childId required." }, { status: 400 });
  }
  if (!isPaymentMode(paymentMode)) {
    return NextResponse.json({ error: "Invalid payment mode." }, { status: 400 });
  }
  const amount = typeof amountUsd === "number" ? amountUsd : Number(amountUsd);
  if (!isValidAmount(paymentMode, amount)) {
    return NextResponse.json(
      { error: "Amount is below the minimum or invalid." },
      { status: 400 },
    );
  }

  // Block signed-in but suspended/rejected donors. Pending-approval donors
  // CAN build a cart per spec — checkout enforces approval at pay time.
  const donor = await getCurrentDonor();
  if (donor) {
    const state = getDonorState(donor);
    if (state === "suspended" || state === "rejected") {
      return NextResponse.json(
        { error: "Account not eligible to add items." },
        { status: 403 },
      );
    }
  }

  if (!(await isChildAvailable(childId))) {
    return NextResponse.json({ error: "Child unavailable." }, { status: 400 });
  }

  const cart = await addOrUpdateItem({
    donorId: donor?.id ?? null,
    item: { childId, paymentMode, amountUsd: amount },
  });
  const hydrated = await hydrateCart(cart);
  return NextResponse.json({ cart: hydrated });
}
