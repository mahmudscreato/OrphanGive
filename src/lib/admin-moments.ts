// Session 52b — Admin moment review data layer.
//
// `child_moment` lifecycle (per Session 45):
//   pending → published (admin approves) → donors see it
//             → rejected (admin rejects, optional reason)
//
// Approve flips status to 'published' (NOT 'approved' — the donor-
// facing reader gates on status='published'). Reject sets
// status='rejected' + writes rejection_reason. Both audit
// admin_approved_moment / admin_rejected_moment and notify the DI.

import "server-only";

import { createItem, readItems, readUsers, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

export type MomentReviewFilter = "pending" | "published" | "rejected" | "all";
export type MomentDisplayStatus =
  | "pending"
  | "published"
  | "rejected"
  | "draft";

export interface AdminMomentSummary {
  id: string;
  childId: string;
  childDisplayName: string;
  fileUuid: string;
  fileUrl: string;
  mediaType: "image" | "video";
  caption: string | null;
  takenAt: string | null;
  status: MomentDisplayStatus;
  uploadedAt: string | null;
  uploadedByName: string;
}

export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "Moment not found") {
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

type MomentRow = {
  id: string;
  child: string | null;
  photo: string | null;
  caption: string | null;
  taken_at: string | null;
  media_type: string | null;
  status: string | null;
  date_created: string | null;
  created_by: string | null;
};

const FIELDS = [
  "id",
  "child",
  "photo",
  "caption",
  "taken_at",
  "media_type",
  "status",
  "date_created",
  "created_by",
  // child_moment uses `rejection_reason` for admin-to-DI feedback;
  // not surfaced on the list page but read on detail.
  "rejection_reason",
] as const;

function isDisplayStatus(s: string | null | undefined): s is MomentDisplayStatus {
  return s === "pending" || s === "published" || s === "rejected" || s === "draft";
}

function isMediaType(s: string | null | undefined): "image" | "video" {
  return s === "video" ? "video" : "image";
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
      "[admin-moments] resolveChildNames failed",
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
      "[admin-moments] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

function rowToSummary(
  row: MomentRow,
  childNames: ReadonlyMap<string, string>,
  userNames: ReadonlyMap<string, string>,
): AdminMomentSummary {
  return {
    id: row.id,
    childId: row.child ?? "",
    childDisplayName:
      (row.child && childNames.get(row.child)) || "Unknown child",
    fileUuid: row.photo ?? "",
    fileUrl: row.photo ? `/api/assets/${row.photo}` : "",
    mediaType: isMediaType(row.media_type),
    caption: row.caption?.trim() || null,
    takenAt: row.taken_at,
    status: isDisplayStatus(row.status) ? row.status : "pending",
    uploadedAt: row.date_created,
    uploadedByName:
      (row.created_by && userNames.get(row.created_by)) || "Unknown DI",
  };
}

// ─── Public: list ───────────────────────────────────────────────────

export async function listAdminMoments(opts?: {
  filter?: MomentReviewFilter;
  limit?: number;
}): Promise<AdminMomentSummary[]> {
  const filter = opts?.filter ?? "pending";

  const STATUS_IN: Record<MomentReviewFilter, string[] | null> = {
    all: null,
    pending: ["pending"],
    published: ["published"],
    rejected: ["rejected"],
  };
  const statusValues = STATUS_IN[filter];

  let rows: MomentRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_moment" as never, {
        ...(statusValues
          ? { filter: { status: { _in: statusValues } } }
          : {}),
        fields: [...FIELDS],
        sort: filter === "pending" ? ["date_created"] : ["-date_created"],
        limit: opts?.limit ?? 100,
      } as never),
    )) as unknown as MomentRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-moments] listAdminMoments failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  const childIds = Array.from(
    new Set(rows.map((r) => r.child).filter((x): x is string => !!x)),
  );
  const userIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)),
  );
  const [childNames, userNames] = await Promise.all([
    resolveChildNames(childIds),
    resolveUserNames(userIds),
  ]);

  return rows.map((r) => rowToSummary(r, childNames, userNames));
}

