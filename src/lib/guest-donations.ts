// feat/quick-donation — guest (no-account) pooled cause donation data layer.
//
// Backs /api/donate/guest-init, the Stripe webhook's guest branches, and the
// read-only /admin/guest-donations list. Writes ONLY the guest_donation
// collection (migrations/guest-donation/001 + 002) — fully isolated from
// sponsorship / payment / the legacy donation model. No donor FK, by design
// (the guest has no account). A nullable `child` reference (002) tags one-time
// CHILD gifts from the /sponsor flow so they're queryable per child; pooled
// cause donations (/donate/quick, the strip) leave it NULL.

import "server-only";

import { createItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

export type GuestDonationStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "disputed";

export interface GuestDonationRow {
  id: string;
  status: GuestDonationStatus | string;
  donation_package: string | null;
  cause_tag: string | null;
  package_title: string | null;
  unit_amount_bdt: number | null;
  // fix/child-support-flow — queryable child reference. Set for one-time CHILD
  // gifts (from the /sponsor flow); NULL for pooled cause donations. The
  // canonical, reportable source of truth for "which child was this gift for".
  child: string | null;
  child_count: number | null;
  amount_bdt: number;
  donor_currency_code: string | null;
  donor_currency_amount: number | null;
  guest_email: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  // feat/sslcommerz-phase1-guest — gateway discriminator + SSLCommerz txn refs.
  // Existing/Stripe rows are 'stripe' (DB default); the ssl_* fields are null
  // for them. SSLCommerz rows set gateway='sslcommerz' + the ssl_* ids.
  gateway: string | null;
  ssl_tran_id: string | null;
  ssl_val_id: string | null;
  ssl_bank_tran_id: string | null;
  ssl_card_type: string | null;
  paid_at: string | null;
  created_at: string | null;
}

const FIELDS = [
  "id",
  "status",
  "donation_package",
  "cause_tag",
  "package_title",
  "unit_amount_bdt",
  "child",
  "child_count",
  "amount_bdt",
  "donor_currency_code",
  "donor_currency_amount",
  "guest_email",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "gateway",
  "ssl_tran_id",
  "ssl_val_id",
  "ssl_bank_tran_id",
  "ssl_card_type",
  "paid_at",
  "created_at",
] as const;

// ─── Create (guest-init) ────────────────────────────────────────────

export async function createPendingGuestDonation(input: {
  donationPackageId: string;
  causeTag: string | null;
  packageTitle: string;
  unitAmountBdt: number | null;
  /** One-time CHILD gift target (queryable). NULL for pooled cause donations. */
  childId: string | null;
  childCount: number | null;
  amountBdt: number;
  donorCurrencyCode: string;
  donorCurrencyAmount: number;
  /**
   * feat/sslcommerz-phase1-guest — payment gateway. Defaults to 'stripe' so the
   * existing Stripe caller (guest-init) is byte-for-byte unchanged. The
   * SSLCommerz init passes 'sslcommerz' + a unique sslTranId (the IPN key).
   */
  gateway?: "stripe" | "sslcommerz";
  sslTranId?: string | null;
  /** Guest email collected up-front (SSLCommerz path); null for Stripe (its
   *  hosted Checkout collects it and the webhook stamps it later). */
  guestEmail?: string | null;
}): Promise<string> {
  const created = (await directusServer().request(
    createItem("guest_donation" as never, {
      status: "pending",
      donation_package: input.donationPackageId,
      cause_tag: input.causeTag,
      package_title: input.packageTitle,
      unit_amount_bdt: input.unitAmountBdt,
      child: input.childId,
      child_count: input.childCount,
      amount_bdt: input.amountBdt,
      donor_currency_code: input.donorCurrencyCode,
      donor_currency_amount: input.donorCurrencyAmount,
      // Additive: absent for the Stripe caller → DB default 'stripe'.
      gateway: input.gateway ?? "stripe",
      ssl_tran_id: input.sslTranId ?? null,
      ...(input.guestEmail ? { guest_email: input.guestEmail } : {}),
    } as never),
  )) as unknown as { id?: string } | undefined;
  const id = created?.id;
  if (!id) throw new Error("guest_donation insert returned no id");
  return String(id);
}

/** Stamp the Checkout Session id after the session is created. */
export async function attachCheckoutSession(
  guestDonationId: string,
  sessionId: string,
): Promise<void> {
  await directusServer().request(
    updateItem("guest_donation" as never, guestDonationId as never, {
      stripe_checkout_session_id: sessionId,
    } as never),
  );
}

// ─── Webhook branches ───────────────────────────────────────────────

async function readById(id: string): Promise<GuestDonationRow | null> {
  try {
    const rows = (await directusServer().request(
      readItems("guest_donation" as never, {
        filter: { id: { _eq: id } },
        fields: [...FIELDS],
        limit: 1,
      } as never),
    )) as unknown as GuestDonationRow[] | undefined;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch (err) {
    console.warn(
      "[guest-donations] readById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Guest branch of checkout.session.completed. Idempotent: a replayed
 * event finds status already 'succeeded' and no-ops. Returns the fresh
 * row (for the thank-you email) or null when nothing was updated.
 */
export async function markGuestDonationSucceeded(input: {
  guestDonationId: string;
  /** Stripe PI (Stripe caller). Undefined for the SSLCommerz path. */
  paymentIntentId?: string | null;
  guestEmail: string | null;
  /**
   * feat/sslcommerz-phase1-guest — SSLCommerz settlement refs. Present only for
   * the SSLCommerz IPN caller. Both gateways funnel through THIS one recorder
   * so success handling never forks. Idempotent via the status check below.
   */
  ssl?: {
    valId?: string | null;
    bankTranId?: string | null;
    cardType?: string | null;
  };
}): Promise<GuestDonationRow | null> {
  const row = await readById(input.guestDonationId);
  if (!row) {
    console.warn(
      `[guest-donations] succeeded: no row ${input.guestDonationId}`,
    );
    return null;
  }
  if (row.status === "succeeded") return null; // replay — already recorded
  const patch: Record<string, unknown> = {
    status: "succeeded",
    paid_at: new Date().toISOString(),
  };
  // Stripe ref — set exactly as before when the Stripe caller provides it
  // (byte-for-byte); omitted entirely for SSLCommerz.
  if (input.paymentIntentId !== undefined) {
    patch.stripe_payment_intent_id = input.paymentIntentId;
  }
  // SSLCommerz refs.
  if (input.ssl) {
    if (input.ssl.valId !== undefined) patch.ssl_val_id = input.ssl.valId;
    if (input.ssl.bankTranId !== undefined)
      patch.ssl_bank_tran_id = input.ssl.bankTranId;
    if (input.ssl.cardType !== undefined) patch.ssl_card_type = input.ssl.cardType;
  }
  // Email — only when we actually have one, so an IPN without an email can't
  // clobber a form-collected address. (Stripe still sets it from customer_details.)
  if (input.guestEmail) patch.guest_email = input.guestEmail;

  await directusServer().request(
    updateItem("guest_donation" as never, input.guestDonationId as never, patch as never),
  );
  return { ...row, ...patch } as GuestDonationRow;
}

/**
 * feat/sslcommerz-phase1-guest — look up a pending guest donation by OUR
 * SSLCommerz tran_id (the IPN/return lookup key). Mirrors
 * findGuestDonationByPaymentIntent for the Stripe path.
 */
export async function findGuestDonationBySslTranId(
  sslTranId: string,
): Promise<GuestDonationRow | null> {
  try {
    const rows = (await directusServer().request(
      readItems("guest_donation" as never, {
        filter: { ssl_tran_id: { _eq: sslTranId } },
        fields: [...FIELDS],
        limit: 1,
      } as never),
    )) as unknown as GuestDonationRow[] | undefined;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch (err) {
    console.warn(
      "[guest-donations] findBySslTranId failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Look up a guest donation by its PaymentIntent (refund/dispute paths). */
export async function findGuestDonationByPaymentIntent(
  paymentIntentId: string,
): Promise<GuestDonationRow | null> {
  try {
    const rows = (await directusServer().request(
      readItems("guest_donation" as never, {
        filter: { stripe_payment_intent_id: { _eq: paymentIntentId } },
        fields: [...FIELDS],
        limit: 1,
      } as never),
    )) as unknown as GuestDonationRow[] | undefined;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch (err) {
    console.warn(
      "[guest-donations] findByPaymentIntent failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Refund / dispute status flip. Idempotent (skip when already there). */
export async function setGuestDonationStatus(
  guestDonationId: string,
  status: "refunded" | "disputed" | "failed",
): Promise<void> {
  await directusServer().request(
    updateItem("guest_donation" as never, guestDonationId as never, {
      status,
    } as never),
  );
}

// ─── Admin list (read-only) ─────────────────────────────────────────

export async function listGuestDonations(
  limit = 200,
): Promise<GuestDonationRow[]> {
  try {
    const rows = (await directusServer().request(
      readItems("guest_donation" as never, {
        fields: [...FIELDS],
        sort: ["-created_at"],
        limit,
      } as never),
    )) as unknown as GuestDonationRow[] | undefined;
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[guest-donations] listGuestDonations failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
