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
  paymentIntentId: string | null;
  guestEmail: string | null;
}): Promise<GuestDonationRow | null> {
  const row = await readById(input.guestDonationId);
  if (!row) {
    console.warn(
      `[guest-donations] succeeded: no row ${input.guestDonationId}`,
    );
    return null;
  }
  if (row.status === "succeeded") return null; // replay — already recorded
  const patch = {
    status: "succeeded",
    stripe_payment_intent_id: input.paymentIntentId,
    guest_email: input.guestEmail,
    paid_at: new Date().toISOString(),
  };
  await directusServer().request(
    updateItem("guest_donation" as never, input.guestDonationId as never, patch as never),
  );
  return { ...row, ...patch } as GuestDonationRow;
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
