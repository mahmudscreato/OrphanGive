import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readMe, readUser } from "@directus/sdk";
import { directusServer } from "./directus";
import { ACCESS_COOKIE, getServerDirectus } from "./directus-server";

// ─── Field sets for getCurrentDonor ──────────────────────────────────────────
//
// FULL_FIELDS: any field added here must ALSO be added to the
// donor access policy in Directus admin, otherwise the primary
// fetch will fail and the fallback will activate.
const FULL_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "status",
  "og_country",
  "og_phone",
  "og_admin_approval_status",
  "og_admin_approved_at",
  "og_agreed_to_terms_at",
  "last_access",
  "og_stripe_customer_id",
  "og_profile_photo_url",
] as const;

// SAFE_FALLBACK_FIELDS: must only contain fields known to be
// permitted by the donor access policy. Adding a restricted
// field here defeats the entire fallback mechanism.
const SAFE_FALLBACK_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "status",
  "og_country",
  "og_phone",
  "og_admin_approval_status",
] as const;

// ─── Donor shape ─────────────────────────────────────────────────────────────
export type Donor = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  og_country: string | null;
  og_phone: string | null;
  og_admin_approval_status: "pending" | "approved" | "rejected" | string;
  og_admin_approved_at: string | null;
  og_agreed_to_terms_at: string | null;
  last_access: string | null;
  // Cloudinary secure_url for the donor's avatar; null until they
  // upload one. See migrations/2026-05-08-add-og-profile-photo-url.sql.
  og_profile_photo_url: string | null;
  // Stripe Customer id, set on first checkout. Used by /dashboard/billing
  // to read saved payment methods and to gate the Customer Portal.
  og_stripe_customer_id: string | null;
};

// ─── State machine ───────────────────────────────────────────────────────────
//
// Two independent fields drive auth state:
//   directus_users.status                  ('draft' | 'active' | 'suspended' | …)
//   directus_users.og_admin_approval_status ('pending' | 'approved' | 'rejected')
//
// The matrix below is the single source of truth — derived in
// `getDonorState`. Pages and the proxy both consume this.
export type DonorState =
  | "unauthenticated"
  | "pending_verification"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "suspended";

export function getDonorState(donor: Donor | null): DonorState {
  if (!donor) return "unauthenticated";

  // Suspended trumps everything else.
  if (donor.status === "suspended") return "suspended";

  // 'draft' = newly registered, OTP not yet verified.
  // (Some legacy migration data may use literal 'pending_email_verification'.)
  if (donor.status === "draft" || donor.status === "pending_email_verification") {
    return "pending_verification";
  }

  // From here we treat status as effectively 'active'. og_admin_approval_status
  // is the second gate.
  switch (donor.og_admin_approval_status) {
    case "rejected":
      return "rejected";
    case "approved":
      return "approved";
    case "pending":
    default:
      return "pending_approval";
  }
}

// ─── Fetch current donor ─────────────────────────────────────────────────────
//
// Two-step fetch by design:
//   1. Validate the donor's bearer token via /users/me with their cookie
//      → returns id when token is valid, errors otherwise.
//   2. Re-fetch the full user row via the server token → bypasses the
//      Donor policy's empty allow-list on directus_users so we can see
//      og_* fields needed for state computation.
//
// Step 1 ensures we never trust a forged cookie. Step 2 gets all fields.
//
// Never call this with a path other than the donor's own row — the
// caller's id is the only id we accept.
//
// Session 15b1 perf — wrapped in React.cache() so multiple call
// sites within a single render (layout + page + nested components)
// share one Directus round-trip. cache() is request-scoped: each
// new HTTP request gets a fresh cache, so cross-request leakage
// is impossible. No effect on runtime correctness; just dedup.
export const getCurrentDonor = cache(_getCurrentDonor);

