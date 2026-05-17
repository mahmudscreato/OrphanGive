// Session 52b — Admin intake-photo review data layer.
//
// Reads + mutations for the /admin/reviews/intake-photos queue.
// Distinct from the documents flow because admin reviews intake
// photos PER CHILD (batched), not one at a time. The shape:
//
//   GET → list groups (one entry per child with pending photos)
//   GET → detail for one childId (all photos for that child)
//   POST → batch decide (array of {photoId, decision, reason?})
//   POST → single approve / reject (used by the per-photo controls
//          inside the detail page if the admin prefers granular)

import "server-only";

import {
  createItem,
  deleteItem,
  readItems,
  readUsers,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";

export type IntakePhotoStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "archived";

export interface AdminIntakePhotoSummary {
  id: string;
  childId: string;
  photoUuid: string;
  photoUrl: string;
  caption: string | null;
  displayOrder: number;
  status: IntakePhotoStatus;
  uploadedAt: string | null;
  uploadedByName: string;
  rejectionReason: string | null;
}

export interface AdminIntakePhotoGroup {
  childId: string;
  childDisplayName: string;
  pendingCount: number;
  totalCount: number;
  // First few photos for the thumbnail strip on the list page.
  thumbnails: ReadonlyArray<{ id: string; photoUrl: string; status: IntakePhotoStatus }>;
}

export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Photo not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidStatusError extends Error {
  readonly code = "invalid_status" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusError";
  }
}

// ─── Internal ───────────────────────────────────────────────────────

type IntakePhotoRow = {
  id: string;
  child: string | null;
  photo: string | null;
  caption: string | null;
  display_order: number | null;
  uploaded_by: string | null;
  status: string | null;
  date_created: string | null;
  rejection_reason: string | null;
};

const FIELDS = [
  "id",
  "child",
  "photo",
  "caption",
  "display_order",
  "uploaded_by",
  "status",
  "date_created",
  "rejection_reason",
] as const;

function isStatus(s: string | null | undefined): s is IntakePhotoStatus {
  return s === "pending" || s === "approved" || s === "rejected" || s === "archived";
}

async function resolveChildNames(
  childIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (childIds.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _in: childIds } },
        fields: ["id", "display_name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string; display_name: string | null }> | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r.display_name?.trim()) out.set(r.id, r.display_name.trim());
      }
    }
  } catch (err) {
    console.warn(
      "[admin-intake-photos] resolveChildNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _in: userIds } },
        fields: ["id", "first_name", "last_name", "email"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    }> | undefined;
    if (Array.isArray(users)) {
      for (const u of users) {
        const name =
          [u.first_name, u.last_name]
            .filter((s) => s && s.trim().length > 0)
            .join(" ")
            .trim() || u.email;
        out.set(u.id, name);
      }
    }
  } catch (err) {
    console.warn(
      "[admin-intake-photos] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

// ─── Public API: list grouped by child ──────────────────────────────

/**
 * Returns one group per child that has at least one PENDING intake
 * photo. Sorted by the child with the oldest pending photo first
 * (FIFO triage). The group entry includes a few thumbnails for the
 * list-page preview.
 */
export async function listIntakePhotoGroups(): Promise<AdminIntakePhotoGroup[]> {
  // First pass: pull all rows for children with at least one pending
  // photo. Cheaper than a second roundtrip per child.
  let pendingRows: IntakePhotoRow[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("child_intake_photo" as never, {
        filter: { status: { _eq: "pending" } },
        fields: ["child", "date_created"],
        sort: ["date_created"],
        limit: -1,
      } as never),
    )) as unknown as IntakePhotoRow[] | undefined;
    if (Array.isArray(rows)) pendingRows = rows;
  } catch (err) {
    console.warn(
      "[admin-intake-photos] pending-row pre-pass failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (pendingRows.length === 0) return [];

  // Ordered set of unique childIds — FIFO by oldest pending photo.
  const childOrder: string[] = [];
  const seen = new Set<string>();
  for (const r of pendingRows) {
    if (r.child && !seen.has(r.child)) {
      seen.add(r.child);
      childOrder.push(r.child);
    }
  }

  // Pull all photos for these children (not just pending) so the
  // thumbnail strip can show context.
  let allRows: IntakePhotoRow[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("child_intake_photo" as never, {
        filter: { child: { _in: childOrder } },
        fields: [...FIELDS],
        sort: ["child", "display_order"],
        limit: -1,
      } as never),
    )) as unknown as IntakePhotoRow[] | undefined;
    if (Array.isArray(rows)) allRows = rows;
  } catch (err) {
    console.warn(
      "[admin-intake-photos] all-rows fetch failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  const byChild = new Map<string, IntakePhotoRow[]>();
  for (const r of allRows) {
    if (!r.child) continue;
    const arr = byChild.get(r.child) ?? [];
    arr.push(r);
    byChild.set(r.child, arr);
  }

  const childNames = await resolveChildNames(childOrder);

  return childOrder.map((childId) => {
    const photos = byChild.get(childId) ?? [];
    const pending = photos.filter((p) => p.status === "pending");
    return {
      childId,
      childDisplayName: childNames.get(childId) ?? "Unknown child",
      pendingCount: pending.length,
      totalCount: photos.length,
      thumbnails: photos.slice(0, 5).map((p) => ({
        id: p.id,
        photoUrl: p.photo ? `/api/assets/${p.photo}` : "",
        status: isStatus(p.status) ? p.status : "pending",
      })),
    };
  });
}

// ─── Public API: per-child detail ───────────────────────────────────

export async function getIntakePhotosForChild(
  childId: string,
): Promise<AdminIntakePhotoSummary[]> {
  if (!childId) return [];
  let rows: IntakePhotoRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_intake_photo" as never, {
        filter: { child: { _eq: childId } },
        fields: [...FIELDS],
        sort: ["display_order", "date_created"],
        limit: -1,
      } as never),
    )) as unknown as IntakePhotoRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-intake-photos] getIntakePhotosForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  const userIds = Array.from(
    new Set(rows.map((r) => r.uploaded_by).filter((x): x is string => !!x)),
  );
  const userNames = await resolveUserNames(userIds);

  return rows
    .filter((r) => r.photo)
    .map((r) => ({
      id: r.id,
      childId: r.child ?? "",
      photoUuid: r.photo ?? "",
      photoUrl: r.photo ? `/api/assets/${r.photo}` : "",
      caption: r.caption?.trim() || null,
      displayOrder: typeof r.display_order === "number" ? r.display_order : 0,
      status: isStatus(r.status) ? r.status : "pending",
      uploadedAt: r.date_created,
      uploadedByName:
        (r.uploaded_by && userNames.get(r.uploaded_by)) || "Unknown DI",
      rejectionReason: r.rejection_reason?.trim() || null,
    }));
}

