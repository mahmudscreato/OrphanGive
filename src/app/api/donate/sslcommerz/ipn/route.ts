// feat/sslcommerz-phase1-guest — POST /api/donate/sslcommerz/ipn
//
// ⚠ SECURITY-CRITICAL. This server-to-server callback is the ONLY thing that
// marks an SSLCommerz guest donation paid. The browser redirect to the success
// page proves NOTHING and never settles.
//
// Defence in depth — a donation is marked 'succeeded' only if ALL pass:
//   1. HASH VERIFY — verify_sign over the POSTed fields (+ MD5 store password).
//      Proves the POST came from SSLCommerz; a spoofed body fails here.
//   2. STATUS — the IPN status is VALID/VALIDATED (else nothing to settle).
//   3. VALIDATION API — an INDEPENDENT server-to-server call with val_id
//      returns VALID/VALIDATED. We never trust the POSTed status alone.
//   4. IDENTITY — the validated tran_id equals the IPN tran_id equals our
//      pending row's ssl_tran_id.
//   5. AMOUNT + CURRENCY — the validated amount equals the pending row's
//      amount_bdt, currency BDT. Blocks a tampered/underpaid IPN.
// Only then → markGuestDonationSucceeded (idempotent; the SAME recorder the
// Stripe webhook uses). A replayed IPN is a no-op.

import { NextResponse, type NextRequest } from "next/server";
import {
  findGuestDonationBySslTranId,
  markGuestDonationSucceeded,
} from "@/lib/guest-donations";
import {
  verifySslcommerzIpnHash,
  validateSslcommerzTransaction,
  isSslcommerzConfigured,
} from "@/lib/sslcommerz";
import { sendEmail, siteUrl } from "@/lib/email";
import { GuestDonationThankYouEmail } from "@/emails/GuestDonationThankYouEmail";

export const runtime = "nodejs";

// Amount tolerance (taka). We send integer taka; allow rounding slack only.
const AMOUNT_EPSILON = 1;

export async function POST(req: NextRequest) {
  if (!isSslcommerzConfigured()) {
    // Nothing we can validate against — ack so SSLCommerz doesn't hammer retries.
    return NextResponse.json({ received: true, note: "not_configured" });
  }

  // SSLCommerz posts application/x-www-form-urlencoded.
  let fields: Record<string, string>;
  try {
    const form = await req.formData();
    fields = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") fields[k] = v;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  // (1) HASH VERIFY — reject a body that isn't authentically from SSLCommerz.
  if (!verifySslcommerzIpnHash(fields)) {
    console.warn("[sslcommerz-ipn] hash verification FAILED — rejecting");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const tranId = fields.tran_id ?? "";
  const valId = fields.val_id ?? "";
  const status = fields.status ?? "";

  // (2) STATUS — only VALID/VALIDATED can settle. Anything else is acked and
  // ignored (never marks paid).
  if (status !== "VALID" && status !== "VALIDATED") {
    return NextResponse.json({ received: true, status });
  }
  if (!tranId || !valId) {
    console.warn("[sslcommerz-ipn] VALID status but missing tran_id/val_id");
    return NextResponse.json({ received: true, note: "missing_ids" });
  }

  // (3) VALIDATION API — independent server-to-server confirmation.
  const validation = await validateSslcommerzTransaction(valId);
  if (validation.error) {
    // Transient (network) — 500 so SSLCommerz retries the IPN.
    console.error("[sslcommerz-ipn] validation API error", validation.error);
    return NextResponse.json({ error: "validation_unavailable" }, { status: 500 });
  }
  if (!validation.ok) {
    // Definitive reject — the transaction is NOT valid per SSLCommerz.
    console.warn(
      `[sslcommerz-ipn] validation not VALID (${validation.status}) for ${tranId}`,
    );
    return NextResponse.json({ received: true, note: "not_valid" });
  }

  // (4) IDENTITY — validated tran_id must equal the IPN tran_id.
  if (validation.tranId && validation.tranId !== tranId) {
    console.warn(
      `[sslcommerz-ipn] tran_id mismatch: ipn=${tranId} validated=${validation.tranId}`,
    );
    return NextResponse.json({ received: true, note: "tran_mismatch" });
  }

  // Find OUR pending row by tran_id (the lookup key we generated at init).
  const row = await findGuestDonationBySslTranId(tranId);
  if (!row) {
    console.warn(`[sslcommerz-ipn] no guest_donation for tran_id ${tranId}`);
    return NextResponse.json({ received: true, note: "no_row" });
  }

  // (5) AMOUNT + CURRENCY — the validated amount must match what we intended to
  // charge. Blocks a spoofed/tampered/underpaid IPN from settling.
  const validatedAmount = validation.amount ?? -1;
  const expected = row.amount_bdt;
  const currencyOk = (validation.currency ?? "BDT").toUpperCase() === "BDT";
  const amountOk = Math.abs(validatedAmount - expected) <= AMOUNT_EPSILON;
  if (!currencyOk || !amountOk) {
    console.error(
      `[sslcommerz-ipn] AMOUNT/CURRENCY MISMATCH tran_id=${tranId} ` +
        `expected=${expected} BDT got=${validatedAmount} ${validation.currency}`,
    );
    return NextResponse.json({ received: true, note: "amount_mismatch" });
  }

  // ── Settle — the SAME recorder the Stripe webhook uses (idempotent) ──
  const updated = await markGuestDonationSucceeded({
    guestDonationId: row.id,
    guestEmail: validation.email || row.guest_email,
    ssl: {
      valId,
      bankTranId: validation.bankTranId ?? fields.bank_tran_id ?? null,
      cardType: validation.cardType ?? fields.card_type ?? null,
    },
  });
  if (!updated) {
    // Replay — already recorded. Idempotent no-op (no duplicate email).
    return NextResponse.json({ received: true, dedup: true });
  }

  // Warm thank-you (best-effort — mirrors the Stripe guest branch).
  const email = validation.email || row.guest_email;
  if (email) {
    try {
      const amountLabel = `${updated.donor_currency_amount ?? updated.amount_bdt} ${updated.donor_currency_code ?? "BDT"}`;
      await sendEmail({
        to: email,
        subject: "Thank you for your donation to OrphanGive",
        template: GuestDonationThankYouEmail({
          causeTitle: updated.package_title ?? "our children's fund",
          amountLabel,
          childCount: updated.child_count,
          browseUrl: siteUrl("/children"),
          signupUrl: siteUrl("/signup"),
        }),
      });
    } catch (err) {
      console.warn(
        "[sslcommerz-ipn] thank-you email failed (non-fatal)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ received: true });
}
