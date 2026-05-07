import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readMe, readUser } from "@directus/sdk";
import { directusServer } from "./directus";
import { ACCESS_COOKIE, getServerDirectus } from "./directus-server";

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
  // Account-creation timestamp from Directus's standard user metadata;
  // used as the "Member since" line on the profile page.
  date_created: string | null;
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
export async function getCurrentDonor(): Promise<Donor | null> {
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

  // 2) Server-token fetch of full user row (Donor policy can't read og_*).
  //
  // We split the fetch into two passes:
  //   • Required fields — always fetchable, drives the auth state machine.
  //   • Optional fields — added by post-launch migrations (e.g.
  //     og_profile_photo_url from Session 13.5c Part B). If the running
  //     Directus schema doesn't have those columns yet (migration not yet
  //     applied in this environment), the secondary fetch is silently
  //     dropped and the donor object reports those fields as null.
  // This keeps auth working through forward-compatible deploys.
  const REQUIRED_FIELDS = [
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
    "date_created",
  ] as const;
  const OPTIONAL_FIELDS = ["og_profile_photo_url"] as const;

  try {
    let row = (await directusServer().request(
      readUser(userId, {
        fields: [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS],
      } as never),
    ).catch(async () => {
      // Likely cause: the optional column doesn't exist in this Directus
      // schema yet. Fall back to the required fields only.
      console.warn(
        "[donor-data] full-field readUser failed; falling back to required-only set. Did you forget to run migrations/2026-05-08-add-og-profile-photo-url.sql?",
      );
      return (await directusServer().request(
        readUser(userId, { fields: [...REQUIRED_FIELDS] } as never),
      )) as Record<string, unknown> | null;
    })) as Record<string, unknown> | null;
    if (!row) row = null;

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
      date_created: (row.date_created as string | null) ?? null,
    };
  } catch (err) {
    console.warn(
      "[donor-data] server-token fetch failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
