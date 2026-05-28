// Session 46 — DI audit_log writer + Child Detail History reader.
//
// Every DI mutation (Sessions 44 + 45 — proposals, withdrawals,
// moments, reports, deliveries, photo uploads, video uploads, plus
// Session 46's task transitions) records a row in `audit_log`.
//
// Failure mode: NEVER fail the parent operation if the audit insert
// fails. We log to console.error and swallow — the user's submission
// still succeeds, the audit miss surfaces in logs for ops to chase.
// (This is the standard rule for audit infrastructure: it must not
// be a single point of failure for legitimate user work.)
//
// Schema reality (confirmed in Session 46 discovery):
//
//   audit_log columns:
//     id            uuid PK
//     timestamp     timestamp NULLABLE  no auto-fill — set explicitly
//     actor         uuid M2O directus_users  NOT NULL
//     actor_role    string                  NOT NULL  ('data_inputter')
//     action        string                  NOT NULL  (one of AuditAction)
//     collection    string                  NULLABLE
//     record_id     string                  NULLABLE  (string, not uuid)
//     diff          json                    NULLABLE  (cast-json special)
//     ip            string                  NULLABLE
//     user_agent    text                    NULLABLE
//     metadata      json                    NULLABLE  (cast-json special)
//
// DI READ access on audit_log: deliberately NOT granted (Session
// 41-v3). The History tab on Child Detail reads via the admin token
// from the server, scope-guarded to children in the DI's care.

import "server-only";

