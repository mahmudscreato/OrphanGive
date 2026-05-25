// Session 67 — Centralised display helpers for the admin audit log
// viewer.
//
// Three concerns in one module:
//   1. AUDIT_LABELS                  raw action string → "Approved
//                                     proposal" style human label
//   2. ACTOR_ROLE_LABELS             "data_inputter" → "Data inputter"
//                                     style, with a matching pill colour
//   3. resolveAuditSubjectLink(...)  collection + record_id (+
//                                     metadata.childId fallback) → an
//                                     internal admin URL or null
//
// `formatActionLabel` is the public formatter; pages and panels call
// it instead of pulling AUDIT_LABELS directly so the fallback is
// consistent (raw_snake_case → "Raw snake case"). Same for the
// role + subject link helpers.
//
// Why centralise: the per-entity panels (admin-children's audit
// pane, future per-donor / per-proposal panels) and the global
// admin audit viewer would otherwise drift in formatting. The
// audit log is forensic — drift here erodes confidence.

// ─── Action labels ──────────────────────────────────────────────────
//
// Every action the codebase actually writes (verified by grep over
// `recordAuditEvent({ ... action: "..." })` in src/) plus the actions
// the AuditAction union declares but no caller writes yet (kept for
// stability so a future caller adding the wire doesn't see a "Raw
// snake case" fallback the day it ships).
//
// Order below mirrors di-audit.ts's AuditAction union for ease of
// cross-reference; new entries should be added in both places.

export const AUDIT_LABELS: Record<string, string> = {
  // ─── DI actions (Sessions 44–49) ───
  di_submitted_proposal: "Submitted proposal",
  di_withdrew_proposal: "Withdrew proposal",
  di_uploaded_moment: "Uploaded moment",
  di_submitted_report: "Submitted report",
  di_marked_delivery: "Marked aid delivery",
  di_started_task: "Started task",
  di_completed_task: "Completed task",
  di_uploaded_photo: "Uploaded photo",
  di_uploaded_video: "Uploaded video",
  di_uploaded_intake_photo: "Uploaded intake photo",
  di_edited_intake_photo: "Edited intake photo",
  di_deleted_intake_photo: "Deleted intake photo",
  di_uploaded_document: "Uploaded document",
  di_updated_document_notes: "Updated document notes",
  di_deleted_document: "Deleted document",

  // ─── Admin actions (Sessions 46–52) ───
  admin_approved_proposal: "Approved proposal",
  admin_rejected_proposal: "Rejected proposal",
  admin_viewed_proposal: "Viewed proposal",
  admin_viewed_document: "Viewed document",
  admin_approved_document: "Approved document",
  admin_rejected_document: "Rejected document",
  admin_viewed_intake_photo_batch: "Viewed intake photos",
  admin_approved_intake_photo: "Approved intake photo",
  admin_rejected_intake_photo: "Rejected intake photo",
  admin_viewed_moment: "Viewed moment",
  admin_approved_moment: "Approved moment",
  admin_rejected_moment: "Rejected moment",
  admin_removed_document: "Removed pending document",
  admin_removed_intake_photo: "Removed pending intake photo",
  admin_removed_approved_document: "Removed approved document",
  admin_removed_approved_intake_photo: "Removed approved intake photo",
  admin_uploaded_document: "Uploaded document directly (admin)",
  admin_uploaded_intake_photo: "Uploaded intake photo directly (admin)",

  // ─── Session 58.2+ — donation_package + currency_rate admin ───
  admin_created_donation_package: "Created donation package",
  admin_edited_donation_package: "Edited donation package",
  admin_archived_donation_package: "Archived donation package",
  admin_reactivated_donation_package: "Reactivated donation package",
  admin_reordered_donation_packages: "Reordered donation packages",
  admin_edited_currency_rate: "Edited currency rate",

  // ─── System / cron (Session 14.7-ish + 46+) ───
  system_expired_proposal: "Expired stale proposal (cron)",

  // ─── Phase 0 — sponsorship lifecycle (admin + donor) ───
  //
  // Admin actions (already written today via raw createItem in
  // /api/admin/sponsorships/[id]/*) — these labels remove the
  // snake-case fallback that the audit page was rendering.
  admin_cancelled_sponsorship: "Cancelled sponsorship",
  admin_paused_sponsorship: "Paused sponsorship",
  admin_resumed_sponsorship: "Resumed sponsorship",
  admin_refunded_sponsorship_charge: "Refunded sponsorship charge",
  // Donor actions (newly wired in /api/sponsorship/[id]/*). Same
  // copy shape as admin so the audit page reads as one row of
  // history; the actor pill (Admin vs Donor) carries the attribution.
  donor_cancelled_sponsorship: "Cancelled sponsorship",
  donor_paused_sponsorship: "Paused sponsorship",
  donor_resumed_sponsorship: "Resumed sponsorship",
  donor_extended_sponsorship: "Extended sponsorship",
  donor_modified_sponsorship_amount: "Changed sponsorship amount",
  donor_changed_sponsorship_visibility: "Changed sponsorship visibility",
  donor_cancelled_queued_sponsorship: "Cancelled queued sponsorship",
  donor_resolved_queue_shift: "Resolved queue-shift decision",
};

