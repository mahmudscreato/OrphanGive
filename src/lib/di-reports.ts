// Session 45 — DI report data layer.
//
// Reports map to the existing `child_update` collection. The
// production schema is more general than the spec's "monthly progress
// note" framing — it has type/title/content/visibility instead of
// period/narrative/school_status/health_status/wellbeing_note.
//
// Schema reality (from Session 45 discovery):
//
//   child_update columns:
//     id            uuid PK
//     child         uuid M2O child  NOT NULL
//     type          text   NOT NULL  enum: academic|health|story|photo
//                                          |milestone|eid_greeting|letter
//     title         text   NOT NULL
//     content       text   NULLABLE  ← the narrative
//     photo         uuid   NULLABLE  ← optional
//     visibility    text   NOT NULL  default 'all_donors'
//                          enum: sponsor_only | all_donors
//     status        text   NOT NULL  default 'draft'
//                          enum: draft|pending|published|rejected
//     created_by    uuid   NULLABLE
//     approved_by   uuid   NULLABLE
//     published_at  timestamp NULLABLE
//     rejection_reason text  NULLABLE
//
// The spec's `report_period` (one-per-month uniqueness) doesn't map
// to the production schema — there's no period column. So uniqueness
// gating is dropped; DI can submit multiple reports of any type for
// the same child. Admin can deduplicate at review.

import "server-only";

import {
  createItem,
  readItem,
  readItems,
  readUsers,
  updateItem,
} from "@directus/sdk";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { directusServer } from "./directus";
import { getDiChildById } from "./di-children";
// Option lists + their type aliases live in a non-`server-only`
// module so the client ReportForm can import them without dragging
// this file's server deps into the bundle. Re-exported here for
// import-site symmetry.
import {
  REPORT_TYPE_OPTIONS as REPORT_TYPE_OPTIONS_VALUE,
  REPORT_VISIBILITY_OPTIONS as REPORT_VISIBILITY_OPTIONS_VALUE,
  type ReportType,
  type ReportVisibility,
} from "./di-report-options";

// ─── Public types ───────────────────────────────────────────────────

export type { ReportType, ReportVisibility };

// Spine 1.2 — status enum now includes the new sponsorship-tied
// lifecycle values. Existing 'pending'/'published'/'rejected'/'draft'
// remain valid (legacy DI flow + existing data).
export type ReportStatus =
  | "draft"
  | "pending"
  | "submitted_by_di"
  | "under_admin_review"
  | "approved"
  | "correction_requested"
  | "published"
  | "rejected";

// Spine 1.2 — report_type derived from sponsorship.payment_mode at
// write time. 'progress' for monthly sponsor; 'deployment' for
// one-time donor. Stored on the row so admin queue filters don't
// need a sponsorship join per row.
export type ReportType_Spine = "progress" | "deployment";

export interface CreateReportInput {
  childId: string;
  type: ReportType;
  title: string;
  content: string; // 50-2000 chars
  visibility: ReportVisibility;
  photoUuid?: string;
  // Spine 1.2 — when set, this is a sponsorship-tied report.
  // Triggers report_type derivation + status='submitted_by_di'.
  // When unset, falls back to the legacy 'pending'-status flow.
  sponsorshipId?: string;
  // Spine 1.2 — optional task link (Spine 1.1 admin task). Only
  // meaningful when sponsorshipId is set; ignored otherwise.
  taskId?: string;
}

