// Spine 1.2 — Admin report review data layer.
//
// Mirrors the existing review-data-layer pattern (src/lib/admin-moments.ts,
// admin-documents.ts) but for child_update rows on the new Spine
// lifecycle (status submitted_by_di → under_admin_review → approved
// → correction_requested loop). Admin queue reads child_update rows
// in submitted_by_di OR under_admin_review status; legacy 'pending'
// rows surface alongside (one queue, two writers).
//
// Privacy: every join includes ONLY Tier-1 child fields
// (display_name + bd_division.name). NO district, DOB, guardian,
// medical, school, address. This is the structural guard against
// admin pasting Tier-3 detail into donor_text — there's nothing to
// copy from in the surrounding render.

import "server-only";

import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Audit attribution helper ───────────────────────────────────────
//
// Mirrors admin-moments.ts pattern — every mutator inlines a single
// best-effort audit_log insert. Failures are logged + swallowed so the
// admin's action still succeeds. The audit_log writer in di-audit.ts
// is the canonical helper for IP/UA-aware writes from API routes, but
// for these intra-library writes we skip the request plumbing.
async function safeAuditWrite(
  row: Record<string, unknown>,
  context: string,
): Promise<void> {
  try {
    await directusServer().request(
      createItem("audit_log" as never, row as never),
    );
  } catch (err) {
    console.warn(
      `[admin-reports] audit write failed (swallowed) — ${context}`,
      err instanceof Error ? err.message : err,
    );
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Typed errors ───────────────────────────────────────────────────

export class ReportNotFoundError extends Error {
  readonly code = "report_not_found" as const;
  constructor(message = "Report not found") {
    super(message);
    this.name = "ReportNotFoundError";
  }
}

export class InvalidReportStatusTransitionError extends Error {
  readonly code = "invalid_report_status_transition" as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition report from ${from} to ${to}`);
    this.name = "InvalidReportStatusTransitionError";
  }
}

export class InvalidReportInputError extends Error {
  readonly code = "invalid_report_input" as const;
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "InvalidReportInputError";
  }
}

// ─── Public types ───────────────────────────────────────────────────

export interface AdminReportSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  report_type: "progress" | "deployment" | null;
  visibility: string;
  date_created: string | null; // surfaced from sponsorship.date_created via the di-submitted audit timeline; not on child_update directly
  // Derived from the row's audit history for the queue's sort order.
  submitted_at: string | null;

  // Tier-1 child fields ONLY.
  child_id: string | null;
  child_display_name: string | null;
  child_division_name: string | null;

  // Submitter (DI) — display attribution only; no PII beyond name.
  submitter_id: string | null;
  submitter_display_name: string | null;

  // Sponsorship + task linkage for the queue's "what funded this?" pill.
  sponsorship_id: string | null;
  task_id: string | null;

  // Edit attribution from the prior admin review session, if any.
  donor_text_edited_at: string | null;
  donor_text_edited_by_display: string | null;
}

export interface AdminReportDetail extends AdminReportSummary {
  // DI's original (preserved verbatim — forensic record).
  content: string | null;
  // Admin-editable donor-facing copy. Initialized at submit time to
  // content; admin may overwrite.
  donor_text: string | null;
  // Photo (Tier-1 — already on /children profile).
  photo: string | null;
  // Correction loop: the most recent admin's send-back note.
  correction_reason: string | null;
  rejection_reason: string | null;
}

// ─── Internal row shapes ────────────────────────────────────────────

const ADMIN_REPORT_LIST_FIELDS = [
  "id",
  "title",
  "type",
  "status",
  "report_type",
  "visibility",
  "donor_text_edited_at",
  "child.id",
  "child.display_name",
  "child.bd_division.name",
  "created_by.id",
  "created_by.first_name",
  "created_by.last_name",
  "donor_text_edited_by.id",
  "donor_text_edited_by.first_name",
  "donor_text_edited_by.last_name",
  "sponsorship",
  "task",
] as const;

const ADMIN_REPORT_DETAIL_FIELDS = [
  ...ADMIN_REPORT_LIST_FIELDS,
  "content",
  "donor_text",
  "photo",
  "correction_reason",
  "rejection_reason",
  "published_at",
] as const;

type UserPick = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
} | null;

function displayNameFor(u: UserPick): string | null {
  if (!u) return null;
  const name = [u.first_name?.trim(), u.last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  return name.length > 0 ? name : null;
}

type AdminReportRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  report_type: "progress" | "deployment" | null;
  visibility: string | null;
  donor_text_edited_at: string | null;
  child: {
    id?: string;
    display_name?: string | null;
    bd_division?: { name?: string | null } | null;
  } | null;
  created_by: UserPick;
  donor_text_edited_by: UserPick;
  sponsorship: string | null;
  task: string | null;
  // Detail-only fields
  content?: string | null;
  donor_text?: string | null;
  photo?: string | null;
  correction_reason?: string | null;
  rejection_reason?: string | null;
  published_at?: string | null;
};

function rowToSummary(row: AdminReportRow): AdminReportSummary {
  return {
    id: row.id,
    title: row.title?.trim() || "(untitled)",
    type: row.type ?? "story",
    status: row.status ?? "draft",
    report_type: row.report_type,
    visibility: row.visibility ?? "all_donors",
    date_created: null,
    submitted_at: null,
    child_id: row.child?.id ?? null,
    child_display_name: row.child?.display_name?.trim() ?? null,
    child_division_name: row.child?.bd_division?.name?.trim() ?? null,
    submitter_id: row.created_by?.id ?? null,
    submitter_display_name: displayNameFor(row.created_by),
    sponsorship_id: row.sponsorship,
    task_id: row.task,
    donor_text_edited_at: row.donor_text_edited_at,
    donor_text_edited_by_display: displayNameFor(row.donor_text_edited_by),
  };
}

function rowToDetail(row: AdminReportRow): AdminReportDetail {
  return {
    ...rowToSummary(row),
    content: row.content ?? null,
    donor_text: row.donor_text ?? null,
    photo: row.photo ?? null,
    correction_reason: row.correction_reason ?? null,
    rejection_reason: row.rejection_reason ?? null,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Admin review queue. Reads child_update rows in either the new
 * Spine lifecycle ('submitted_by_di' / 'under_admin_review') OR
 * the legacy 'pending' status — admin sees one queue, two writers.
 *
 * Optional filters:
 *   reportType — 'progress' | 'deployment' | 'all' (default 'all')
 *
 * V1 returns the most recent 100 — sufficient until queue volume
 * justifies pagination.
 */
export async function listAdminReports(opts?: {
  reportType?: "progress" | "deployment" | "all";
}): Promise<AdminReportSummary[]> {
  const filters: Record<string, unknown>[] = [
    {
      _or: [
        { status: { _eq: "submitted_by_di" } },
        { status: { _eq: "under_admin_review" } },
        { status: { _eq: "pending" } }, // legacy flow
        { status: { _eq: "correction_requested" } },
      ],
    },
  ];
  if (opts?.reportType && opts.reportType !== "all") {
    filters.push({ report_type: { _eq: opts.reportType } });
  }
  let rows: AdminReportRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_update" as never, {
        filter: { _and: filters },
        fields: [...ADMIN_REPORT_LIST_FIELDS],
        sort: ["-id"], // newest UUIDs first — proxies date_created
        limit: 100,
      } as never),
    )) as unknown as AdminReportRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-reports] listAdminReports failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.map(rowToSummary);
}

/**
 * Count pending reports (drives the /admin/reviews index tile).
 * Counts rows in any status that requires admin attention.
 */
export async function countPendingReports(): Promise<number | null> {
  try {
    const rows = (await directusServer().request(
      readItems("child_update" as never, {
        filter: {
          _or: [
            { status: { _eq: "submitted_by_di" } },
            { status: { _eq: "under_admin_review" } },
            { status: { _eq: "pending" } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[admin-reports] countPendingReports failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Per-report detail for the review-detail page. Returns null if
 *  the row doesn't exist or is in a terminal state we don't expose
 *  here (published / rejected — those live on the donor-facing
 *  reader / DI submissions feed). */
export async function getAdminReportDetail(
  reportId: string,
): Promise<AdminReportDetail | null> {
  if (!UUID_RE.test(reportId)) return null;
  let row: AdminReportRow | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child_update" as never, reportId as never, {
        fields: [...ADMIN_REPORT_DETAIL_FIELDS],
      } as never),
    )) as unknown as AdminReportRow | null;
    row = result;
  } catch (err) {
    console.warn(
      "[admin-reports] getAdminReportDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;
  return rowToDetail(row);
}

// ─── Mutators ───────────────────────────────────────────────────────

/**
 * Admin claims the row from the queue. Idempotent — calling on a row
 * already in 'under_admin_review' is a no-op (returns the row's
 * current state without mutation). Calling on a row outside the
 * review-able states throws InvalidReportStatusTransitionError.
 */
export async function claimReportForReview(
  reportId: string,
  adminUserId: string,
): Promise<{ id: string; status: string; childId: string | null }> {
  if (!UUID_RE.test(reportId)) throw new ReportNotFoundError();
  if (!UUID_RE.test(adminUserId)) {
    throw new InvalidReportInputError("adminUserId", "must be a uuid");
  }
  const detail = await getAdminReportDetail(reportId);
  if (!detail) throw new ReportNotFoundError();
  if (detail.status === "under_admin_review") {
    return {
      id: detail.id,
      status: detail.status,
      childId: detail.child_id,
    };
  }
  if (
    detail.status !== "submitted_by_di" &&
    detail.status !== "pending" && // legacy
    detail.status !== "correction_requested"
  ) {
    throw new InvalidReportStatusTransitionError(
      detail.status,
      "under_admin_review",
    );
  }
  await directusServer().request(
    updateItem("child_update" as never, reportId as never, {
      status: "under_admin_review",
    } as never),
  );
  await safeAuditWrite(
    {
      timestamp: new Date().toISOString(),
      actor: adminUserId,
      actor_role: "admin",
      action: "admin_claimed_report_review",
      collection: "child_update",
      record_id: reportId,
      metadata: {
        ...(detail.child_id ? { childId: detail.child_id } : {}),
        ...(detail.sponsorship_id
          ? { sponsorshipId: detail.sponsorship_id }
          : {}),
        from_status: detail.status,
        to_status: "under_admin_review",
      },
    },
    `claim:${reportId}`,
  );
  return {
    id: detail.id,
    status: "under_admin_review",
    childId: detail.child_id,
  };
}

/**
 * Admin's optional inline edit of donor_text. Preserves content
 * (DI's original). Sets donor_text_edited_at + donor_text_edited_by
 * for the audit trail. Idempotent re-saves of the same string are
 * allowed (timestamp + by are refreshed).
 *
 * The status is NOT changed by edits alone — admin still has to
 * call approveReport (or requestReportCorrection) to advance the
 * lifecycle. This separation lets admin make multiple edits before
 * deciding to approve.
 */
export async function editReportDonorText(
  reportId: string,
  adminUserId: string,
  newDonorText: string,
): Promise<{
  id: string;
  lengthBefore: number;
  lengthAfter: number;
  childId: string | null;
  uploaderId: string | null;
}> {
  if (!UUID_RE.test(reportId)) throw new ReportNotFoundError();
  if (!UUID_RE.test(adminUserId)) {
    throw new InvalidReportInputError("adminUserId", "must be a uuid");
  }
  const trimmed = newDonorText.trim();
  if (trimmed.length < 50) {
    throw new InvalidReportInputError(
      "donor_text",
      "must be at least 50 characters",
    );
  }
  if (trimmed.length > 4000) {
    // Looser cap than the DI's 2000 — admin may need slightly more
    // room for context framing.
    throw new InvalidReportInputError(
      "donor_text",
      "max 4000 characters",
    );
  }
  const detail = await getAdminReportDetail(reportId);
  if (!detail) throw new ReportNotFoundError();
  // Allow edits from any non-terminal Spine state. (Status doesn't
  // change here — just the donor_text + edit tracking.)
  const editable = new Set([
    "submitted_by_di",
    "under_admin_review",
    "approved",
    "correction_requested",
    "pending", // legacy
  ]);
  if (!editable.has(detail.status)) {
    throw new InvalidReportStatusTransitionError(detail.status, "edit");
  }
  const lengthBefore = (detail.donor_text ?? detail.content ?? "").length;
  await directusServer().request(
    updateItem("child_update" as never, reportId as never, {
      donor_text: trimmed,
      donor_text_edited_at: new Date().toISOString(),
      donor_text_edited_by: adminUserId,
    } as never),
  );
  // Audit metadata: lengths only — NEVER the donor_text itself.
  // Donor_text can be free-form Tier-3-leaning text; storing it in
  // the audit row would defeat the privacy guard the rest of the
  // surface enforces. Lengths are sufficient for after-the-fact
  // "did the admin actually rewrite the copy?" forensics.
  await safeAuditWrite(
    {
      timestamp: new Date().toISOString(),
      actor: adminUserId,
      actor_role: "admin",
      action: "admin_edited_report_donor_text",
      collection: "child_update",
      record_id: reportId,
      metadata: {
        ...(detail.child_id ? { childId: detail.child_id } : {}),
        ...(detail.sponsorship_id
          ? { sponsorshipId: detail.sponsorship_id }
          : {}),
        length_before: lengthBefore,
        length_after: trimmed.length,
      },
    },
    `edit:${reportId}`,
  );
  return {
    id: reportId,
    lengthBefore,
    lengthAfter: trimmed.length,
    childId: detail.child_id,
    uploaderId: detail.submitter_id,
  };
}

/**
 * Admin approves the report. Status → 'approved'. Sets approved_by.
 * Spine 1.2 STOPS HERE — sending to donor + notification are 1.3 / 1.4.
 */
export async function approveReport(
  reportId: string,
  adminUserId: string,
): Promise<{
  id: string;
  status: "approved";
  childId: string | null;
  uploaderId: string | null;
}> {
  if (!UUID_RE.test(reportId)) throw new ReportNotFoundError();
  if (!UUID_RE.test(adminUserId)) {
    throw new InvalidReportInputError("adminUserId", "must be a uuid");
  }
  const detail = await getAdminReportDetail(reportId);
  if (!detail) throw new ReportNotFoundError();
  const approvable = new Set([
    "submitted_by_di",
    "under_admin_review",
    "correction_requested",
    "pending", // legacy
  ]);
  if (!approvable.has(detail.status)) {
    throw new InvalidReportStatusTransitionError(detail.status, "approved");
  }
  await directusServer().request(
    updateItem("child_update" as never, reportId as never, {
      status: "approved",
      approved_by: adminUserId,
    } as never),
  );
  await safeAuditWrite(
    {
      timestamp: new Date().toISOString(),
      actor: adminUserId,
      actor_role: "admin",
      action: "admin_approved_report",
      collection: "child_update",
      record_id: reportId,
      metadata: {
        ...(detail.child_id ? { childId: detail.child_id } : {}),
        ...(detail.sponsorship_id
          ? { sponsorshipId: detail.sponsorship_id }
          : {}),
        ...(detail.report_type ? { reportType: detail.report_type } : {}),
        from_status: detail.status,
        to_status: "approved",
      },
    },
    `approve:${reportId}`,
  );
  return {
    id: reportId,
    status: "approved",
    childId: detail.child_id,
    uploaderId: detail.submitter_id,
  };
}

/**
 * Admin sends the report back to the DI with a correction note.
 * Status → 'correction_requested'. The DI's submissions surface
 * will show the row + the reason; DI can resubmit (form re-POSTs;
 * the route handler accepts an updated row, advancing back to
 * 'submitted_by_di').
 *
 * Distinct from rejectReport (not built here — terminal rejection
 * is a future phase).
 */
export async function requestReportCorrection(
  reportId: string,
  adminUserId: string,
  reason: string,
): Promise<{
  id: string;
  status: "correction_requested";
  childId: string | null;
  uploaderId: string | null;
  reason: string;
}> {
  if (!UUID_RE.test(reportId)) throw new ReportNotFoundError();
  if (!UUID_RE.test(adminUserId)) {
    throw new InvalidReportInputError("adminUserId", "must be a uuid");
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw new InvalidReportInputError(
      "reason",
      "must be 5-500 characters",
    );
  }
  const detail = await getAdminReportDetail(reportId);
  if (!detail) throw new ReportNotFoundError();
  const ok = new Set([
    "submitted_by_di",
    "under_admin_review",
    "pending", // legacy
  ]);
  if (!ok.has(detail.status)) {
    throw new InvalidReportStatusTransitionError(
      detail.status,
      "correction_requested",
    );
  }
  await directusServer().request(
    updateItem("child_update" as never, reportId as never, {
      status: "correction_requested",
      correction_reason: trimmed,
    } as never),
  );
  await safeAuditWrite(
    {
      timestamp: new Date().toISOString(),
      actor: adminUserId,
      actor_role: "admin",
      action: "admin_requested_report_correction",
      collection: "child_update",
      record_id: reportId,
      metadata: {
        ...(detail.child_id ? { childId: detail.child_id } : {}),
        ...(detail.sponsorship_id
          ? { sponsorshipId: detail.sponsorship_id }
          : {}),
        reason: trimmed, // small free-text, kept verbatim — admin wrote it
        from_status: detail.status,
        to_status: "correction_requested",
      },
    },
    `correction:${reportId}`,
  );
  return {
    id: reportId,
    status: "correction_requested",
    childId: detail.child_id,
    uploaderId: detail.submitter_id,
    reason: trimmed,
  };
}
