// Session 65 — Admin donor mutation helpers.
//
// One helper per action button on the donor detail page:
//   approveDonor    flips og_admin_approval_status='approved'
//   rejectDonor     flips og_admin_approval_status='rejected' + reason
//   suspendDonor    flips directus_users.status='suspended'
//   reactivateDonor flips directus_users.status='active'
//   triggerDonorPasswordReset  hands off to Directus /auth/password/request
//
// All five are thin wrappers — most of the safety lives in the route
// handlers that call them (auth gate + body validation). This module's
// job is the actual mutation + the audit row.
//
// Atomicity: Directus REST doesn't support cross-collection
// transactions. Each helper performs ONE mutation followed by a
// best-effort audit insert. If the audit fails after a successful
// mutation, we log + swallow (audit must never break a successful
// state change). The reverse — audit succeeds but mutation fails —
// can't happen here because mutation runs first.
//
// Existing guardrails that piggyback off the status flip:
//   - /api/cart/add already rejects suspended donors before creating
//     a sponsorship row (see donor-data.ts + getDonorState).
//   - proxy.ts + dashboard layout redirect suspended donors to
//     /signin?error=suspended on their next page load.
// So `suspendDonor` doesn't need to do anything else — flipping the
// account status is the entire mechanism.
//
// What suspend does NOT do:
//   - It does NOT pause / cancel existing sponsorships. Those keep
//     billing on schedule. The brief defers that decision to follow-up
//     because it's a customer-policy call (refund? prorate? just stop?)
//     and tangled with Stripe subscription lifecycle. Admin must
//     handle the per-sponsorship side via the sponsorship surface
//     (Session 61, on its own branch).

import "server-only";

import { updateUser } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";

// ─── Typed errors ───────────────────────────────────────────────────

export class DonorNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Donor not found") {
    super(message);
    this.name = "DonorNotFoundError";
  }
}

export class InvalidDonorStateError extends Error {
  readonly code = "invalid_state" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidDonorStateError";
  }
}

export class DonorWriteFailedError extends Error {
  readonly code = "write_failed" as const;
  constructor(public readonly cause?: unknown) {
    super(
      cause instanceof Error
        ? `Donor write failed: ${cause.message}`
        : "Donor write failed",
    );
    this.name = "DonorWriteFailedError";
  }
}

// ─── Internal: fetch the donor row and verify it exists ─────────────
//
// All mutation helpers re-fetch a minimal slice before writing so
// that:
//   1. We can reject early (404) when the id is bogus instead of
//      letting Directus 500 on a phantom update.
//   2. We have the current values to put in the audit row's `diff`
//      payload (admin sees old → new in the audit log).
//
// Failures are mapped to typed errors; the route handler maps those
// to HTTP statuses.

interface MinimalDonorRow {
  id: string;
  email: string | null;
  status: string | null;
  og_admin_approval_status: string | null;
}

async function fetchDonorOrThrow(donorId: string): Promise<MinimalDonorRow> {
  if (!donorId) throw new DonorNotFoundError();
  // readUser via the admin token. We don't use the SDK's typed
  // readUser because TS narrows the field type too aggressively —
  // pass through readUser-by-fields and assert the shape.
  try {
    const { readUser } = await import("@directus/sdk");
    const row = (await directusServer().request(
      readUser(donorId, {
        fields: ["id", "email", "status", "og_admin_approval_status"],
      } as never),
    )) as unknown as MinimalDonorRow | null | undefined;
    if (!row) throw new DonorNotFoundError();
    return row;
  } catch (err) {
    if (err instanceof DonorNotFoundError) throw err;
    if (looksLikeNotFound(err)) throw new DonorNotFoundError();
    throw new DonorWriteFailedError(err);
  }
}

// ─── Approve ────────────────────────────────────────────────────────

export interface ApproveDonorResult {
  donorId: string;
  approvedAt: string;
}

/**
 * Flip og_admin_approval_status='approved' and stamp
 * og_admin_approved_at=now. Idempotent: re-approving an already-
 * approved donor is a no-op write + an audit row (so we can trace
 * the "admin re-confirmed" action).
 *
 * Rejects with InvalidDonorStateError if the donor is suspended —
 * approval doesn't make sense for a suspended account, and silently
 * approving would make the next signin flow's redirect logic
 * misleading.
 */