import { createItem, readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { getDiChildById } from "./di-children";

// ─── Public types ───────────────────────────────────────────────────

export type AuditAction =
  // DI-side actions (Sessions 44-45)
  | "di_submitted_proposal"
  | "di_withdrew_proposal"
  | "di_uploaded_moment"
  | "di_submitted_report"
  // Spine 1.2 — DI resubmits a report after admin sent it back for
  // correction. status flips from 'correction_requested' back to
  // 'submitted_by_di'. Distinct from di_submitted_report so the
  // audit timeline shows the round-trip explicitly.
  | "di_resubmitted_report"
  | "di_marked_delivery"
  | "di_started_task"
  | "di_completed_task"
  | "di_uploaded_photo"
  | "di_uploaded_video"
  // Session 48b — child_intake_photo lifecycle (initial-visit
  // evidence photos). Distinct from di_uploaded_photo (which audits
  // a raw directus_files upload before the row that consumes it
  // exists).
  | "di_uploaded_intake_photo"
  | "di_edited_intake_photo"
  | "di_deleted_intake_photo"
  // Session 49 — child_document lifecycle (Tier 3 evidence
  // documents: parent death cert, child birth cert, guardian NID,
  // school recommendation). DI-side mutations all happen while the
  // row is in pending status; admin's review actions audit
  // separately under admin_* in a future session.
  | "di_uploaded_document"
  | "di_updated_document_notes"
  | "di_deleted_document"
  // Admin-side actions (Session 46-fix-2 + Session 47).
  // The DI sees these in their Recent Activity feed when the action
  // touched a child in the DI's scope.
  | "admin_approved_proposal"
  | "admin_rejected_proposal"
  // Session 51 — admin opened a proposal detail page (read-only).
  // Logged for traceability: we want to know who looked at sensitive
  // Tier 3 fields even when no mutation followed. Doesn't surface
  // on DI-facing feeds (action_role != 'data_inputter' AND no
  // childId in metadata; the per-child History tab reads di_*
  // events only).
  | "admin_viewed_proposal"
  // Session 52b — admin review queue actions for documents, intake
  // photos, and moments. View events are logged per-detail-page-load
  // (force-dynamic) for traceability; approve/reject events fire on
  // the mutation. Per-photo audits inside a batch decision each
  // get their own row.
  | "admin_viewed_document"
  | "admin_approved_document"
  | "admin_rejected_document"
  | "admin_viewed_intake_photo_batch"
  | "admin_approved_intake_photo"
  | "admin_rejected_intake_photo"
  | "admin_viewed_moment"
  | "admin_approved_moment"
  | "admin_rejected_moment"
  // Spine 1.2 — admin report review queue. Mirrors the moment review
  // shape. View events fire on detail-page load (force-dynamic);
  // claim is the explicit "I'm working on this" handoff; edit captures
  // a donor_text overwrite (length-only metadata, NEVER the text);
  // approve is the terminal-for-1.2 sign-off; correction is the
  // send-back-to-DI loop. Sending to donor (1.3) lives elsewhere.
  | "admin_viewed_report"
  | "admin_claimed_report_review"
  | "admin_approved_report"
  | "admin_edited_report_donor_text"
  | "admin_requested_report_correction"
  // Spine Lot 2 — admin publishes an approved report to the donor.
  // Status flips from 'approved' to 'published'; published_at +
  // published_by stamped; donor email fired; donor's per-sponsorship
  // Updates feed now shows the row. Donor sees the curated donor_text
  // (or DI's content as fallback when admin didn't edit), never
  // Tier-3 fields. Metadata: IDs only — NEVER the donor_text body.
  | "admin_sent_report_to_donor"
  // Session 52c — admin cleanup removes, distinct from approve /
  // reject. Admin hits these when a DI uploaded by mistake — no
  // judgement recorded, just gone. Session 52d lifts the pending-
  // only constraint; the *_removed_* variants are still for pending
  // items, the *_removed_approved_* below are for already-approved
  // items where admin had previously signed off but found a reason
  // to retract (e.g., identifying info missed at first review).
  | "admin_removed_document"
  | "admin_removed_intake_photo"
  // Session 52d — post-approval removes. The DI gets notified (a
  // previously-OK'd upload going away is news worth knowing).
  // Admin's reason is captured in the audit metadata + the DI
  // notification body.
  | "admin_removed_approved_document"
  | "admin_removed_approved_intake_photo"
  // Session 52d — admin direct uploads that bypass the DI review
  // flow (admin uploads with status='approved' immediately). Same
  // shape as a DI upload at the audit level, but with admin actor.
  | "admin_uploaded_document"
  | "admin_uploaded_intake_photo"
  // Session 65 — admin donor management.
  | "admin_viewed_donor"
  | "admin_approved_donor"
  | "admin_rejected_donor"
  | "admin_suspended_donor"
  | "admin_reactivated_donor"
  | "admin_triggered_password_reset"
  // Session 66 — admin child management.
  //   admin_viewed_child            logged on every detail page render
  //   admin_edited_child            direct edit bypassing proposal queue;
  //                                 diff stored in audit.diff (with the
  //                                 Tier 3 redaction map applied)
  //   admin_archived_child          status flip → 'withdrawn' (the
  //                                 existing terminal status; until a
  //                                 dedicated 'archived' enum value
  //                                 ships, archive maps onto withdrawn)
  //   admin_reactivated_child       status flip → 'active'
  //   admin_requested_document_reupload    DI-facing nudge to re-upload
  //   admin_requested_intake_reupload      same for intake photos
  // Re-upload events carry their reason in audit.metadata.reason +
  // the document/photo id in metadata.target_id.
  | "admin_viewed_child"
  | "admin_edited_child"
  | "admin_archived_child"
  | "admin_reactivated_child"
  | "admin_requested_document_reupload"
  | "admin_requested_intake_reupload"
  // Session 58.2 — donation_package + currency_rate admin CRUD.
  // Mahmud's edits to packages and rates land via /admin pages
  // and must be auditable for after-the-fact reconstruction (e.g.
  // "why did the GBP rate change last Tuesday?"). Every mutation
  // captures the field-level diff in audit.diff per the standard
  // pattern.
  | "admin_created_donation_package"
  | "admin_edited_donation_package"
  | "admin_archived_donation_package"
  | "admin_reactivated_donation_package"
  | "admin_edited_currency_rate"
  // Session 58.2-overnight Task 3 — bulk reorder via drag-and-drop on
  // /admin/donation-packages. Logged once per drag with the affected
  // ids + new display_order values in metadata.
  | "admin_reordered_donation_packages"
  // ─── Phase 0 — admin sponsorship lifecycle ───
  //
  // These 4 actions are ALREADY written today (raw createItem in the
  // /api/admin/sponsorships/[id]/{cancel,pause,resume,refund} routes).
  // Adding them here moves them out of the snake-case fallback in
  // formatActionLabel into the AUDIT_LABELS map (audit-labels.ts) and
  // makes them typesafe with recordAuditEvent. Action values match
  // exactly what's already in the production audit_log rows so the
  // existing reader (listAuditEventsForSponsorship) keeps finding them.
  | "admin_cancelled_sponsorship"
  | "admin_paused_sponsorship"
  | "admin_resumed_sponsorship"
  | "admin_refunded_sponsorship_charge"
  // ─── Phase 0 — donor sponsorship lifecycle ───
  //
  // NEW: previously the 8 /api/sponsorship/[id]/* endpoints wrote NO
  // audit rows (the donor flow predates the audit layer, per the
  // inline comment in admin-sponsorships.ts:700-708). The reader
  // currently triangulates "by donor" from sponsorship column
  // timestamps with no attribution. With these actions written:
  //   - timeline shows actual donor user attribution
  //   - reason / amount / visibility values land in audit.metadata
  //   - IP + user_agent captured via recordAuditEvent's standard path
  //
  // Naming: <role>_<past-tense-verb>_<entity>[_qualifier], matching
  // the existing admin_*_sponsorship convention.
  | "donor_cancelled_sponsorship"
  | "donor_paused_sponsorship"
  | "donor_resumed_sponsorship"
  | "donor_extended_sponsorship"
  | "donor_modified_sponsorship_amount"
  | "donor_changed_sponsorship_visibility"
  | "donor_cancelled_queued_sponsorship"
  | "donor_resolved_queue_shift"
  // ─── Phase 0 follow-up — Stripe webhook (actor_role=system) ───
  //
  // Attribution: every row carries actor = the seeded SYSTEM user
  // (migrations/phase-0/002-seed-system-user.mjs, env SYSTEM_USER_ID).
  // Helper: src/lib/webhook-audit.ts pre-fills the actor + role and
  // skips silently when SYSTEM_USER_ID is unset (best-effort —
  // business logic in the webhook never blocks on audit writes).
  //
  // Event → action mapping (some collapse multiple Stripe event
  // names into one accountability-meaningful row; see
  // /api/webhooks/stripe handlers):
  //   payment_intent.succeeded                      → webhook_payment_succeeded
  //   payment_intent.payment_failed
  //     + invoice.payment_failed
  //     + invoice_payment.failed                    → webhook_payment_failed
  //   invoice.payment_succeeded
  //     + invoice.paid
  //     + invoice_payment.paid                      → webhook_invoice_paid
  //   customer.subscription.created                 → webhook_subscription_created
  //   customer.subscription.deleted                 → webhook_subscription_deleted
  //   charge.refunded                               → webhook_charge_refunded
  //
  // invoice_payment.created is an informational ack we don't audit
  // (no state change).
  //
  // Metadata privacy: IDs + USD amounts only. No childId (recoverable
  // from sponsorship), no Tier-3 fields.
  | "webhook_payment_succeeded"
  | "webhook_payment_failed"
  | "webhook_invoice_paid"
  | "webhook_subscription_created"
  | "webhook_subscription_deleted"
  | "webhook_charge_refunded"
  // ─── Donation Lifecycle sub-phase 3 — admin fulfillment exception writes ───
  //
  // Admin sets the fulfillment exception axis on a sponsorship.
  // SEPARATE from sponsorship.status (payment lifecycle, Stripe-driven).
  // The 'refunded' value is NOT in this list — it's system-set by the
  // existing charge.refunded webhook and audited under
  // webhook_charge_refunded with extra refund-fulfillment metadata.
  //
  // METADATA contract (privacy):
  //   - childId, donor, sponsorshipId, exception, prior_exception
  //   - NEVER fulfillment_reason (private admin note)
  //   - NEVER fulfillment_donor_visible_reason verbatim either —
  //     we only mark whether one was provided (boolean). The text
  //     lives on the sponsorship row; the audit captures the
  //     STATE TRANSITION, not the copy.
  | "admin_set_fulfillment_on_hold"
  | "admin_set_fulfillment_disputed"
  | "admin_set_fulfillment_refund_requested"
  | "admin_cleared_fulfillment_exception"
  // ─── Spine 1.1 — Admin task creation (hop 3 of the accountability
  //                 spine, per docs/admin-os/02-spine-design.md) ───
  //
  // Admin creates a field task linked to a sponsorship (Phase 0
  // task.sponsorship FK) and assigned to a Data Inputter. Metadata
  // is IDs-only: { taskId, sponsorshipId, childId, assigneeUserId,
  //                assignedVia: 'manual' | 'auto' }.
  // No Tier-3 child fields.
  | "admin_created_task"
  // ─── P2 — reveal lifecycle audit ───
  //
  // Donor / system actions on `reveal_request` (Tier-3 access grant
  // for sponsoring donors). The admin approve/deny path is NOT here
  // because there's no API route for it today — admins decide via
  // the Directus admin UI directly. If/when an /api/admin/reveals/
  // [id]/{approve,reject} route ships, add admin_approved_reveal +
  // admin_rejected_reveal alongside.
  //
  // Metadata contract: IDs + field_name (the column name, which is
  // public allowlist) + reason. NEVER the decrypted Tier-3 value;
  // that lives encrypted on the child row and only reaches the
  // viewer through fetchRevealedFieldValues at render time.
  | "donor_requested_reveal"
  | "donor_withdrew_reveal"
  | "system_revoked_reveal"
  // Cron-driven expiry (90 days after admin approval). Distinct from
  // system_revoked_reveal so the timeline reader shows the closure
  // reason — "expired (90 days)" vs "revoked (sponsorship ended)".
  | "system_expired_reveal";

// Phase 0 — "donor" added so /api/sponsorship/[id]/* lifecycle
// endpoints can attribute the audit to the donor who initiated the
// action. ACTOR_ROLE_STYLES in audit-labels.ts already carried "donor"
// styling for a forward-looking row; this aligns the type with the
// styling. "system" is reserved for future webhook / cron audits —
// not yet used because audit_log.actor is NOT NULL today (see Phase 0
// migrations/README.md "Deferred" note).
export type ActorRole = "data_inputter" | "admin" | "system" | "donor";

export interface AuditInput {
  actorUserId: string;
  // For DI work this is always 'data_inputter' (we trust the caller —
  // the DI auth gate already proved they're a DI). Crons would pass
  // 'system' if they ever audit; admin actions would pass 'admin'.
  actorRole?: ActorRole;
  action: AuditAction;
  collection?: string;
  recordId?: string;
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  // Pulled IP + user-agent from this. The route handler passes its
  // NextRequest in; we accept Request as a wider type so the helper
  // composes with anything fetch-shaped.
  request?: Request;
}

export interface HistoryEvent {
  id: string;
  timestamp: string | null;
  actorName: string; // "You" if self, otherwise first_name or "Unknown"
  actorRole: string;
  action: AuditAction;
  // Human-readable copy for the History tab list (e.g. "You uploaded
  // a moment", "Mahmud submitted an edit proposal").
  description: string;
  // Pulled out for the panel's per-row icon.
  collection: string | null;
}

// ─── Internal helpers ───────────────────────────────────────────────

function clientIpFromRequest(req: Request | undefined): string | null {
  if (!req) return null;
  // X-Forwarded-For chain → first hop is the originating client.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // Vercel / Cloudflare specific fallbacks (production friendly).
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function userAgentFromRequest(req: Request | undefined): string | null {
  if (!req) return null;
  return req.headers.get("user-agent") ?? null;
}

// Deliberately swallow on any failure — see header.
async function safeInsertAuditRow(
  row: Record<string, unknown>,
  context: string,
): Promise<void> {
  try {
    await directusServer().request(createItem("audit_log" as never, row as never));
  } catch (err) {
    console.error("[audit] write failed", {
      context,
      action: row.action,
      collection: row.collection,
      record_id: row.record_id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Session 48a — Tier 3 redaction ─────────────────────────────────
//
// Field names whose values must NEVER appear verbatim in audit_log.diff
// or audit_log.metadata. The actor and the fact that the field changed
// stay visible (so investigations can confirm "phone was edited at
// time T by user X"); the value itself is replaced with the literal
// string "[REDACTED]".
//
// Centralized so future Tier 3 additions are a one-line add. Any
// field name that contains an admin-only PII value (phone, address,
// encrypted health detail) belongs here.

export const AUDIT_REDACTED_FIELDS = new Set<string>([
  "guardian_phone",
  "guardian_phone_alt",
]);

/**
 * Walk a diff/metadata payload and replace values for any field name
 * in AUDIT_REDACTED_FIELDS with the string "[REDACTED]". Diff entries
 * commonly look like `{ guardian_phone: { old: "+8801…", new: "+8801…" } }`
 * or `{ guardian_phone: "+8801…" }` — both shapes get redacted.
 *
 * Returns a new object; never mutates the input.
 */
export function redactAuditPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (AUDIT_REDACTED_FIELDS.has(key)) {
      // Whether the original was scalar or {old, new}, replace the
      // entire value with the redaction marker. We deliberately don't
      // preserve the {old, new} shape to avoid leaking even an
      // approximate phone number.
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ─── Public API: write ──────────────────────────────────────────────

/**
 * Insert one audit_log row capturing a DI action. Never throws —
 * audit failures must not break the user-facing submission.
 *
 * Order in callers should always be:
 *   1. Do the actual mutation (createMoment / createProposal / etc.)
 *   2. await recordAuditEvent({ ... })
 *   3. Optionally notify admin
 *   4. Return success to the client
 *
 * Session 48a: diff + metadata payloads are passed through
 * redactAuditPayload before insert, so Tier 3 fields (currently
 * guardian_phone / guardian_phone_alt) never appear verbatim in the
 * audit row.
 */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  const role: ActorRole = input.actorRole ?? "data_inputter";
  const ip = clientIpFromRequest(input.request);
  const ua = userAgentFromRequest(input.request);

  await safeInsertAuditRow(
    {
      timestamp: new Date().toISOString(),
      actor: input.actorUserId,
      actor_role: role,
      action: input.action,
      collection: input.collection ?? null,
      record_id: input.recordId ?? null,
      diff: redactAuditPayload(input.diff),
      ip,
      user_agent: ua,
      metadata: redactAuditPayload(input.metadata),
    },
    `recordAuditEvent(${input.action})`,
  );
}

// ─── Public API: read for Child Detail History ──────────────────────

const AUDIT_FIELDS = [
  "id",
  "timestamp",
  "actor",
  "actor_role",
  "action",
  "collection",
  "record_id",
  "metadata",
] as const;

type AuditRow = {
  id: string;
  timestamp: string | null;
  actor: string | null;
  actor_role: string | null;
  action: string | null;
  collection: string | null;
  record_id: string | null;
  metadata: Record<string, unknown> | null;
};

const ACTION_DESCRIPTIONS: Record<AuditAction, (actor: string) => string> = {
  di_submitted_proposal: (a) => `${a} submitted a profile-edit proposal`,
  di_withdrew_proposal: (a) => `${a} withdrew a pending proposal`,
  di_uploaded_moment: (a) => `${a} uploaded a moment`,
  di_submitted_report: (a) => `${a} submitted a report`,
  di_resubmitted_report: (a) => `${a} resubmitted a report after corrections`,
  di_marked_delivery: (a) => `${a} marked an aid delivery`,
  di_started_task: (a) => `${a} started a task`,
  di_completed_task: (a) => `${a} marked a task complete`,
  di_uploaded_photo: (a) => `${a} uploaded a photo`,
  di_uploaded_video: (a) => `${a} uploaded a video`,
  di_uploaded_intake_photo: (a) => `${a} added an intake photo`,
  di_edited_intake_photo: (a) => `${a} edited an intake photo`,
  di_deleted_intake_photo: (a) => `${a} removed an intake photo`,
  di_uploaded_document: (a) => `${a} uploaded a document`,
  di_updated_document_notes: (a) => `${a} edited a document's notes`,
  di_deleted_document: (a) => `${a} removed a document`,
  // Admin actions are described from the DI's POV — "Admin approved
  // your edit" rather than literal "Admin approved a proposal" so
  // the Recent Activity feed reads as personal news.
  admin_approved_proposal: () => `Admin approved your edit`,
  admin_rejected_proposal: () => `Admin rejected your edit`,
  // admin_viewed_proposal isn't user-facing in any DI-side feed (see
  // type definition above) — the description here is for completeness
  // / future admin-side audit log views.
  admin_viewed_proposal: (a) => `${a} opened a proposal`,
  // Session 52b — admin review queue events. Approval/rejection
  // surface in the DI's per-child History tab; view events stay
  // admin-only (mirroring admin_viewed_proposal's pattern).
  admin_viewed_document: (a) => `${a} opened a document`,
  admin_approved_document: () => `Admin approved a document`,
  admin_rejected_document: () => `Admin rejected a document`,
  admin_viewed_intake_photo_batch: (a) => `${a} opened intake photos`,
  admin_approved_intake_photo: () => `Admin approved an intake photo`,
  admin_rejected_intake_photo: () => `Admin rejected an intake photo`,
  admin_viewed_moment: (a) => `${a} opened a moment`,
  admin_approved_moment: () => `Admin approved a moment`,
  admin_rejected_moment: () => `Admin rejected a moment`,
  // Spine 1.2 — admin report review. Approval surfaces on the DI's
  // History tab; edit + correction events also surface (the DI needs
  // to see "Admin edited your donor copy" + "Admin sent back for
  // correction with reason: ..."). View / claim stay admin-only.
  admin_viewed_report: (a) => `${a} opened a report`,
  admin_claimed_report_review: (a) => `${a} claimed a report for review`,
  admin_approved_report: () => `Admin approved your report`,
  admin_edited_report_donor_text: () => `Admin edited the donor-facing copy`,
  admin_requested_report_correction: () =>
    `Admin sent your report back for correction`,
  admin_sent_report_to_donor: () => `Admin sent your report to the donor`,
  admin_removed_document: () => `Admin removed a pending document`,
  admin_removed_intake_photo: () => `Admin removed a pending intake photo`,
  admin_removed_approved_document: () =>
    `Admin removed a previously-approved document`,
  admin_removed_approved_intake_photo: () =>
    `Admin removed a previously-approved intake photo`,
  admin_uploaded_document: () => `Admin uploaded a document directly`,
  admin_uploaded_intake_photo: () => `Admin uploaded an intake photo directly`,
  // Session 65 — donor management events.
  admin_viewed_donor: (a) => `${a} opened a donor profile`,
  admin_approved_donor: (a) => `${a} approved a donor`,
  admin_rejected_donor: (a) => `${a} rejected a donor`,
  admin_suspended_donor: (a) => `${a} suspended a donor`,
  admin_reactivated_donor: (a) => `${a} reactivated a donor`,
  admin_triggered_password_reset: (a) => `${a} triggered a password reset for a donor`,
  // Session 66 — child management. View / edit / archive / reactivate
  // events never surface on DI-facing feeds (the per-child History
  // tab filters di_* actions only). The re-upload requests DO need to
  // reach the DI via the in-app notification system; the History tab
  // also renders them once we wire the description side.
  admin_viewed_child: (a) => `${a} opened a child profile`,
  admin_edited_child: () => `Admin edited the child profile`,
  admin_archived_child: () => `Admin archived this child`,
  admin_reactivated_child: () => `Admin reactivated this child`,
  admin_requested_document_reupload: () =>
    `Admin asked for a document re-upload`,
  admin_requested_intake_reupload: () =>
    `Admin asked for an intake-photo re-upload`,
  admin_created_donation_package: () => `Admin created a donation package`,
  admin_edited_donation_package: () => `Admin edited a donation package`,
  admin_archived_donation_package: () => `Admin archived a donation package`,
  admin_reactivated_donation_package: () =>
    `Admin reactivated a donation package`,
  admin_edited_currency_rate: () => `Admin updated a currency rate`,
  admin_reordered_donation_packages: () =>
    `Admin reordered donation packages`,
  // Phase 0 — admin sponsorship lifecycle (already wired in route
  // handlers; now typesafe).
  admin_cancelled_sponsorship: () => `Admin cancelled a sponsorship`,
  admin_paused_sponsorship: () => `Admin paused a sponsorship`,
  admin_resumed_sponsorship: () => `Admin resumed a sponsorship`,
  admin_refunded_sponsorship_charge: () =>
    `Admin refunded a sponsorship charge`,
  // Phase 0 — donor sponsorship lifecycle (newly wired). Phrased
  // from the per-child History feed POV for consistency with the
  // existing copy style.
  donor_cancelled_sponsorship: () => `Donor cancelled their sponsorship`,
  donor_paused_sponsorship: () => `Donor paused their sponsorship`,
  donor_resumed_sponsorship: () => `Donor resumed their sponsorship`,
  donor_extended_sponsorship: () => `Donor extended their sponsorship`,
  donor_modified_sponsorship_amount: () =>
    `Donor changed their sponsorship amount`,
  donor_changed_sponsorship_visibility: () =>
    `Donor changed their sponsorship visibility`,
  donor_cancelled_queued_sponsorship: () =>
    `Donor cancelled their queued sponsorship slot`,
  donor_resolved_queue_shift: () =>
    `Donor responded to a queue-shift decision`,
  // Phase 0 follow-up — Stripe webhook events. Actor is the SYSTEM
  // user (see src/lib/webhook-audit.ts + migrations/phase-0/002).
  // Phrased from the timeline reader's POV.
  webhook_payment_succeeded: () => `Stripe confirmed a payment succeeded`,
  webhook_payment_failed: () => `Stripe reported a payment failed`,
  webhook_invoice_paid: () => `Stripe invoice marked paid`,
  webhook_subscription_created: () => `Stripe subscription created`,
  webhook_subscription_deleted: () => `Stripe subscription ended`,
  webhook_charge_refunded: () => `Stripe charge refunded`,
  // Donation Lifecycle sub-phase 3 — admin fulfillment exception writes.
  admin_set_fulfillment_on_hold: () => `Admin paused fulfillment (on hold)`,
  admin_set_fulfillment_disputed: () => `Admin marked the delivery as disputed`,
  admin_set_fulfillment_refund_requested: () =>
    `Admin marked a refund as requested`,
  admin_cleared_fulfillment_exception: () =>
    `Admin cleared the fulfillment exception`,
  // Spine 1.1 — admin field-task creation.
  admin_created_task: (a) => `${a} created a field task`,
  // P2 — reveal lifecycle.
  donor_requested_reveal: () => `Donor requested a reveal`,
  donor_withdrew_reveal: () => `Donor withdrew a reveal request`,
  system_revoked_reveal: () => `Reveal revoked (sponsorship ended)`,
  system_expired_reveal: () => `Reveal expired (90 days elapsed)`,
};

const VALID_ACTIONS = new Set<string>(Object.keys(ACTION_DESCRIPTIONS));

function isAuditAction(s: string | null | undefined): s is AuditAction {
  return s !== null && s !== undefined && VALID_ACTIONS.has(s);
}

/**
 * Returns the chronological audit feed for events that touched a
 * specific child. Scope-guarded — if the DI can't see the child via
 * getDiChildById, returns [].
 *
 * IMPORTANT — JSON field filtering caveat. Session 46 discovery
 * confirmed Directus REST doesn't support dotted JSON-path filters
 * on `audit_log.metadata.childId` ("you don't have permission to
 * access field \"metadata.childId\""). The clean long-term fix is
 * to add a top-level `child_id` column on audit_log, but that's a
 * Session 41-v3 schema change.
 *
 * V1 workaround: pull the last `windowSize` audit rows narrowed by
 * (a) the four DI-mutation collections that carry childId in
 * metadata, plus (b) action prefix `di_*`. Then app-side filter to
 * those whose `metadata.childId` matches. With < 100 mutations per
 * day per DI, a window of 200 is safe-ish for several days of
 * history. If the per-child view starts losing rows, bump windowSize
 * and add the schema column.
 *
 * `limit` defaults to 50 — final bound on returned rows after the
 * app-side filter.
 */
const HISTORY_AUDIT_COLLECTIONS = [
  "child_proposal",
  "child_moment",
  "child_update",
  "aid_delivery",
  "task",
  // Session 48b — intake photos surface in the History tab too.
  "child_intake_photo",
  // Session 49 — documents surface in the History tab too.
  "child_document",
];

export async function listAuditEventsForChild(
  childId: string,
  userId: string,
  limit: number = 50,
): Promise<HistoryEvent[]> {
  // Scope guard.
  const child = await getDiChildById(childId, userId);
  if (!child) return [];

  // Pull a recent window of relevant DI events; filter to childId in
  // memory.
  const windowSize = Math.max(200, limit * 4);
  let rows: AuditRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("audit_log" as never, {
        filter: {
          _and: [
            { collection: { _in: HISTORY_AUDIT_COLLECTIONS } },
            // Action prefix narrowing — only DI actions, not future
            // admin or system events that might land on these
            // collections later.
            { action: { _starts_with: "di_" } },
          ],
        },
        fields: [...AUDIT_FIELDS],
        sort: ["-timestamp"],
        limit: windowSize,
      } as never),
    )) as unknown as AuditRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-audit] listAuditEventsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (rows.length === 0) return [];

  // App-side filter by metadata.childId.
  rows = rows
    .filter((r) => {
      const md = r.metadata;
      if (!md || typeof md !== "object") return false;
      return (md as Record<string, unknown>).childId === childId;
    })
    .slice(0, limit);
  if (rows.length === 0) return [];

  // Resolve actor names in one batch.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: actorIds } },
          fields: ["id", "first_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; first_name: string | null }> | undefined;
      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.first_name?.trim()) nameById.set(u.id, u.first_name.trim());
        }
      }
    } catch (err) {
      console.warn(
        "[di-audit] actor name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return rows
    .filter((r) => isAuditAction(r.action))
    .map((r) => {
      const action = r.action as AuditAction;
      const isOwn = r.actor === userId;
      const name = isOwn
        ? "You"
        : r.actor
          ? nameById.get(r.actor) ?? "Unknown"
          : "Unknown";
      const description = ACTION_DESCRIPTIONS[action](name);
      return {
        id: r.id,
        timestamp: r.timestamp,
        actorName: name,
        actorRole: r.actor_role ?? "unknown",
        action,
        description,
        collection: r.collection,
      };
    });
}

// ─── Session 47 — Recent Activity feed for the home page ────────────
//
// Surface for the DI Recent Activity panel. Two streams merged:
//   (a) Everything the DI did themselves (audit row.actor = userId).
//   (b) Admin actions on children in the DI's scope (admin_*
//       actions where metadata.childId is in the DI's children).
//
// Same window-pull-then-app-side-filter pattern as
// listAuditEventsForChild — the audit_log.metadata JSON field can't
// be filtered by sub-key directly, so we pull a recent window and
// filter in JS. With < 100 events/day per DI, a 200-row window
// covers several days easily.

// (readItems + directusServer already imported at the top of the file.)

export async function getRecentActivityForUser(
  userId: string,
  limit: number = 8,
): Promise<HistoryEvent[]> {
  // Fetch the DI's scope: the child IDs they're allowed to see admin
  // actions for. Re-uses the same scope rule as getDiChildById.
  let scopedChildIds: string[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [
            {
              _or: [
                { uploaded_by_di: { _eq: userId } },
                { assigned_di: { _eq: userId } },
              ],
            },
            { status: { _neq: "withdrawn" } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    if (Array.isArray(rows)) scopedChildIds = rows.map((r) => r.id);
  } catch (err) {
    console.warn(
      "[di-audit] getRecentActivityForUser scope read failed",
      err instanceof Error ? err.message : err,
    );
    // Fall through with empty scope — DI's own actions still surface.
  }

  // Pull a recent window of relevant events. Two parallel
  // window-fetches, then merged.
  const windowSize = Math.max(200, limit * 8);
  const [ownRows, adminRows]: [AuditRow[], AuditRow[]] = await Promise.all([
    fetchAuditWindow({ actor: { _eq: userId } }, windowSize),
    scopedChildIds.length > 0
      ? fetchAuditWindow(
          {
            _and: [
              { actor_role: { _eq: "admin" } },
              { action: { _starts_with: "admin_" } },
            ],
          },
          windowSize,
        )
      : Promise.resolve([] as AuditRow[]),
  ]);

  // App-side filter: admin rows must have metadata.childId in the
  // DI's scope. Own rows always pass.
  const filteredAdmin = adminRows.filter((r) => {
    const md = r.metadata;
    if (!md || typeof md !== "object") return false;
    const cid = (md as Record<string, unknown>).childId;
    return typeof cid === "string" && scopedChildIds.includes(cid);
  });

  // Merge + dedupe by id (a DI's own action shouldn't appear in
  // both streams, but defensive against schema drift).
  const merged = new Map<string, AuditRow>();
  for (const r of ownRows) merged.set(r.id, r);
  for (const r of filteredAdmin) merged.set(r.id, r);

  // Sort newest-first by timestamp, slice to limit.
  const sorted = Array.from(merged.values())
    .filter((r) => isAuditAction(r.action))
    .sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      return tb.localeCompare(ta);
    })
    .slice(0, limit);
  if (sorted.length === 0) return [];

  // Resolve actor names in one batch.
  const actorIds = Array.from(
    new Set(sorted.map((r) => r.actor).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: actorIds } },
          fields: ["id", "first_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; first_name: string | null }> | undefined;
      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.first_name?.trim()) nameById.set(u.id, u.first_name.trim());
        }
      }
    } catch (err) {
      console.warn(
        "[di-audit] recent activity actor name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return sorted.map((r) => {
    const action = r.action as AuditAction;
    const isOwn = r.actor === userId;
    const name = isOwn
      ? "You"
      : r.actor
        ? nameById.get(r.actor) ?? "Admin"
        : "Admin";
    return {
      id: r.id,
      timestamp: r.timestamp,
      actorName: name,
      actorRole: r.actor_role ?? "unknown",
      action,
      description: ACTION_DESCRIPTIONS[action](name),
      collection: r.collection,
    };
  });
}

async function fetchAuditWindow(
  filter: Record<string, unknown>,
  windowSize: number,
): Promise<AuditRow[]> {
  try {
    const rows = (await directusServer().request(
      readItems("audit_log" as never, {
        filter,
        fields: [...AUDIT_FIELDS],
        sort: ["-timestamp"],
        limit: windowSize,
      } as never),
    )) as unknown as AuditRow[] | undefined;
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[di-audit] fetchAuditWindow failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
