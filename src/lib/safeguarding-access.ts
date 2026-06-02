// Safeguarding access gate — FOUNDER / SAFEGUARDING-LEAD ONLY.
//
// The safeguarding_report collection is the most sensitive data in the
// system. Access is locked two ways:
//   1. DB (Directus): the collection grants NO user policy any access, so
//      no logged-in Admin/DI/Donor can read it directly — only the
//      full-access server token (the app) can.
//   2. App (this file): every safeguarding page + API must pass
//      requireSafeguardingLead(), which admits ONLY a valid admin session
//      whose Directus user id is in the SAFEGUARDING_LEAD_USER_IDS
//      allowlist.
//
// FAIL-CLOSED: if SAFEGUARDING_LEAD_USER_IDS is unset/empty, the allowlist
// is empty and NOBODY passes — including Super Admins. A misconfiguration
// denies access rather than leaking reports. Set the env to the founder's
// Directus user id (comma-separated for multiple leads later).

import "server-only";

import { getAdminSession, type AdminSession } from "./admin-auth";

/** Parse SAFEGUARDING_LEAD_USER_IDS into a trimmed, non-empty id set. */
export function safeguardingLeadIds(): ReadonlySet<string> {
  return new Set(
    (process.env.SAFEGUARDING_LEAD_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/** True iff the session belongs to a configured safeguarding lead.
 *  Empty allowlist → always false (fail-closed). */
export function isSafeguardingLead(
  session: { userId?: string | null } | null | undefined,
): boolean {
  const id = session?.userId;
  if (!id) return false;
  const allow = safeguardingLeadIds();
  if (allow.size === 0) return false; // fail-closed
  return allow.has(id);
}

/**
 * Returns the admin session ONLY when the caller is a configured
 * safeguarding lead; otherwise null. Mirrors requireSuperAdminUser's
 * shape so callers (pages → redirect, APIs → 403) handle null uniformly.
 *
 * Note: a valid admin session is required AND the user id must be
 * allowlisted. A Super Admin who is NOT in the allowlist is denied — this
 * is founder-only, not all-admins.
 */
export async function requireSafeguardingLead(): Promise<AdminSession | null> {
  const session = await getAdminSession();
  if (!session) return null;
  if (!isSafeguardingLead(session)) return null;
  return session;
}