export async function approveDonor(
  donorId: string,
  adminUserId: string,
  request?: Request,
): Promise<ApproveDonorResult> {
  const row = await fetchDonorOrThrow(donorId);
  if (row.status === "suspended") {
    throw new InvalidDonorStateError(
      "Donor is suspended; reactivate before approving.",
    );
  }
  const nowIso = new Date().toISOString();
  const previousApproval = row.og_admin_approval_status ?? "not_started";

  try {
    await directusServer().request(
      updateUser(donorId, {
        og_admin_approval_status: "approved",
        og_admin_approved_at: nowIso,
      } as never),
    );
  } catch (err) {
    throw new DonorWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_approved_donor",
    collection: "directus_users",
    recordId: donorId,
    diff: {
      og_admin_approval_status: {
        old: previousApproval,
        new: "approved",
      },
    },
    request,
  });

  return { donorId, approvedAt: nowIso };
}

// ─── Reject ─────────────────────────────────────────────────────────

export interface RejectDonorResult {
  donorId: string;
  rejectedAt: string;
}

/**
 * Flip og_admin_approval_status='rejected' and stamp the timestamp.
 * The reason is captured in the audit `metadata` payload only —
 * directus_users currently has no donor-rejection-reason column;
 * adding one would be a follow-up schema change.
 *
 * Accepts any donor state (we may need to reject a previously-
 * approved donor on a compliance review).
 */
export async function rejectDonor(
  donorId: string,
  adminUserId: string,
  reason: string,
  request?: Request,
): Promise<RejectDonorResult> {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) {
    throw new InvalidDonorStateError(
      "Rejection reason must be at least 10 characters.",
    );
  }
  if (trimmed.length > 1000) {
    throw new InvalidDonorStateError(
      "Rejection reason must be 1000 characters or fewer.",
    );
  }
  const row = await fetchDonorOrThrow(donorId);
  const nowIso = new Date().toISOString();
  const previousApproval = row.og_admin_approval_status ?? "not_started";

  try {
    await directusServer().request(
      updateUser(donorId, {
        og_admin_approval_status: "rejected",
        og_admin_approved_at: nowIso,
      } as never),
    );
  } catch (err) {
    throw new DonorWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_rejected_donor",
    collection: "directus_users",
    recordId: donorId,
    diff: {
      og_admin_approval_status: { old: previousApproval, new: "rejected" },
    },
    metadata: { reason: trimmed },
    request,
  });

  return { donorId, rejectedAt: nowIso };
}

// ─── Suspend ────────────────────────────────────────────────────────

export interface SuspendDonorResult {
  donorId: string;
  suspendedAt: string;
}

/**
 * Flip directus_users.status='suspended'. The /api/cart/add guard
 * + proxy redirect handle the downstream effects automatically (see
 * module header).
 *
 * Reason: captured in audit metadata, NOT persisted on the user row
 * (no dedicated column). When we ship a per-donor audit history
 * panel, the reason flows from there.
 */
export async function suspendDonor(
  donorId: string,
  adminUserId: string,
  reason: string,
  request?: Request,
): Promise<SuspendDonorResult> {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) {
    throw new InvalidDonorStateError(
      "Suspend reason must be at least 10 characters.",
    );
  }
  if (trimmed.length > 1000) {
    throw new InvalidDonorStateError(
      "Suspend reason must be 1000 characters or fewer.",
    );
  }
  const row = await fetchDonorOrThrow(donorId);
  if (row.status === "suspended") {
    // Idempotent — but flag the no-op so admin doesn't think they
    // suspended a fresh account.
    throw new InvalidDonorStateError("Donor is already suspended.");
  }
  const nowIso = new Date().toISOString();
  const previousStatus = row.status ?? "active";

  try {
    await directusServer().request(
      updateUser(donorId, { status: "suspended" } as never),
    );
  } catch (err) {
    throw new DonorWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_suspended_donor",
    collection: "directus_users",
    recordId: donorId,
    diff: { status: { old: previousStatus, new: "suspended" } },
    metadata: { reason: trimmed },
    request,
  });

  return { donorId, suspendedAt: nowIso };
}

// ─── Reactivate ─────────────────────────────────────────────────────

