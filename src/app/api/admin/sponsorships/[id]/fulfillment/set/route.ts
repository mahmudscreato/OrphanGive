// Donation Lifecycle sub-phase 3 — admin sets a fulfillment exception.
//
// POST /api/admin/sponsorships/[id]/fulfillment/set
// Body: { exception: 'on_hold' | 'disputed' | 'refund_requested',
//         privateReason: string (5-1000 chars),
//         donorVisibleReason: string | null (max 500 chars) }
//
// THIS ENDPOINT WRITES A COLUMN ONLY. It does NOT call Stripe, does
// NOT trigger a refund, does NOT issue a payment-side action. The
// existing payment-axis routes (cancel / pause / resume / refund)
// are untouched. Refund completion ('refunded' exception value) is
// system-set by the Stripe charge.refunded webhook — admin cannot
// write it here even by passing it (the input validator rejects it).
//
// Status mapping:
//   200 ok                  — { sponsorshipId, exception }
//   400 invalid_input
//   401 unauthorized
//   404 not_found
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  FulfillmentInvalidInputError,
  FulfillmentNotFoundError,
  setFulfillmentException,
} from "@/lib/admin-fulfillment-actions";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    // 'refunded' is deliberately excluded — system-set only.
    exception: z.enum(["on_hold", "disputed", "refund_requested"]),
    privateReason: z.string().min(5).max(1000),
    donorVisibleReason: z.string().max(500).nullable().optional(),
  })
  .strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_input", message: "invalid JSON" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await setFulfillmentException(
      {
        sponsorshipId: id,
        exception: parsed.data.exception,
        privateReason: parsed.data.privateReason,
        donorVisibleReason: parsed.data.donorVisibleReason ?? null,
        adminUserId: adminSession.userId,
      },
      req,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof FulfillmentNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof FulfillmentInvalidInputError) {
      return NextResponse.json(
        { error: "invalid_input", field: err.field, message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/sponsorships/[id]/fulfillment/set] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
