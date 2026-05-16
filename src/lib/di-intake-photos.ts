// Session 48b — DI intake-photos data layer.
//
// child_intake_photo holds the 3-5 onboarding photos that document
// the initial field visit (room, sleeping space, school items,
// etc.). Distinct from child_moment (which is the post-sponsorship
// life-update timeline donors see).
//
// Schema (per migrations/session-48b/001-intake-photos.sql):
//
//   id                uuid PK
//   child             uuid NOT NULL FK -> child(id) ON DELETE CASCADE
//   proposal          uuid     FK -> child_proposal(id) ON DELETE SET NULL
//   photo             uuid NOT NULL FK -> directus_files(id) ON DELETE RESTRICT
//   caption           text
//   display_order     integer DEFAULT 0
//   uploaded_by       uuid     FK -> directus_users(id) ON DELETE SET NULL
//   status            varchar(32) DEFAULT 'pending'
//   reviewed_by       uuid     FK -> directus_users(id)
//   reviewed_at       timestamptz
//   rejection_reason  text
//   date_created      timestamptz DEFAULT now()
//
// Privacy:
//   - Every read AND write scope-checks the childId via
//     canDiAttachToChild (Session 52c — ownership-only check that
//     includes own stubs with status='awaiting_intake' so the
//     draft-mode unlock from Session 52a actually works).
//   - Every write uses the DI session token so uploaded_by auto-
//     fills correctly (matches the child_moment pattern — admin
//     token would stamp admin's UUID and break later "own rows"
//     filters).
//   - Out-of-scope reads return [] (caller renders empty state);
//     writes throw OutOfScopeError → 404 at the route layer.
//
// Constraint reality:
//   - `child` is NOT NULL. CREATE-mode child profiles don't have a
//     child UUID until admin approves. The form-side workaround for
//     Session 48b is to disable the intake-photo grid in create mode
//     and surface a hint that intake photos can be attached after
//     the profile is approved. Edit-mode and post-approval flows
//     work fully.

import "server-only";

import {
  createItem,
  deleteItem,
  readItem,
  readItems,
  updateItem,
  withToken,
} from "@directus/sdk";
import { directusServer } from "./directus";
import { canDiAttachToChild } from "./di-children";

// ─── Public types ───────────────────────────────────────────────────

export type IntakePhotoStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "archived";

export interface IntakePhotoSummary {
  id: string;
  childId: string;
  photoUrl: string; // /api/assets/{uuid}
  photoUuid: string;
  caption: string | null;
  displayOrder: number;
  status: IntakePhotoStatus;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
  isOwn: boolean;
  rejectionReason: string | null;
}

export interface CreateIntakePhotoInput {
  childId: string;
  photoUuid: string;
  caption?: string | null;
  displayOrder?: number;
  // Optional — only set when this intake photo is being attached as
  // part of a CREATE proposal. For edit-mode uploads against a live
  // child this stays null.
  proposalId?: string | null;
}