// ─── Public API: mutations ──────────────────────────────────────────

async function readPhotoRow(photoId: string): Promise<IntakePhotoRow> {
  const rows = (await directusServer().request(
    readItems("child_intake_photo" as never, {
      filter: { id: { _eq: photoId } },
      fields: [...FIELDS],
      limit: 1,
    } as never),
  )) as unknown as IntakePhotoRow[] | undefined;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) throw new NotFoundError();
  return row;
}

export async function approveIntakePhoto(
  photoId: string,
  adminUserId: string,
): Promise<{ photoId: string; childId: string | null; uploaderId: string | null }> {
  const row = await readPhotoRow(photoId);
  if (row.status === "approved") {
    throw new InvalidStatusError("Photo is already approved.");
  }
  if (row.status === "rejected" || row.status === "archived") {
    throw new InvalidStatusError(`Cannot approve a ${row.status} photo.`);
  }

  await directusServer().request(
    updateItem("child_intake_photo" as never, photoId as never, {
      status: "approved",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    } as never),
  );

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_approved_intake_photo",
        collection: "child_intake_photo",
        record_id: photoId,
        metadata: { ...(row.child ? { childId: row.child } : {}) },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-intake-photos] approve audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    photoId,
    childId: row.child ?? null,
    uploaderId: row.uploaded_by ?? null,
  };
}

export async function rejectIntakePhoto(
  photoId: string,
  adminUserId: string,
  reason: string,
): Promise<{ photoId: string; childId: string | null; uploaderId: string | null; reason: string }> {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 10) {
    throw new Error("rejection reason must be at least 10 characters");
  }

  const row = await readPhotoRow(photoId);
  if (row.status === "approved" || row.status === "archived") {
    throw new InvalidStatusError(`Cannot reject a ${row.status} photo.`);
  }

  await directusServer().request(
    updateItem("child_intake_photo" as never, photoId as never, {
      status: "rejected",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: trimmed,
    } as never),
  );

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_rejected_intake_photo",
        collection: "child_intake_photo",
        record_id: photoId,
        metadata: { ...(row.child ? { childId: row.child } : {}) },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-intake-photos] reject audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    photoId,
    childId: row.child ?? null,
    uploaderId: row.uploaded_by ?? null,
    reason: trimmed,
  };
}