// ─── Public: detail ─────────────────────────────────────────────────

export interface AdminMomentDetail extends AdminMomentSummary {
  rejectionReason: string | null;
}

export async function getAdminMomentDetail(
  momentId: string,
): Promise<AdminMomentDetail | null> {
  if (!momentId) return null;
  let row: (MomentRow & { rejection_reason?: string | null }) | null = null;
  try {
    const result = (await directusServer().request(
      readItems("child_moment" as never, {
        filter: { id: { _eq: momentId } },
        fields: [...FIELDS],
        limit: 1,
      } as never),
    )) as unknown as Array<MomentRow & { rejection_reason?: string | null }> | undefined;
    row = result?.[0] ?? null;
  } catch (err) {
    console.warn(
      "[admin-moments] getAdminMomentDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  const [childNames, userNames] = await Promise.all([
    row.child ? resolveChildNames([row.child]) : Promise.resolve(new Map()),
    row.created_by
      ? resolveUserNames([row.created_by])
      : Promise.resolve(new Map()),
  ]);
  const base = rowToSummary(row, childNames, userNames);
  return {
    ...base,
    rejectionReason: row.rejection_reason?.trim() || null,
  };
}

// ─── Public: mutations ──────────────────────────────────────────────

async function readMomentRow(
  momentId: string,
): Promise<MomentRow & { rejection_reason?: string | null }> {
  const rows = (await directusServer().request(
    readItems("child_moment" as never, {
      filter: { id: { _eq: momentId } },
      fields: [...FIELDS],
      limit: 1,
    } as never),
  )) as unknown as Array<MomentRow & { rejection_reason?: string | null }> | undefined;
  const row = rows?.[0];
  if (!row) throw new NotFoundError();
  return row;
}

export async function approveMoment(
  momentId: string,
  adminUserId: string,
): Promise<{ momentId: string; childId: string | null; uploaderId: string | null }> {
  const row = await readMomentRow(momentId);
  if (row.status === "published") {
    throw new InvalidStatusError("Moment is already published.");
  }
  if (row.status === "rejected") {
    throw new InvalidStatusError("Cannot approve a rejected moment.");
  }

  await directusServer().request(
    updateItem("child_moment" as never, momentId as never, {
      status: "published",
      // Some installs also have a published_at column; harmless if
      // not present (Directus ignores unknown keys on update).
      published_at: new Date().toISOString(),
      rejection_reason: null,
    } as never),
  );

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_approved_moment",
        collection: "child_moment",
        record_id: momentId,
        metadata: { ...(row.child ? { childId: row.child } : {}) },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-moments] approve audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    momentId,
    childId: row.child ?? null,
    uploaderId: row.created_by ?? null,
  };
}

export async function rejectMoment(
  momentId: string,
  adminUserId: string,
  reason: string,
): Promise<{ momentId: string; childId: string | null; uploaderId: string | null; reason: string }> {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 10) {
    throw new Error("rejection reason must be at least 10 characters");
  }

  const row = await readMomentRow(momentId);
  if (row.status === "published") {
    throw new InvalidStatusError(
      "Cannot reject a published moment via this UI — admin can flip it directly in Directus if needed.",
    );
  }

  await directusServer().request(
    updateItem("child_moment" as never, momentId as never, {
      status: "rejected",
      rejection_reason: trimmed,
    } as never),
  );

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: adminUserId,
        actor_role: "admin",
        action: "admin_rejected_moment",
        collection: "child_moment",
        record_id: momentId,
        metadata: { ...(row.child ? { childId: row.child } : {}) },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin-moments] reject audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    momentId,
    childId: row.child ?? null,
    uploaderId: row.created_by ?? null,
    reason: trimmed,
  };
}