export interface ReportSummary {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  photoUrl: string | null;
  // Spine 1.2 — the raw photo uuid is needed too, so the edit form
  // can re-bind the existing photo via PhotoUploadField. photoUrl
  // is a derived `/api/assets/${uuid}` URL for rendering.
  photoUuid: string | null;
  visibility: ReportVisibility;
  status: ReportStatus;
  publishedAt: string | null;
  rejectionReason: string | null;
  // Spine 1.2 — admin's correction note when status === 'correction_requested'.
  // The DI sees this prominently on their report card + on the
  // resubmit form. Null in every other status.
  correctionReason: string | null;
  submittedByName: string;
  isOwn: boolean;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class OutOfScopeError extends Error {
  readonly code = "out_of_scope" as const;
  constructor(message = "Child is not in DI's scope") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

export class InvalidInputError extends Error {
  readonly code = "invalid_input" as const;
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "InvalidInputError";
  }
}

// ─── Static lists (re-exported from the client-safe options module) ─

export const REPORT_TYPE_OPTIONS = REPORT_TYPE_OPTIONS_VALUE;
export const REPORT_VISIBILITY_OPTIONS = REPORT_VISIBILITY_OPTIONS_VALUE;

const VALID_TYPES = new Set<string>(REPORT_TYPE_OPTIONS.map((o) => o.value));
const VALID_VIS = new Set<string>(REPORT_VISIBILITY_OPTIONS.map((o) => o.value));

// ─── Public API ─────────────────────────────────────────────────────

export async function createReport(
  userId: string,
  input: CreateReportInput,
): Promise<{
  reportId: string;
  reportType: ReportType_Spine | null;
  status: ReportStatus;
}> {
  // Scope guard.
  const child = await getDiChildById(input.childId, userId);
  if (!child) throw new OutOfScopeError();

  // Validation.
  if (!VALID_TYPES.has(input.type)) {
    throw new InvalidInputError("type", "invalid value");
  }
  if (!VALID_VIS.has(input.visibility)) {
    throw new InvalidInputError("visibility", "invalid value");
  }
  if (!input.title || input.title.trim().length === 0) {
    throw new InvalidInputError("title", "required");
  }
  if (input.title.trim().length > 200) {
    throw new InvalidInputError("title", "max 200 characters");
  }
  if (!input.content || input.content.trim().length < 50) {
    throw new InvalidInputError("content", "must be at least 50 characters");
  }
  if (input.content.trim().length > 2000) {
    throw new InvalidInputError("content", "max 2000 characters");
  }

  // ─── Spine 1.2 — resolve sponsorship + derive report_type ──────────
  //
  // If sponsorshipId is provided, validate it belongs to this child
  // and read payment_mode to derive report_type. If absent, fall back
  // to the legacy 'pending'-status flow (existing DI form path).
  let reportType: ReportType_Spine | null = null;
  let resolvedSponsorshipId: string | null = null;
  let resolvedTaskId: string | null = null;

  if (input.sponsorshipId) {
    if (!UUID_RE.test(input.sponsorshipId)) {
      throw new InvalidInputError("sponsorshipId", "must be a uuid");
    }
    // Validate the sponsorship is for THIS child (or null-child
    // campaign — but a child-scoped report can't be tied to a
    // campaign sponsorship). Look up + check.
    type SponsorshipPeek = {
      id: string;
      child: string | null;
      payment_mode: string | null;
    };
    let sponsorshipRow: SponsorshipPeek | null = null;
    try {
      const raw = await directusServer().request(
        readItem("sponsorship" as never, input.sponsorshipId as never, {
          fields: ["id", "child", "payment_mode"],
        } as never),
      );
      sponsorshipRow = raw as unknown as SponsorshipPeek | null;
    } catch {
      throw new InvalidInputError(
        "sponsorshipId",
        "sponsorship not found",
      );
    }
    if (!sponsorshipRow) {
      throw new InvalidInputError(
        "sponsorshipId",
        "sponsorship not found",
      );
    }
    // The sponsorship's child column may come back as a string id or
    // (when expanded) an object — for our fields:['child'] query it
    // comes back as a string. Compare to the report's child.
    const sponsorshipChildId =
      typeof sponsorshipRow.child === "string"
        ? sponsorshipRow.child
        : null;
    if (sponsorshipChildId !== input.childId) {
      throw new InvalidInputError(
        "sponsorshipId",
        "sponsorship is not for this child",
      );
    }
    // Derive report_type from payment_mode. monthly → progress;
    // one_time → deployment. Anything else null (defensive — shouldn't
    // happen with the production enum).
    if (sponsorshipRow.payment_mode === "monthly") reportType = "progress";
    else if (sponsorshipRow.payment_mode === "one_time")
      reportType = "deployment";
    resolvedSponsorshipId = input.sponsorshipId;

    // Optional task link. Server-side-validate it points at the
    // SAME sponsorship (defence-in-depth — the DI form filters the
    // dropdown but the API is the security boundary).
    if (input.taskId) {
      if (!UUID_RE.test(input.taskId)) {
        throw new InvalidInputError("taskId", "must be a uuid");
      }
      try {
        const taskRow = (await directusServer().request(
          readItem("task" as never, input.taskId as never, {
            fields: ["id", "sponsorship", "child", "assignee"],
          } as never),
        )) as unknown as {
          id: string;
          sponsorship: string | null;
          child: string | null;
          assignee: string;
        } | null;
        if (!taskRow) {
          throw new InvalidInputError("taskId", "task not found");
        }
        if (taskRow.sponsorship !== input.sponsorshipId) {
          throw new InvalidInputError(
            "taskId",
            "task is not for this sponsorship",
          );
        }
        // Assignee-vs-self check. Authoring a report against
        // someone else's task is a flag — block it.
        if (taskRow.assignee !== userId) {
          throw new InvalidInputError(
            "taskId",
            "task is not assigned to you",
          );
        }
        resolvedTaskId = input.taskId;
      } catch (err) {
        if (err instanceof InvalidInputError) throw err;
        throw new InvalidInputError("taskId", "task lookup failed");
      }
    }
  }

  const isSpinePath = resolvedSponsorshipId !== null;
  const status: ReportStatus = isSpinePath ? "submitted_by_di" : "pending";
  const trimmedContent = input.content.trim();

  const created = (await directusServer().request(
    createItem("child_update" as never, {
      child: input.childId,
      type: input.type,
      title: input.title.trim(),
      content: trimmedContent,
      visibility: input.visibility,
      // Legacy path → 'pending' (existing readers + admin tooling).
      // Spine path → 'submitted_by_di' (new admin review queue
      // claim/approve/correction lifecycle).
      status,
      created_by: userId,
      ...(input.photoUuid ? { photo: input.photoUuid } : {}),
      // Spine 1.2 — sponsorship FK (Phase 0 column), optional task FK
      // (1.2 column), derived report_type, and donor_text initialized
      // to the DI's content so the donor reader's
      // COALESCE(donor_text, content) is consistent from the moment
      // the row exists. Admin's review may overwrite donor_text;
      // content stays the DI's forensic record.
      ...(resolvedSponsorshipId
        ? {
            sponsorship: resolvedSponsorshipId,
            report_type: reportType,
            donor_text: trimmedContent,
          }
        : {}),
      ...(resolvedTaskId ? { task: resolvedTaskId } : {}),
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-reports] createReport: no id returned");
  }
  return {
    reportId: String(id),
    reportType,
    status,
  };
}

type ReportRow = {
  id: string;
  type: string | null;
  title: string | null;
  content: string | null;
  photo: string | null;
  visibility: string | null;
  status: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  // Spine 1.2 — admin's send-back note. Omitting this from the
  // SELECT was the Spine 1.2 backward-loop bug: the DI's reader
  // had the row but couldn't show the reason.
  correction_reason: string | null;
  sponsorship: string | null;
};

const REPORT_FIELDS = [
  "id",
  "type",
  "title",
  "content",
  "photo",
  "visibility",
  "status",
  "published_at",
  "rejection_reason",
  "created_by",
  "correction_reason",
  "sponsorship",
] as const;

function isType(s: string | null | undefined): s is ReportType {
  return s !== null && s !== undefined && VALID_TYPES.has(s);
}

function isVis(s: string | null | undefined): s is ReportVisibility {
  return s !== null && s !== undefined && VALID_VIS.has(s);
}

function isStatus(s: string | null | undefined): s is ReportStatus {
  // Spine 1.2 — the new lifecycle statuses MUST pass this guard.
  // Previously this only accepted the 4 legacy values, which silently
  // coerced 'correction_requested' to 'pending' on the DI's reader —
  // hiding the fact that admin had sent the report back.
  return (
    s === "draft" ||
    s === "pending" ||
    s === "submitted_by_di" ||
    s === "under_admin_review" ||
    s === "approved" ||
    s === "correction_requested" ||
    s === "published" ||
    s === "rejected"
  );
}

export async function listReportsForChild(
  userId: string,
  childId: string,
): Promise<ReportSummary[]> {
  const child = await getDiChildById(childId, userId);
  if (!child) return [];

  let rows: ReportRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_update" as never, {
        filter: { child: { _eq: childId } },
        fields: [...REPORT_FIELDS],
        // Newest first — published_at if available, falls back to id desc.
        sort: ["-published_at", "-id"],
        limit: -1,
      } as never),
    )) as unknown as ReportRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-reports] listReportsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  // Batch resolve submitter names.
  const uploaderIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: uploaderIds } },
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
        "[di-reports] submitter name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return rows.map((r) => {
    const isOwn = r.created_by === userId;
    const name = isOwn
      ? "You"
      : r.created_by
        ? nameById.get(r.created_by) ?? "Unknown"
        : "Unknown";
    return {
      id: r.id,
      type: isType(r.type) ? r.type : "story",
      title: r.title?.trim() || "(untitled)",
      content: r.content?.trim() ?? "",
      photoUrl: r.photo ? `/api/assets/${r.photo}` : null,
      photoUuid: r.photo,
      visibility: isVis(r.visibility) ? r.visibility : "all_donors",
      status: isStatus(r.status) ? r.status : "pending",
      publishedAt: r.published_at,
      rejectionReason: r.rejection_reason,
      correctionReason: r.correction_reason,
      submittedByName: name,
      isOwn,
    };
  });
}