/**
 * Map a raw action string to a human-readable label.
 *
 * Unknown actions fall through to a snake-case → spaced-words
 * transform — so a brand-new action shipping in a future session
 * still renders something legible before we add a row to
 * AUDIT_LABELS.
 */
export function formatActionLabel(action: string | null | undefined): string {
  if (!action) return "(unknown)";
  const known = AUDIT_LABELS[action];
  if (known) return known;
  return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, " ");
}

// ─── Actor roles ────────────────────────────────────────────────────
//
// di-audit.ts's ActorRole union: 'data_inputter' | 'admin' | 'system'.
// `donor` is included as a forward-looking row — no caller writes a
// donor-acted audit today, but the admin/donors surface (Session 65)
// has user-id columns ready for it, and the viewer's role filter
// should accept the value without rejecting it.
//
// Pill colours pick from the same Tailwind palette used elsewhere
// in the admin surface so the audit page reads as part of the same
// system.

export type AuditActorRole =
  | "data_inputter"
  | "admin"
  | "system"
  | "donor"
  | "unknown";

interface RoleStyle {
  label: string;
  pillBg: string;
  pillText: string;
}

export const ACTOR_ROLE_STYLES: Record<AuditActorRole, RoleStyle> = {
  data_inputter: {
    label: "DI",
    pillBg: "bg-tangerine-mist",
    pillText: "text-tangerine-deeper",
  },
  admin: {
    label: "Admin",
    pillBg: "bg-moss-soft",
    pillText: "text-moss-deep",
  },
  system: {
    label: "System",
    pillBg: "bg-stone-100",
    pillText: "text-stone-700",
  },
  donor: {
    label: "Donor",
    pillBg: "bg-amber-50",
    pillText: "text-amber-800",
  },
  unknown: {
    label: "Unknown",
    pillBg: "bg-stone-100",
    pillText: "text-stone-700",
  },
};

export function normaliseActorRole(s: string | null | undefined): AuditActorRole {
  if (s === "data_inputter" || s === "admin" || s === "system" || s === "donor") {
    return s;
  }
  return "unknown";
}

// ─── Subject collection → admin URL ────────────────────────────────
//
// The audit log stores `collection` + `record_id` per row. For most
// rows the (collection, record_id) tuple is enough to deep-link
// straight to the relevant admin detail page. Edge cases:
//
//   - `directus_files` rows (raw upload audits like di_uploaded_photo)
//     have no admin surface — record_id is a file uuid, not a domain
//     object. Return null; viewer renders "—".
//   - Review-queue rows (child_moment / child_intake_photo /
//     child_document) DO have admin URLs but the URL needs the
//     CHILD id, not the row's own id. We accept an optional
//     `metadata` arg and pull childId from there. Falls back to no
//     link if metadata is missing.
//   - `child_proposal` → /admin/proposals/[id]
//   - `child` → /admin/children/[id]            (Session 66 surface;
//                                                this branch doesn't
//                                                ship it, but the
//                                                URL is forward-
//                                                compatible — admin
//                                                will see a 404 from
//                                                Session 66 / will
//                                                land on the page
//                                                when the merge
//                                                happens. Documented
//                                                in the ship report.)
//   - `directus_users` → /admin/donors/[id]     (Session 65 surface;
//                                                same caveat)
//
// The resolver is intentionally permissive — any unknown collection
// returns null rather than throwing, so a brand-new audit row from
// some future session renders without breaking the page.

export interface AuditSubjectLink {
  href: string;
  label: string;
}

