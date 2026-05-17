// Session 45 — DI moment data layer.
//
// Moments are additive content (photos / short videos). Unlike
// Session 44's child_proposal pattern, there's no proposal layer
// here — the row goes straight into `child_moment` with status
// 'pending', and admin reviews each row directly.
//
// Schema reality (from Session 45 discovery, differs from spec):
//
//   child_moment columns:
//     id            uuid PK
//     child         uuid M2O child   NOT NULL
//     photo         uuid M2O dir_files NOT NULL  ← reused for video too
//                                                 (column name is misleading
//                                                 but Postgres doesn't care
//                                                 about file MIME)
//     caption       text             NULLABLE
//     taken_at      date             NULLABLE   ← spec called this moment_date
//     display_order integer          NOT NULL default 0
//     status        text             NOT NULL default 'pending'
//                                    (enum dropdown: draft|published, but
//                                     column is varchar — Session 41-v3
//                                     intent is pending → published)
//     created_by    uuid             NULLABLE   ← spec called this uploaded_by
//     date_created  timestamp        NULLABLE  no auto-default — set explicitly
//     media_type    text             default 'image'  ← values: 'image' | 'video'
//     duration_seconds integer       NULLABLE  ← null for image, 1-60 for video
//
// Privacy:
//   - Every read scope-checks the childId via getDiChildById
//   - Every write scope-checks AND overrides created_by with session.userId
//   - Out-of-scope reads return null (caller maps to []); writes throw
//     OutOfScopeError mapping to 404

import "server-only";

import { createItem, readItems, readUsers, withToken } from "@directus/sdk";
import { directusServer } from "./directus";
import { getDiChildById } from "./di-children";

// ─── Public types ───────────────────────────────────────────────────

export type MomentMediaType = "image" | "video";
export type MomentStatus = "draft" | "pending" | "published" | "rejected";

export interface CreateMomentInput {
  childId: string;
  caption: string;
  takenAt: string; // ISO date YYYY-MM-DD
  mediaType: MomentMediaType;
  // Always set — for image moments this is the photo file UUID; for
  // video moments this is the video file UUID. Stored on the same
  // child_moment.photo column.
  fileUuid: string;
  durationSeconds?: number; // required for video; null for image
}