// ─── Spine 1.2 — DI resubmit path ───────────────────────────────────
//
// Closes the backward loop opened by admin's send-back-for-correction:
// the DI fetches their own correction_requested row, edits the
// content/title/visibility/photo, and resubmits — flipping status back
// to 'submitted_by_di' so it re-enters the admin queue. The DI's
// original sponsorship/task/report_type are PRESERVED (not editable
// here — those were locked at first submit).
//
// Scope guards:
//  - DI must be the original `created_by` (not just in scope) —
//    only the author can fix their own work
//  - status MUST be 'correction_requested' — admin's other
//    intermediate states (under_admin_review, approved) aren't
//    DI-editable, and 'published' is terminal
//  - same 50-2000 char content validation as createReport

export interface ResubmitReportInput {
  title: string;
  content: string;
  visibility: ReportVisibility;
  photoUuid?: string | null; // null = clear existing photo; undefined = leave as-is
}

export interface ResubmittableReport {
  id: string;
  childId: string;
  type: ReportType;
  title: string;
  content: string;
  visibility: ReportVisibility;
  photoUuid: string | null;
  correctionReason: string | null;
}

/**
 * Read a report row IF the caller is allowed to resubmit it. Returns
 * null when:
 *   - row doesn't exist
 *   - row's child isn't in the DI's scope (defense-in-depth)
 *   - row's created_by isn't this DI
 *   - row's status isn't 'correction_requested'
 *
 * Used by the /edit page to load the form's initial state with the
 * SAME guards the resubmit mutator will re-enforce on POST.
 */