export function resolveAuditSubjectLink(
  collection: string | null | undefined,
  recordId: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): AuditSubjectLink | null {
  if (!collection) return null;

  // Child-attached review rows: the URL needs childId, not the row's
  // own id. Pull from metadata.childId if present; null link otherwise.
  if (
    collection === "child_moment" ||
    collection === "child_intake_photo" ||
    collection === "child_document"
  ) {
    const childId = readMetadataChildId(metadata);
    if (!childId) return null;
    // Per-review admin URLs (Session 52b).
    if (collection === "child_moment" && recordId) {
      return {
        href: `/admin/reviews/moments/${recordId}`,
        label: "Moment",
      };
    }
    if (collection === "child_intake_photo") {
      return {
        href: `/admin/reviews/intake-photos/${childId}`,
        label: "Intake photos",
      };
    }
    if (collection === "child_document" && recordId) {
      return {
        href: `/admin/reviews/documents/${recordId}`,
        label: "Document",
      };
    }
    return { href: `/admin/children/${childId}`, label: "Child" };
  }

  if (collection === "child_proposal" && recordId) {
    return { href: `/admin/proposals/${recordId}`, label: "Proposal" };
  }
  if (collection === "child" && recordId) {
    return { href: `/admin/children/${recordId}`, label: "Child" };
  }
  if (collection === "directus_users" && recordId) {
    return { href: `/admin/donors/${recordId}`, label: "Donor" };
  }
  if (collection === "sponsorship" && recordId) {
    return { href: `/admin/sponsorships/${recordId}`, label: "Sponsorship" };
  }

  // directus_files, aid_delivery, task, anything else: no admin URL
  // we can confidently link to yet.
  return null;
}

function readMetadataChildId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const direct = metadata.childId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const snake = metadata.child_id;
  if (typeof snake === "string" && snake.length > 0) return snake;
  return null;
}

// ─── Subject-type filter buckets ────────────────────────────────────
//
// The viewer's "Subject type" filter rolls every collection into a
// small set of buckets so admin doesn't see every Directus table
// name. Order here drives the filter dropdown's order; "all" is a
// special bucket the route handler treats as "no filter".

export type AuditSubjectBucket =
  | "all"
  | "proposal"
  | "child"
  | "document"
  | "intake_photo"
  | "moment"
  | "sponsorship"
  | "donor"
  | "file"
  | "other";

export const AUDIT_SUBJECT_BUCKETS: ReadonlyArray<{
  value: AuditSubjectBucket;
  label: string;
}> = [
  { value: "all", label: "All subjects" },
  { value: "proposal", label: "Proposal" },
  { value: "child", label: "Child" },
  { value: "document", label: "Document" },
  { value: "intake_photo", label: "Intake photo" },
  { value: "moment", label: "Moment" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "donor", label: "Donor" },
  { value: "file", label: "File upload" },
  { value: "other", label: "Other" },
];

/** Collection-string → bucket. Used both by the dropdown filter
 * (admin-audit's reader converts the chosen bucket to an `_in` clause
 * of collection names) and by the per-row "Subject type" pill. */
export function bucketForCollection(
  collection: string | null | undefined,
): AuditSubjectBucket {
  switch (collection) {
    case "child_proposal":
      return "proposal";
    case "child":
      return "child";
    case "child_document":
      return "document";
    case "child_intake_photo":
      return "intake_photo";
    case "child_moment":
      return "moment";
    case "sponsorship":
      return "sponsorship";
    case "directus_users":
      return "donor";
    case "directus_files":
      return "file";
    default:
      return "other";
  }
}

/** Inverse of bucketForCollection: a bucket → the collection-name(s)
 * to send in a Directus `_in` filter. "all" returns null so the
 * caller knows to omit the filter clause; "other" returns null too
 * (we can't enumerate the negative set in a stable way, so the
 * viewer post-filters in-memory for that bucket). */
export function collectionsForBucket(
  bucket: AuditSubjectBucket,
): string[] | null {
  switch (bucket) {
    case "all":
    case "other":
      return null;
    case "proposal":
      return ["child_proposal"];
    case "child":
      return ["child"];
    case "document":
      return ["child_document"];
    case "intake_photo":
      return ["child_intake_photo"];
    case "moment":
      return ["child_moment"];
    case "sponsorship":
      return ["sponsorship"];
    case "donor":
      return ["directus_users"];
    case "file":
      return ["directus_files"];
  }
}
