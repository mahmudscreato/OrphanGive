// feat/donor-account-deactivation — donor-initiated account deactivation.
//
// REVERSIBLE, NOT DELETE. Deactivation flips directus_users.status →
// 'suspended' (the same reversible flag admin moderation uses — Directus
// blocks login for any non-active status, getDonorState maps 'suspended' →
// blocked, and support reactivates via the existing admin reactivateDonor).
// No data is erased; no schema change. The deactivation TIME is captured in
// the audit row (donor_deactivated_account).
//
// BLOCKED while the donor has any active/paused sponsorship — enforced here
// (server-side) so a stale UI or a direct API call can't bypass it. The
// check FAILS CLOSED: any error verifying sponsorships aborts deactivation.

import "server-only";

import { readItems, updateUser } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";

// Raised when the donor still has active/paused sponsorships (→ 409).
export class HasActiveSponsorshipsError extends Error {
  readonly code = "active_sponsorships" as const;
  constructor(public readonly count: number) {
    super(
      "You have active sponsorships. Please cancel or end them before deactivating.",
    );
    this.name = "HasActiveSponsorshipsError";
  }
}

// Raised when the account can't be deactivated for a non-block reason
// (verification/query failure or the status write failing). Fails closed —
// the donor stays active.
export class DeactivationFailedError extends Error {
  readonly code = "deactivation_failed" as const;
  constructor(cause?: unknown) {
    super("Could not deactivate the account.");
    this.name = "DeactivationFailedError";
    if (cause instanceof Error) this.stack = cause.stack;
  }
}

/**
 * Count the donor's BLOCKING sponsorships (status active or paused). Mirrors
 * the donor-scoped filter getDonorSponsorships uses, but THROWS on a query
 * error instead of swallowing it — so the caller can fail closed (the
 * shared reader returns [] on error, which would be fail-OPEN and unsafe for
 * a gate). Queued rows carry status='active', so a pending queue slot also
 * blocks — the donor must resolve it first.
 */
export async function countBlockingSponsorships(
  donorId: string,
): Promise<number> {
  const rows = (await directusServer().request(
    readItems("sponsorship" as never, {
      filter: {
        _and: [
          { donor: { _eq: donorId } },
          { status: { _in: ["active", "paused"] } },
        ],
      },
      fields: ["id"],
      limit: -1,
    } as never),
  )) as unknown as Array<{ id: string }> | undefined;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Deactivate the donor's OWN account. Order:
 *   1. Fail-closed block check (throws on any error → not deactivated).
 *   2. Flip status → 'suspended' (reversible).
 *   3. Best-effort audit (never blocks the state change).
 *
 * Throws HasActiveSponsorshipsError (blocked) or DeactivationFailedError
 * (verification/write failure — fail closed). Caller (route) ends the
 * session + sends the confirmation email.
 */
export async function deactivateOwnDonorAccount(
  donorId: string,
  request?: Request,
): Promise<{ deactivatedAt: string }> {
  // 1. Block check — FAIL CLOSED. A thrown query error must NOT deactivate.
  let blocking: number;
  try {
    blocking = await countBlockingSponsorships(donorId);
  } catch (err) {
    console.error(
      "[donor-account-actions] block check failed — refusing to deactivate",
      err instanceof Error ? err.message : err,
    );
    throw new DeactivationFailedError(err);
  }
  if (blocking > 0) throw new HasActiveSponsorshipsError(blocking);

  // 2. Flip status → 'suspended' (reversible; Directus blocks login) AND
  //    stamp og_deactivated_at = now. The status is what gates login (kept
  //    identical to admin suspension so every existing 'suspended' check
  //    still fires); the timestamp is the read-only marker that lets admin
  //    surfaces distinguish "deactivated by donor" from an admin suspend
  //    (which leaves it null). Reactivation clears it.
  const nowIso = new Date().toISOString();
  try {
    await directusServer().request(
      updateUser(donorId as never, {
        status: "suspended",
        og_deactivated_at: nowIso,
      } as never),
    );
  } catch (err) {
    console.error(
      "[donor-account-actions] status write failed",
      err instanceof Error ? err.message : err,
    );
    throw new DeactivationFailedError(err);
  }

  // 3. Audit (best-effort). The timestamp IS the "deactivated at" record.
  await recordAuditEvent({
    actorUserId: donorId,
    actorRole: "donor",
    action: "donor_deactivated_account",
    collection: "directus_users",
    recordId: donorId,
    diff: { status: { old: "active", new: "suspended" } },
    request,
  });

  return { deactivatedAt: nowIso };
}
