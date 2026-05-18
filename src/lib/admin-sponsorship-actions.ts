// Session 61 — Shared helper for admin sponsorship action routes.
//
// Mirror of the donor side's `authedSponsorship` in
// sponsorship-actions.ts, but for the admin token. Reads:
//   - admin session via requireAdminUser
//   - sponsorship row via getSponsorshipById (no scope filter — admin
//     sees everything)
// Returns a typed envelope so the route handler can return early
// on the unauthorized / not-found / invalid-id paths uniformly.
//
// Also includes a tiny helper to look up the child id / display
// name needed for the notification email body across multiple
// action paths.

import "server-only";

import { NextResponse } from "next/server";
import { readItem, readItems } from "@directus/sdk";
import { requireAdminUser, type AdminSession } from "./admin-auth";
import { directusServer } from "./directus";
import type { Sponsorship } from "./sponsorship-data";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same FULL_FIELDS as sponsorship-data.ts uses for the donor's
// detail page — copy-pasted here to avoid exporting / re-importing
// the array (kept small and intentional).
const ADMIN_FULL_FIELDS = [
  "id",
  "donor",
  "payment_mode",
  "amount_usd",
  "currency",
  "status",
  "stripe_subscription_id",
  "stripe_payment_intent_id",
  "stripe_customer_id",
  "started_at",
  "ended_at",
  "cancelled_at",
  "next_billing_date",
  "total_paid_usd",
  "payment_count",
  "date_created",
  "checkout_fingerprint",
  "cancellation_reason",
  "paused_at",
  "modified_at",
  "modification_history",
  "duration_months",
  "payment_schedule",
  "prepaid_months_total",
  "prepaid_months_remaining",
  "scheduled_end_date",
  "cancellation_scheduled_at",
  "cause",
  "visibility",
  "queue_position",
  "queued_starts_at",
  "queued_ends_at",
  "queue_status",
  "shift_decision_required",
  "shift_decision_required_at",
  "shift_decision",
  "shift_decision_at",
  "child.id",
  "child.display_name",
  "child.Photo",
  "child.date_of_birth",
  "child.bd_district.name",
  "child.status",
] as const;

export type AdminSponsorshipActionContext = {
  admin: AdminSession;
  sponsorship: Sponsorship;
};

export type AdminSponsorshipActionResult =
  | { ok: true; ctx: AdminSponsorshipActionContext }
  | { ok: false; response: NextResponse };

/**
 * Resolve the admin session + sponsorship row for an action route.
 * Returns 404 for malformed id (don't reveal a lookup) and not-
 * found, 401 when admin isn't signed in. Mirrors the donor helper's
 * shape so route handlers feel symmetric.
 */
export async function authedAdminSponsorship(
  rawId: string | undefined,
): Promise<AdminSponsorshipActionResult> {
  if (!rawId || !UUID_RE.test(rawId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  const admin = await requireAdminUser();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  let row: Sponsorship | null = null;
  try {
    row = (await directusServer().request(
      readItem("sponsorship" as never, rawId as never, {
        fields: [...ADMIN_FULL_FIELDS],
      } as never),
    )) as unknown as Sponsorship | null;
  } catch (err) {
    // FORBIDDEN from Directus also lands here — treat as not-found
    // so an admin token mis-config doesn't expose existence to a
    // potential leak path. The audit will surface the real cause
    // server-side.
    console.warn(
      "[admin-sponsorship-actions] readItem failed",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }

  return { ok: true, ctx: { admin, sponsorship: row } };
}

/**
 * Unwrap the child id off a sponsorship row (Directus M2O expansion
 * leaves it as either a string or an inlined object depending on
 * the fields list). Used by the email-composition paths.
 */
export function unwrapChildId(s: Sponsorship): string | null {
  if (!s.child) return null;
  if (typeof s.child === "string") return s.child;
  return s.child.id ?? null;
}

/**
 * Fetch donor info needed to address an email — the action routes
 * only have the donor uuid on `sponsorship.donor`. We don't include
 * the donor in the readItem fields above because Directus expansion
 * on directus_users via the SDK has historically been flaky for the
 * fields we need.
 */
export type AdminEmailDonor = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

export async function fetchDonorForEmail(
  donorId: string,
): Promise<AdminEmailDonor | null> {
  if (!donorId) return null;
  try {
    const rows = (await directusServer().request(
      readItems("directus_users" as never, {
        filter: { id: { _eq: donorId } },
        fields: ["id", "first_name", "last_name", "email"],
        limit: 1,
      } as never),
    )) as unknown as AdminEmailDonor[] | undefined;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn(
      "[admin-sponsorship-actions] fetchDonorForEmail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
