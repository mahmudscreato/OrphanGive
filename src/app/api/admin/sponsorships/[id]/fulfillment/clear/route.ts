// Donation Lifecycle sub-phase 3 — admin clears a fulfillment exception.
//
// POST /api/admin/sponsorships/[id]/fulfillment/clear
// (no body)
//
// Nulls all four fulfillment_* columns. After this, the resolver
// falls through to the payment / spine derivation. Refusing to clear
// 'refunded' (system-set, terminal). Idempotent — clearing when no
// exception is set is a 200 no-op.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  clearFulfillmentException,
  FulfillmentInvalidInputError,
  FulfillmentNotFoundError,
} from "@/lib/admin-fulfillment-actions";

export const dynamic = "force-dynamic";

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
  try {
    const result = await clearFulfillmentException(
      { sponsorshipId: id, adminUserId: adminSession.userId },
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
      "[/api/admin/sponsorships/[id]/fulfillment/clear] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