export interface ReactivateDonorResult {
  donorId: string;
  reactivatedAt: string;
}

/**
 * Flip directus_users.status back to 'active'. Symmetric to suspend.
 *
 * Reactivating does NOT change og_admin_approval_status — if the
 * donor was previously approved when admin suspended them, they
 * land back in 'approved' on reactivate. If they were 'pending' or
 * 'rejected' approval at suspend time, that state is preserved too.
 * That's intentional: admin should review approval separately.
 */
export async function reactivateDonor(
  donorId: string,
  adminUserId: string,
  request?: Request,
): Promise<ReactivateDonorResult> {
  const row = await fetchDonorOrThrow(donorId);
  if (row.status !== "suspended") {
    throw new InvalidDonorStateError(
      "Donor is not currently suspended.",
    );
  }
  const nowIso = new Date().toISOString();

  try {
    await directusServer().request(
      updateUser(donorId, { status: "active" } as never),
    );
  } catch (err) {
    throw new DonorWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_reactivated_donor",
    collection: "directus_users",
    recordId: donorId,
    diff: { status: { old: "suspended", new: "active" } },
    request,
  });

  return { donorId, reactivatedAt: nowIso };
}

// ─── Password reset trigger ────────────────────────────────────────

export interface PasswordResetTriggerResult {
  donorId: string;
  email: string;
  triggeredAt: string;
}

/**
 * Hands off to Directus's native POST /auth/password/request. Directus
 * generates a single-use token + dispatches the reset email itself.
 *
 * We do NOT use the admin token here — /auth/password/request is a
 * public endpoint that takes email only. That's deliberate: it means
 * this works the same way as the donor-side forgot-password flow,
 * so the resulting email looks identical (single reset template,
 * single Directus mailer config).
 *
 * Rate limiting: Directus enforces ~60s between requests for the
 * same email (config-dependent). We don't add a separate layer;
 * admin re-clicking the button within that window will succeed at
 * the HTTP layer but the email won't re-send. Audit still records
 * the click — admin sees they tried, can wait + retry.
 *
 * Anti-enumeration is irrelevant here (admin already knows the donor
 * exists — they're looking at the detail page). But we still soft-
 * fail on Directus errors so the action button doesn't break.
 */
export async function triggerDonorPasswordReset(
  donorId: string,
  adminUserId: string,
  request?: Request,
): Promise<PasswordResetTriggerResult> {
  const row = await fetchDonorOrThrow(donorId);
  const email = row.email?.trim() ?? "";
  if (!email) {
    throw new InvalidDonorStateError(
      "Donor has no email on file; can't send reset link.",
    );
  }

  const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!directusUrl) {
    throw new DonorWriteFailedError(
      new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined"),
    );
  }
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const resetUrl = `${siteUrl}/reset-password`;

  const nowIso = new Date().toISOString();
  let upstreamStatus = 0;
  try {
    const r = await fetch(`${directusUrl}/auth/password/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reset_url: resetUrl }),
    });
    upstreamStatus = r.status;
    if (!r.ok) {
      // Log the upstream rejection but don't throw — admin doesn't
      // need to retry on a rate-limit-style 429, and Directus's
      // password/request never returns 200 with an actual error.
      const text = await r.text().catch(() => "");
      console.warn(
        "[admin-donor-actions] password/request upstream non-OK",
        { status: r.status, body: text.slice(0, 200) },
      );
    }
  } catch (err) {
    // Network error — treat as a write failure so admin sees a real
    // error toast instead of a misleading success.
    throw new DonorWriteFailedError(err);
  }

  await recordAuditEvent({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: "admin_triggered_password_reset",
    collection: "directus_users",
    recordId: donorId,
    metadata: { upstream_status: upstreamStatus },
    request,
  });

  return { donorId, email, triggeredAt: nowIso };
}

// ─── Shared error-shape detection ───────────────────────────────────

function looksLikeNotFound(err: unknown): boolean {
  if (!err) return false;
  const errors = (err as { errors?: Array<{ extensions?: { code?: string } }> })
    .errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const code = e?.extensions?.code;
      if (code === "FORBIDDEN" || code === "ROUTE_NOT_FOUND") return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("FORBIDDEN") ||
    msg.includes("permission to access") ||
    msg.includes("not found")
  );
}
