// Session 58.2 — POST /api/admin/currency-rates/[id]/edit
//
// Body: Partial<CurrencyRateInput> ({bdt_per_unit, is_active,
// display_name, symbol}). v1 only allows edits — creation + deletion
// not supported (the 7+1 launch currencies are fixed). Audits per-
// field diff.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  updateCurrencyRate,
  type CurrencyRateInput,
} from "@/lib/admin-donation-actions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: Partial<CurrencyRateInput>;
  try {
    body = (await req.json()) as Partial<CurrencyRateInput>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    await updateCurrencyRate({
      actorUserId: session.userId,
      id,
      patch: body,
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    if (message === "Currency rate not found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[/api/admin/currency-rates/edit]", message);
    return NextResponse.json({ error: "invalid_input", message }, { status: 400 });
  }
}