export interface UpdateIntakePhotoInput {
  caption?: string | null;
  displayOrder?: number;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class OutOfScopeError extends Error {
  readonly code = "out_of_scope" as const;
  constructor(message = "Intake photo not in DI scope") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

export class InvalidInputError extends Error {
  readonly code = "invalid_input" as const;
  constructor(public readonly field: string, reason: string) {
    super(`${field}: ${reason}`);
    this.name = "InvalidInputError";
  }
}

// ─── Internal types ─────────────────────────────────────────────────

type IntakePhotoRow = {
  id: string;
  child: string | null;
  proposal: string | null;
  photo: string | null;
  caption: string | null;
  display_order: number | null;
  uploaded_by: string | null;
  status: string | null;
  date_created: string | null;
  rejection_reason: string | null;
};

const INTAKE_PHOTO_FIELDS = [
  "id",
  "child",
  "proposal",
  "photo",
  "caption",
  "display_order",
  "uploaded_by",
  "status",
  "date_created",
  "rejection_reason",
] as const;

function isIntakePhotoStatus(s: string | null | undefined): s is IntakePhotoStatus {
  return s === "pending" || s === "approved" || s === "rejected" || s === "archived";
}

function rowToSummary(row: IntakePhotoRow, userId: string): IntakePhotoSummary {
  return {
    id: row.id,
    childId: row.child ?? "",
    photoUrl: row.photo ? `/api/assets/${row.photo}` : "",
    photoUuid: row.photo ?? "",
    caption: row.caption?.trim() ?? null,
    displayOrder: typeof row.display_order === "number" ? row.display_order : 0,
    status: isIntakePhotoStatus(row.status) ? row.status : "pending",
    uploadedAt: row.date_created,
    uploadedByUserId: row.uploaded_by,
    isOwn: row.uploaded_by === userId,
    rejectionReason: row.rejection_reason?.trim() ?? null,
  };
}

// ─── Public API: read ───────────────────────────────────────────────

/**
 * List a child's intake photos sorted by display_order. Scope-guarded:
 * returns [] if the DI doesn't have access to the child.
 *
 * Returns ALL statuses (not just own pending) so the DI can see what
 * admin has approved/rejected on the child too. Per-row `isOwn` lets
 * the UI gate edit/remove buttons.
 */
export async function listIntakePhotosForChild(
  userId: string,
  childId: string,
): Promise<IntakePhotoSummary[]> {
  // Session 52c — ownership-only check (includes own stubs).
  const ok = await canDiAttachToChild(childId, userId);
  if (!ok) return [];

  let rows: IntakePhotoRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_intake_photo" as never, {
        filter: { child: { _eq: childId } },
        fields: [...INTAKE_PHOTO_FIELDS],
        sort: ["display_order", "date_created"],
        limit: -1,
      } as never),
    )) as unknown as IntakePhotoRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-intake-photos] listIntakePhotosForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows.filter((r) => r.photo).map((r) => rowToSummary(r, userId));
}

/**
 * Fetch a single intake photo and confirm the DI owns it (uploaded_by
 * = userId). Returns null on miss / not-owned. Used by the PATCH/DELETE
 * paths before mutation to collapse "not exists" with "not allowed".
 */
async function getOwnIntakePhoto(
  userId: string,
  photoId: string,
): Promise<IntakePhotoRow | null> {
  if (!photoId || typeof photoId !== "string") return null;
  try {
    const row = (await directusServer().request(
      readItem("child_intake_photo" as never, photoId, {
        fields: [...INTAKE_PHOTO_FIELDS],
      } as never),
    )) as unknown as IntakePhotoRow | undefined;
    if (!row) return null;
    if (row.uploaded_by !== userId) return null;
    return row;
  } catch {
    return null;
  }
}

// ─── Public API: write ──────────────────────────────────────────────

/**
 * Create an intake photo. Pre-conditions:
 *   - The DI must have scope on the target child.
 *   - photoUuid must be a non-empty string (the file is assumed
 *     uploaded already via /api/di/uploads/photo or the same upload
 *     pipeline used for moments).
 *
 * Issued AS THE DI USER via withToken so `uploaded_by` (which is set
 * with the `user-created` special on the field) gets stamped with the
 * DI's UUID rather than admin's.
 */
export async function createIntakePhoto(
  session: { userId: string; accessToken: string },
  input: CreateIntakePhotoInput,
): Promise<{ photoId: string }> {
  // Validation.
  if (!input.childId || typeof input.childId !== "string") {
    throw new InvalidInputError("childId", "required");
  }
  if (!input.photoUuid || input.photoUuid.length < 8) {
    throw new InvalidInputError("photoUuid", "required");
  }
  if (input.caption && input.caption.trim().length > 200) {
    throw new InvalidInputError("caption", "max 200 characters");
  }

  // Session 52c — ownership-only scope guard (includes own stubs).
  const ok = await canDiAttachToChild(input.childId, session.userId);
  if (!ok) throw new OutOfScopeError();

  const created = (await directusServer().request(
    withToken(
      session.accessToken,
      createItem("child_intake_photo" as never, {
        child: input.childId,
        proposal: input.proposalId ?? null,
        photo: input.photoUuid,
        caption: input.caption?.trim() || null,
        display_order:
          typeof input.displayOrder === "number" && Number.isFinite(input.displayOrder)
            ? Math.max(0, Math.round(input.displayOrder))
            : 0,
        status: "pending",
        // uploaded_by + date_created auto-fill via Directus specials —
        // user-created and date-created respectively.
      } as never),
    ),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-intake-photos] createIntakePhoto: no id returned");
  }
  return { photoId: String(id) };
}