async function _getCurrentDonor(): Promise<Donor | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  // 1) Validate token + extract id
  let userId: string;
  try {
    const userClient = getServerDirectus(accessToken);
    const me = (await userClient.request(readMe({ fields: ["id"] }))) as {
      id?: string;
    };
    if (!me?.id) return null;
    userId = me.id;
  } catch {
    return null;
  }

  // 2) Server-token fetch of the full user row.
  //
  // Primary path: FULL_FIELDS. If a single field in that list is rejected
  // by the donor access policy (or doesn't exist in the schema yet for a
  // mid-migration deploy), the WHOLE request 4xx's and we fall back to
  // SAFE_FALLBACK_FIELDS — the minimal set known to be readable. Fields
  // not in the fallback come back as null in the Donor object, which is
  // fine for the auth state machine; downstream UIs (profile / billing)
  // already render gracefully when their fields are null.
  let row: Record<string, unknown> | null = null;
  try {
    row = (await directusServer().request(
      readUser(userId, { fields: [...FULL_FIELDS] } as never),
    )) as Record<string, unknown> | null;
  } catch (err) {
    const { message, status } = describeDirectusError(err);
    console.warn(
      `[donor-data] full-field readUser failed for ${userId}: ${message} (status=${status})`,
    );
    try {
      row = (await directusServer().request(
        readUser(userId, { fields: [...SAFE_FALLBACK_FIELDS] } as never),
      )) as Record<string, unknown> | null;
    } catch (err2) {
      const { message: m2, status: s2 } = describeDirectusError(err2);
      console.error(
        `[donor-data] fallback readUser ALSO failed for ${userId}: ${m2} (status=${s2})`,
      );
      return null;
    }
  }

  if (!row || typeof row !== "object") return null;

  return {
    id: String(row.id ?? userId),
    email: String(row.email ?? ""),
    first_name: (row.first_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    status: String(row.status ?? ""),
    og_country: (row.og_country as string | null) ?? null,
    og_phone: (row.og_phone as string | null) ?? null,
    og_admin_approval_status: String(row.og_admin_approval_status ?? "pending"),
    og_admin_approved_at: (row.og_admin_approved_at as string | null) ?? null,
    og_agreed_to_terms_at: (row.og_agreed_to_terms_at as string | null) ?? null,
    last_access: (row.last_access as string | null) ?? null,
    og_profile_photo_url:
      (row.og_profile_photo_url as string | null) ?? null,
    og_stripe_customer_id:
      (row.og_stripe_customer_id as string | null) ?? null,
  };
}

// Best-effort extraction of human-readable error message + HTTP status
// from whatever the Directus SDK throws. The SDK doesn't expose a
// stable shape, so we look in the most likely places and fall back to
// "unknown" for status when nothing matches.
function describeDirectusError(err: unknown): {
  message: string;
  status: string;
} {
  let message = "(no message)";
  let status = "unknown";

  if (err && typeof err === "object") {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (Array.isArray(errors) && errors[0]?.message) {
      message = errors[0].message;
    } else if (err instanceof Error) {
      message = err.message;
    }

    const response = (err as { response?: { status?: number } }).response;
    if (response && typeof response.status === "number") {
      status = String(response.status);
    } else {
      const direct = (err as { status?: number }).status;
      if (typeof direct === "number") status = String(direct);
    }
  } else if (err instanceof Error) {
    message = err.message;
  }

  return { message, status };
}

// ─── Guard for routes that require approval ──────────────────────────────────
//
// Use only on routes that strictly need 'approved' state (e.g. /sponsor/*).
// The dashboard does NOT call this — it handles every state explicitly.
export async function requireApprovedDonor(): Promise<Donor> {
  const donor = await getCurrentDonor();
  const state = getDonorState(donor);
  switch (state) {
    case "approved":
      return donor!;
    case "unauthenticated":
      redirect("/signin?next=/dashboard");
    case "pending_verification":
      redirect(`/signup/verify?email=${encodeURIComponent(donor?.email ?? "")}`);
    case "suspended":
      redirect("/signin?error=suspended");
    case "rejected":
      redirect("/dashboard/rejected");
    case "pending_approval":
      redirect("/dashboard");
  }
  // Unreachable; redirect() throws.
  redirect("/signin");
}