export interface MomentSummary {
  id: string;
  caption: string | null;
  takenAt: string | null;
  mediaType: MomentMediaType;
  mediaUrl: string; // /api/assets/{uuid}
  durationSeconds: number | null;
  status: MomentStatus;
  uploadedAt: string | null;
  uploadedByName: string; // "You" if self, else first_name or "Unknown"
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

// ─── Validators ─────────────────────────────────────────────────────

function validateDate(field: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidInputError(field, "expected YYYY-MM-DD");
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidInputError(field, "not a real date");
  }
  // Disallow future dates — moments are records of things that happened.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    throw new InvalidInputError(field, "cannot be in the future");
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Insert a new child_moment with status='pending'. Scope-checks the
 * child first; throws OutOfScopeError on miss.
 *
 * IMPORTANT — `child_moment.created_by` has Directus's `user-created`
 * special, which auto-fills to the *authenticated user* and ignores
 * any explicit value sent in the body. If we POST with the admin
 * token, every row gets stamped with the admin user's ID, breaking
 * scope filtering on subsequent reads (and admin's own dashboards).
 *
 * Fix: issue this one create call AS THE DI USER via `withToken`
 * (the SDK request modifier). The DI policy already has CREATE on
 * child_moment with no filter (Session 41-v3), so this works without
 * any policy changes. All READ calls in this file stay on the admin
 * client — DI's read filter is a strict subset of admin's view, and
 * we still want to surface everyone's moments on a shared child.
 */
export async function createMoment(
  session: { userId: string; accessToken: string },
  input: CreateMomentInput,
): Promise<{ momentId: string }> {
  const userId = session.userId;
  // Scope guard.
  const child = await getDiChildById(input.childId, userId);
  if (!child) throw new OutOfScopeError();

  // Validation.
  if (!input.caption || input.caption.trim().length === 0) {
    throw new InvalidInputError("caption", "required");
  }
  if (input.caption.trim().length > 200) {
    throw new InvalidInputError("caption", "max 200 characters");
  }
  validateDate("takenAt", input.takenAt);
  if (!input.fileUuid || input.fileUuid.length < 8) {
    throw new InvalidInputError("fileUuid", "required");
  }
  if (input.mediaType !== "image" && input.mediaType !== "video") {
    throw new InvalidInputError("mediaType", "must be 'image' or 'video'");
  }
  if (input.mediaType === "video") {
    if (
      input.durationSeconds === undefined ||
      input.durationSeconds === null ||
      !Number.isFinite(input.durationSeconds)
    ) {
      throw new InvalidInputError(
        "durationSeconds",
        "required for video moments",
      );
    }
    if (input.durationSeconds < 1 || input.durationSeconds > 60) {
      throw new InvalidInputError(
        "durationSeconds",
        "must be between 1 and 60 seconds",
      );
    }
  }

  const created = (await directusServer().request(
    withToken(
      session.accessToken,
      createItem("child_moment" as never, {
        child: input.childId,
        photo: input.fileUuid,
        caption: input.caption.trim(),
        taken_at: input.takenAt,
        media_type: input.mediaType,
        duration_seconds:
          input.mediaType === "video"
            ? Math.round(input.durationSeconds!)
            : null,
        status: "pending",
        // created_by + date_created are auto-filled via Directus
        // 'user-created' / 'date-created' specials — passing them
        // explicitly would be ignored anyway. Auth above handles
        // the user; the timestamp comes from the server clock.
      } as never),
    ),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-moments] createMoment: no id returned");
  }
  return { momentId: String(id) };
}

/**
 * List moments for a child. Returns ALL statuses (DI sees their own
 * pending alongside published ones with a status indicator); empty
 * array on out-of-scope (caller renders empty state, not 404 — the
 * panel is reached via the detail page which already 404s if needed).
 */
type MomentRow = {
  id: string;
  caption: string | null;
  taken_at: string | null;
  media_type: string | null;
  duration_seconds: number | null;
  status: string | null;
  date_created: string | null;
  created_by: string | null;
  photo: string | null;
};

const MOMENT_FIELDS = [
  "id",
  "caption",
  "taken_at",
  "media_type",
  "duration_seconds",
  "status",
  "date_created",
  "created_by",
  "photo",
] as const;

function isMomentMediaType(s: string | null | undefined): s is MomentMediaType {
  return s === "image" || s === "video";
}

function isMomentStatus(s: string | null | undefined): s is MomentStatus {
  return (
    s === "draft" || s === "pending" || s === "published" || s === "rejected"
  );
}

export async function listMomentsForChild(
  userId: string,
  childId: string,
): Promise<MomentSummary[]> {
  // Scope guard.
  const child = await getDiChildById(childId, userId);
  if (!child) return [];

  let rows: MomentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_moment" as never, {
        filter: { child: { _eq: childId } },
        fields: [...MOMENT_FIELDS],
        // Newest at top — date taken first, then upload date as tiebreak.
        sort: ["-taken_at", "-date_created"],
        limit: -1,
      } as never),
    )) as unknown as MomentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-moments] listMomentsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  // Resolve uploader names in one batch.
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
        "[di-moments] uploader name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return rows
    .filter((r) => r.photo) // skip rows without media (data integrity)
    .map((r) => {
      const isOwn = r.created_by === userId;
      const name = isOwn
        ? "You"
        : r.created_by
          ? nameById.get(r.created_by) ?? "Unknown"
          : "Unknown";
      return {
        id: r.id,
        caption: r.caption?.trim() ?? null,
        takenAt: r.taken_at,
        mediaType: isMomentMediaType(r.media_type) ? r.media_type : "image",
        mediaUrl: `/api/assets/${r.photo!}`,
        durationSeconds: r.duration_seconds ?? null,
        status: isMomentStatus(r.status) ? r.status : "pending",
        uploadedAt: r.date_created,
        uploadedByName: name,
        isOwn,
      };
    });
}