export async function getReportForResubmit(
  userId: string,
  reportId: string,
): Promise<ResubmittableReport | null> {
  if (!UUID_RE.test(reportId)) return null;
  let row: (ReportRow & { child: string | null }) | null = null;
  try {
    const raw = await directusServer().request(
      readItem("child_update" as never, reportId as never, {
        fields: [...REPORT_FIELDS, "child"],
      } as never),
    );
    row = raw as unknown as (ReportRow & { child: string | null }) | null;
  } catch (err) {
    console.warn(
      "[di-reports] getReportForResubmit read failed",
      { reportId, err: err instanceof Error ? err.message : err },
    );
    return null;
  }
  if (!row || !row.child) return null;
  if (row.created_by !== userId) return null;
  if (row.status !== "correction_requested") return null;
  const child = await getDiChildById(row.child, userId);
  if (!child) return null;
  return {
    id: row.id,
    childId: row.child,
    type: isType(row.type) ? row.type : "story",
    title: row.title?.trim() || "",
    content: row.content?.trim() ?? "",
    visibility: isVis(row.visibility) ? row.visibility : "all_donors",
    photoUuid: row.photo,
    correctionReason: row.correction_reason,
  };
}

/**
 * Apply the DI's edits + flip status back to 'submitted_by_di'.
 * Clears correction_reason (the round-trip is closed; the admin's
 * note from THIS cycle should not persist past the next claim).
 * The row's sponsorship/task/report_type/created_by/donor_text-edit
 * history all stay untouched — admin's prior edits to donor_text are
 * NOT discarded (the DI's resubmit may have been a tiny fix and
 * admin's wording may still be the right donor copy). Admin can edit
 * again post-claim if needed.
 *
 * Returns the report's childId + sponsorship_id so the API route can
 * write a correctly-scoped audit row + notify admin.
 */