/**
 * Patch caption and/or display_order on a pending intake photo.
 * Throws OutOfScopeError if the row isn't owned by the DI OR isn't
 * in pending status (collapsed for privacy).
 */
export async function updateIntakePhoto(
  userId: string,
  photoId: string,
  fields: UpdateIntakePhotoInput,
): Promise<{ ok: true }> {
  const row = await getOwnIntakePhoto(userId, photoId);
  if (!row) throw new OutOfScopeError();
  if (row.status !== "pending") throw new OutOfScopeError();

  // Validation.
  const patch: Record<string, unknown> = {};
  if (fields.caption !== undefined) {
    if (fields.caption && fields.caption.trim().length > 200) {
      throw new InvalidInputError("caption", "max 200 characters");
    }
    patch.caption = fields.caption?.trim() || null;
  }
  if (fields.displayOrder !== undefined) {
    if (!Number.isFinite(fields.displayOrder)) {
      throw new InvalidInputError("displayOrder", "must be a number");
    }
    patch.display_order = Math.max(0, Math.round(fields.displayOrder));
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  await directusServer().request(
    updateItem("child_intake_photo" as never, photoId, patch as never),
  );
  return { ok: true };
}

/**
 * Delete a pending intake photo owned by this DI. Throws
 * OutOfScopeError on miss / not-owned / not-pending. Hard delete —
 * intake photos in the pending state have no audit history to preserve
 * beyond the audit_log row that records the deletion.
 *
 * Note: the underlying directus_files row is NOT deleted. Admin
 * cleanup sweeps orphaned files separately; the FK to directus_files
 * is ON DELETE RESTRICT specifically so we never strand the file.
 */
export async function deleteIntakePhoto(
  userId: string,
  photoId: string,
): Promise<{ ok: true; childId: string }> {
  const row = await getOwnIntakePhoto(userId, photoId);
  if (!row) throw new OutOfScopeError();
  if (row.status !== "pending") throw new OutOfScopeError();

  await directusServer().request(
    deleteItem("child_intake_photo" as never, photoId),
  );
  return { ok: true, childId: row.child ?? "" };
}

/**
 * Bulk reorder helper — applies a new display_order to a batch of
 * intake photos. All target rows must be owned by the DI AND in
 * pending status (we filter strictly; mismatched rows are silently
 * skipped). Used by the form's drag-reorder UI on save.
 */
export async function reorderIntakePhotos(
  userId: string,
  ordered: Array<{ id: string; displayOrder: number }>,
): Promise<{ updated: number }> {
  let updated = 0;
  // Sequential rather than Promise.all to keep the audit ordering
  // deterministic and avoid hammering Directus.
  for (const item of ordered) {
    try {
      const row = await getOwnIntakePhoto(userId, item.id);
      if (!row) continue;
      if (row.status !== "pending") continue;
      const newOrder = Math.max(0, Math.round(item.displayOrder));
      if (row.display_order === newOrder) continue;
      await directusServer().request(
        updateItem("child_intake_photo" as never, item.id, {
          display_order: newOrder,
        } as never),
      );
      updated += 1;
    } catch (err) {
      console.warn(
        "[di-intake-photos] reorderIntakePhotos partial failure",
        { id: item.id, err: err instanceof Error ? err.message : err },
      );
    }
  }
  return { updated };
}
