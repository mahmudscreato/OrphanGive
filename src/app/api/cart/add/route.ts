import { NextResponse, type NextRequest } from "next/server";
import {
  addOrUpdateItem,
  hydrateCart,
  isChildAvailable,
} from "@/lib/cart-data";
import {
  CUSTOM_DURATION_MAX,
  CUSTOM_DURATION_MIN,
  isPaymentMode,
  isPaymentSchedule,
  isValidAmount,
  type PaymentSchedule,
} from "@/lib/pricing";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const {
    childId,
    paymentMode,
    amountUsd,
    durationMonths: durationRaw,
    paymentSchedule: scheduleRaw,
  } = body as Record<string, unknown>;

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

  // ── Duration + schedule validation ────────────────────────────────────
  // Treat undefined as null for back-compat with older clients that
  // haven't been updated to send these fields.
  const durationMonths: number | null =
    durationRaw === undefined || durationRaw === null
      ? null
      : typeof durationRaw === "number"
        ? durationRaw
        : Number(durationRaw);
  if (durationMonths !== null && !Number.isFinite(durationMonths)) {
    return NextResponse.json(
      { error: "durationMonths must be a number or null." },
      { status: 400 },
    );
  }
  let paymentSchedule: PaymentSchedule | null;
  if (scheduleRaw === undefined || scheduleRaw === null) {
    paymentSchedule = null;
  } else if (isPaymentSchedule(scheduleRaw)) {
    paymentSchedule = scheduleRaw;
  } else {
    return NextResponse.json(
      { error: "Invalid paymentSchedule (expected 'monthly' or 'monthly_prepaid')." },
      { status: 400 },
    );
  }

  if (paymentMode === "one_time") {
    if (durationMonths !== null) {
      return NextResponse.json(
        { error: "One-time gifts cannot have a duration." },
        { status: 400 },
      );
    }
    if (paymentSchedule !== null) {
      return NextResponse.json(
        { error: "One-time gifts cannot have a payment schedule." },
        { status: 400 },
      );
    }
  } else {
    // monthly mode
    if (durationMonths !== null) {
      if (
        !Number.isInteger(durationMonths) ||
        durationMonths < CUSTOM_DURATION_MIN ||
        durationMonths > CUSTOM_DURATION_MAX
      ) {
        return NextResponse.json(
          {
            error: `durationMonths must be an integer ${CUSTOM_DURATION_MIN}-${CUSTOM_DURATION_MAX}, or null for indefinite.`,
          },
          { status: 400 },
        );
      }
      if (paymentSchedule !== "monthly" && paymentSchedule !== "monthly_prepaid") {
        return NextResponse.json(
          { error: "Fixed-term monthly sponsorships require a payment schedule." },
          { status: 400 },
        );
      }
    } else {
      // indefinite — only 'monthly' is valid (no upfront prepay).
      if (paymentSchedule !== "monthly") {
        return NextResponse.json(
          {
            error:
              "Indefinite monthly sponsorships only support 'monthly' payment schedule.",
          },
          { status: 400 },
        );
      }
    }
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
    item: {
      childId,
      paymentMode,
      amountUsd: amount,
      durationMonths,
      paymentSchedule,
    },
  });
  const hydrated = await hydrateCart(cart);
  return NextResponse.json({ cart: hydrated });
}