export async function resubmitReport(
  userId: string,
  reportId: string,
  input: ResubmitReportInput,
): Promise<{ reportId: string; childId: string; sponsorshipId: string | null }> {
  if (!UUID_RE.test(reportId)) {
    throw new InvalidInputError("reportId", "must be a uuid");
  }
  const trimmedTitle = input.title.trim();
  const trimmedContent = input.content.trim();
  if (trimmedTitle.length === 0) {
    throw new InvalidInputError("title", "required");
  }
  if (trimmedTitle.length > 200) {
    throw new InvalidInputError("title", "max 200 characters");
  }
  if (trimmedContent.length < 50) {
    throw new InvalidInputError("content", "must be at least 50 characters");
  }
  if (trimmedContent.length > 2000) {
    throw new InvalidInputError("content", "max 2000 characters");
  }
  if (!VALID_VIS.has(input.visibility)) {
    throw new InvalidInputError("visibility", "invalid value");
  }

  // Re-fetch with the SAME guards as getReportForResubmit, in case
  // status changed since the form loaded (admin could have re-claimed
  // and approved while the DI was editing).
  const existing = await getReportForResubmit(userId, reportId);
  if (!existing) {
    throw new OutOfScopeError(
      "Report not found, not yours, or no longer awaiting correction",
    );
  }

  // Photo handling: undefined → unchanged; null → clear; uuid → set.
  let photoPatch: Record<string, unknown> = {};
  if (input.photoUuid === null) {
    photoPatch = { photo: null };
  } else if (typeof input.photoUuid === "string" && input.photoUuid.length > 0) {
    photoPatch = { photo: input.photoUuid };
  }

  await directusServer().request(
    updateItem("child_update" as never, reportId as never, {
      title: trimmedTitle,
      content: trimmedContent,
      visibility: input.visibility,
      status: "submitted_by_di",
      correction_reason: null,
      ...photoPatch,
    } as never),
  );

  // Look up sponsorship_id for audit metadata (not on the
  // ResubmittableReport return shape — re-read the row).
  let sponsorshipId: string | null = null;
  try {
    const raw = await directusServer().request(
      readItem("child_update" as never, reportId as never, {
        fields: ["sponsorship"],
      } as never),
    );
    const peek = raw as unknown as { sponsorship?: string | null } | null;
    sponsorshipId = peek?.sponsorship ?? null;
  } catch {
    // Best-effort — audit can fire without it.
  }

  return {
    reportId,
    childId: existing.childId,
    sponsorshipId,
  };
}

// ─── Spine 1.2b — task→report loop close ───────────────────────────
//
// Surfaces any reports the DI has filed against a specific task. Used
// by /di/tasks/[id] to show the report-already-filed state + status,
// closing the task→report visual loop without changing either state
// machine.
//
// Scope guard: caller passes userId; we filter to `created_by = userId`
// so a DI only sees their OWN reports against the task. (Multiple DIs
// could in principle hit the same task across a re-assignment; we
// scope-narrow to the caller for privacy.)

export interface TaskReportLink {
  id: string;
  title: string;
  status: ReportStatus;
  reportType: ReportType_Spine | null;
  // Created-at is approximated by published_at (set on Spine 1.3) or
  // null until then. The card surfaces "filed" without a precise
  // timestamp; admin's audit log has the real timeline.
  publishedAt: string | null;
}

export async function listReportsForTask(
  userId: string,
  taskId: string,
): Promise<TaskReportLink[]> {
  if (!UUID_RE.test(taskId) || !UUID_RE.test(userId)) return [];
  let rows: Array<{
    id: string;
    title: string | null;
    status: string | null;
    report_type: string | null;
    published_at: string | null;
  }> = [];
  try {
    const raw = (await directusServer().request(
      readItems("child_update" as never, {
        filter: {
          _and: [
            { task: { _eq: taskId } },
            { created_by: { _eq: userId } },
          ],
        },
        fields: [
          "id",
          "title",
          "status",
          "report_type",
          "published_at",
        ] as const,
        sort: ["-id"],
        limit: 10,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(raw)) rows = raw;
  } catch (err) {
    console.warn(
      "[di-reports] listReportsForTask failed",
      { taskId, err: err instanceof Error ? err.message : err },
    );
    return [];
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title?.trim() || "(untitled)",
    status: isStatus(r.status) ? r.status : "pending",
    reportType:
      r.report_type === "progress" || r.report_type === "deployment"
        ? r.report_type
        : null,
    publishedAt: r.published_at,
  }));
}