/**
 * Session 52c — admin cleanup remove for intake photos.
 *
 * Distinct from rejectIntakePhoto:
 *   - reject: decision recorded, DI sees reason in notification.
 *   - remove: hard delete; admin uses this for accidental DI
 *     uploads (DI typically agrees the upload was wrong, no
 *     feedback to communicate).
 *
 * Gated to `pending` status only — already-decided photos are
 * immutable via this UI. The directus_files row is NOT deleted
 * (FK ON DELETE RESTRICT prevents stranding); orphan-file sweep
 * handles cleanup separately.
 */
/**
 * Session 52d — admin direct upload of an intake photo. Lands as
 * `status='approved'` immediately (no review queue self-loop —
 * admin doesn't need to review themselves) with `uploaded_by` set
 * to the admin user. Used on `/admin/reviews/intake-photos/[childId]`
 * when admin needs to add photos a DI never uploaded (e.g., site
 * visit photos taken by admin staff directly).
 *
 * Pre-conditions: the `photoUuid` must be a `directus_files` row
 * already uploaded via the existing `uploadPhotoToDirectus` helper
 * (we don't re-upload here; this just registers the row).
 *
 * `displayOrder` defaults to (max existing display_order + 1) so
 * the new photo appears at the end of the grid.
 */
export async function uploadDirectIntakePhoto(input: {
  adminUserId: string;
  childId: string;
  photoUuid: string;
  caption?: string | null;
  displayOrder?: number | null;
}): Promise<{ photoId: string; childId: string }> {
  const { adminUserId, childId, photoUuid } = input;
  if (!adminUserId || !childId || !photoUuid) {
    throw new InvalidStatusError("missing required fields");
  }

  // Compute default displayOrder if omitted: max existing + 1.
  let resolvedOrder = input.displayOrder ?? null;
  if (resolvedOrder === null || !Number.isFinite(resolvedOrder)) {
    try {
      const rows = (await directusServer().request(
        readItems("child_intake_photo" as never, {
          filter: { child: { _eq: childId } },
          fields: ["display_order"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ display_order: number | null }> | undefined;
      const maxOrder =
        Array.isArray(rows) && rows.length > 0
          ? Math.max(
              ...rows.map((r) =>
                typeof r.display_order === "number" ? r.display_order : 0,
              ),
            )
          : -1;
      resolvedOrder = maxOrder + 1;
    } catch {
      resolvedOrder = 0;
    }
  }

  const created = (await directusServer().request(
    createItem("child_intake_photo" as never, {
      child: childId,
      photo: photoUuid,
      caption: input.caption?.trim() || null,
      display_order: Math.max(0, Math.round(resolvedOrder)),
      // Admin uploads land approved immediately — they're authoritative.
      status: "approved",
      uploaded_by: adminUserId,
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[admin-intake-photos] uploadDirectIntakePhoto: no id returned");
  }

  // Best-effort audit. Failure swallowed.
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_uploaded_intake_photo",
        collection: "child_intake_photo",
        record_id: id,
        metadata: { childId, photoUuid },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-intake-photos] upload audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return { photoId: String(id), childId };
}

export async function removeIntakePhoto(
  photoId: string,
  adminUserId: string,
  // Session 52d — optional reason, REQUIRED at the route layer
  // when removing an already-approved row. Surfaces in DI
  // notification + audit metadata.
  reason?: string | null,
): Promise<{
  photoId: string;
  childId: string | null;
  uploaderId: string | null;
  wasStatus: IntakePhotoStatus;
}> {
  const row = await readPhotoRow(photoId);
  const previousStatus = (
    row.status === "pending" ||
    row.status === "approved" ||
    row.status === "rejected" ||
    row.status === "archived"
      ? row.status
      : "pending"
  ) as IntakePhotoStatus;

  // Session 52d — admin can remove at any status. The pending vs
  // post-approval distinction lives in the audit action + (caller's)
  // notification choice.

  await directusServer().request(
    deleteItem("child_intake_photo" as never, photoId as never),
  );

  const auditAction =
    previousStatus === "approved"
      ? "admin_removed_approved_intake_photo"
      : "admin_removed_intake_photo";
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: auditAction,
        collection: "child_intake_photo",
        record_id: photoId,
        metadata: {
          ...(row.child ? { childId: row.child } : {}),
          previousStatus,
          ...(reason && reason.trim().length > 0
            ? { reason: reason.trim() }
            : {}),
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-intake-photos] remove audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    photoId,
    childId: row.child ?? null,
    uploaderId: row.uploaded_by ?? null,
    wasStatus: previousStatus,
  };
}
