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

import { createItem, readItems, readUsers } from "@directus/sdk";
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

export type ReportStatus = "draft" | "pending" | "published" | "rejected";

export interface CreateReportInput {
  childId: string;
  type: ReportType;
  title: string;
  content: string; // 50-2000 chars
  visibility: ReportVisibility;
  photoUuid?: string;
}

export interface ReportSummary {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  photoUrl: string | null;
  visibility: ReportVisibility;
  status: ReportStatus;
  publishedAt: string | null;
  rejectionReason: string | null;
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
): Promise<{ reportId: string }> {
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

  const created = (await directusServer().request(
    createItem("child_update" as never, {
      child: input.childId,
      type: input.type,
      title: input.title.trim(),
      content: input.content.trim(),
      visibility: input.visibility,
      // Always 'pending' on insert — admin promotes to 'published'
      // (or rejects). The schema default is 'draft' but DI never
      // submits drafts; the form posts straight to pending.
      status: "pending",
      created_by: userId,
      ...(input.photoUuid ? { photo: input.photoUuid } : {}),
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-reports] createReport: no id returned");
  }
  return { reportId: String(id) };
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
] as const;

function isType(s: string | null | undefined): s is ReportType {
  return s !== null && s !== undefined && VALID_TYPES.has(s);
}

function isVis(s: string | null | undefined): s is ReportVisibility {
  return s !== null && s !== undefined && VALID_VIS.has(s);
}

function isStatus(s: string | null | undefined): s is ReportStatus {
  return (
    s === "draft" || s === "pending" || s === "published" || s === "rejected"
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
      visibility: isVis(r.visibility) ? r.visibility : "all_donors",
      status: isStatus(r.status) ? r.status : "pending",
      publishedAt: r.published_at,
      rejectionReason: r.rejection_reason,
      submittedByName: name,
      isOwn,
    };
  });
}
