// Session 47 — DI in-app notification data layer.
//
// Notifications are written by server-side admin action handlers
// (approveProposal, rejectProposal, future admin assign / verify
// flows) and read by the DI's bell + /di/notifications page.
//
// Schema reality (Session 47 discovery — collection already existed):
//   notification:
//     id            uuid PK
//     recipient     uuid M2O directus_users  NOT NULL
//     type          string                  NOT NULL  (one of NotificationType)
//     payload       json                    NULLABLE  (cast-json) — holds
//                                                       title, body,
//                                                       relatedCollection,
//                                                       relatedId
//     read          boolean                 NOT NULL  default false
//     read_at       timestamp               NULLABLE
//     date_created  timestamp               NULLABLE  auto-fills via
//                                                       Directus 'date-created' special
//     created_by    uuid M2O directus_users NULLABLE  auto-fills via
//                                                       'user-created' special
//
// Privacy:
//   - Every read filters by recipient = userId (defence-in-depth on
//     top of the Directus permission rule that already enforces this).
//   - Mark-as-read updates only own rows.
//   - notify() is admin-token only — DI cannot create notifications.
//   - Body text may reference children by display_name (Tier 1 safe)
//     but MUST NOT include donor PII.
//
// Failure mode for notify():
//   Notification writes are best-effort. If the insert fails, log to
//   console.error and return — the parent admin action stays
//   successful. (Same rule as audit_log writes from Session 46.)

import "server-only";

import { createItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

export type NotificationType =
  // Wired in Session 47 — admin-proposals.ts approve/reject paths.
  | "admin_approved_proposal"
  | "admin_rejected_proposal"
  // TODO Session 47.5+: wire `admin_assigned_child` notification when
  // the admin UI for assigning a child to a DI is built (currently
  // admins set child.assigned_di by hand in Directus admin — no
  // server-side handler to hook into).
  | "admin_assigned_child"
  // TODO Session 47.5+: wire `admin_assigned_task` notification when
  // admin task creation has a server-side handler (currently admins
  // create tasks directly via Directus admin — no /api hook).
  | "admin_assigned_task"
  // TODO Session 47.5+: wire `admin_verified_delivery` notification
  // when admin delivery verification has a server-side handler
  // (currently admins flip aid_delivery.status='verified' via
  // Directus admin — no /api hook).
  | "admin_verified_delivery";

export interface NotificationPayload {
  title: string;
  body: string;
  // Optional deep-link target. The UI uses (relatedCollection,
  // relatedId) to decide where the row's click goes.
  relatedCollection?: string;
  relatedId?: string;
}

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedCollection: string | null;
  relatedId: string | null;
  read: boolean;
  readAt: string | null;
  dateCreated: string | null;
}

// ─── Internal row shape ─────────────────────────────────────────────

type NotificationRow = {
  id: string;
  type: string | null;
  payload: NotificationPayload | null;
  read: boolean;
  read_at: string | null;
  date_created: string | null;
};

const NOTIFICATION_FIELDS = [
  "id",
  "type",
  "payload",
  "read",
  "read_at",
  "date_created",
] as const;

const VALID_TYPES = new Set<string>([
  "admin_approved_proposal",
  "admin_rejected_proposal",
  "admin_assigned_child",
  "admin_assigned_task",
  "admin_verified_delivery",
]);

function isNotificationType(s: string | null | undefined): s is NotificationType {
  return s !== null && s !== undefined && VALID_TYPES.has(s);
}

function rowToSummary(row: NotificationRow): NotificationSummary {
  const payload = row.payload ?? ({} as NotificationPayload);
  return {
    id: row.id,
    type: isNotificationType(row.type) ? row.type : "admin_approved_proposal",
    title: payload.title?.trim() || "Notification",
    body: payload.body?.trim() || "",
    relatedCollection: payload.relatedCollection ?? null,
    relatedId: payload.relatedId ?? null,
    read: row.read,
    readAt: row.read_at,
    dateCreated: row.date_created,
  };
}

// ─── Public API: writes (admin handler hook) ────────────────────────

export interface NotifyInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedCollection?: string;
  relatedId?: string;
}

/**
 * Insert one notification row. Best-effort: failures are logged and
 * swallowed so the parent admin action (approve, reject, etc.) never
 * breaks because the user notification couldn't be written.
 *
 * Caller order should always be:
 *   1. Do the actual mutation (approve / reject / etc.)
 *   2. await recordAuditEvent({ ... })          (Session 46)
 *   3. await notify({ ... })                    (Session 47)
 *   4. Return success to the client
 */
export async function notify(input: NotifyInput): Promise<void> {
  if (!input.recipientUserId) {
    console.warn("[di-notifications] notify called without recipient — skipping");
    return;
  }
  try {
    await directusServer().request(
      createItem("notification" as never, {
        recipient: input.recipientUserId,
        type: input.type,
        payload: {
          title: input.title,
          body: input.body,
          ...(input.relatedCollection
            ? { relatedCollection: input.relatedCollection }
            : {}),
          ...(input.relatedId ? { relatedId: input.relatedId } : {}),
        },
        read: false,
        // date_created + created_by auto-fill via Directus specials.
      } as never),
    );
  } catch (err) {
    console.error("[di-notifications] notify failed", {
      recipient: input.recipientUserId,
      type: input.type,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Public API: reads (DI consumption) ─────────────────────────────

/**
 * List notifications for the DI, newest first. Defaults to 50 — the
 * /di/notifications page shows all of these; the bell dropdown
 * slices the first 10 client-side.
 */
export async function listNotificationsForUser(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean; type?: NotificationType },
): Promise<NotificationSummary[]> {
  const filters: Record<string, unknown>[] = [
    // Defence-in-depth on top of the Directus permission rule.
    { recipient: { _eq: userId } },
  ];
  if (opts?.unreadOnly) filters.push({ read: { _eq: false } });
  if (opts?.type) filters.push({ type: { _eq: opts.type } });

  let rows: NotificationRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("notification" as never, {
        filter: { _and: filters },
        fields: [...NOTIFICATION_FIELDS],
        sort: ["-date_created"],
        limit: opts?.limit ?? 50,
      } as never),
    )) as unknown as NotificationRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-notifications] listNotificationsForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.map(rowToSummary);
}

/**
 * Count unread for the bell badge. Single id-only read so it stays
 * cheap on every page load.
 */
export async function countUnreadForUser(userId: string): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("notification" as never, {
        filter: {
          _and: [
            { recipient: { _eq: userId } },
            { read: { _eq: false } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[di-notifications] countUnreadForUser failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// ─── Public API: mark-as-read ───────────────────────────────────────

export class NotificationNotOwnedError extends Error {
  readonly code = "not_owned" as const;
  constructor() {
    super("Notification not found or not owned by this user");
    this.name = "NotificationNotOwnedError";
  }
}

/**
 * Mark one notification as read. Verifies ownership before writing.
 * Returns false if the row doesn't exist OR isn't owned by this DI
 * (collapsed for privacy — the API route returns 404 on either).
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  // Ownership check first via a scope-filtered read.
  let exists = false;
  try {
    const rows = (await directusServer().request(
      readItems("notification" as never, {
        filter: {
          _and: [
            { id: { _eq: notificationId } },
            { recipient: { _eq: userId } },
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    exists = Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn(
      "[di-notifications] markRead ownership check failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
  if (!exists) return false;

  try {
    await directusServer().request(
      updateItem("notification" as never, notificationId as never, {
        read: true,
        read_at: new Date().toISOString(),
      } as never),
    );
    return true;
  } catch (err) {
    console.warn(
      "[di-notifications] markRead update failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Mark all of this DI's unread notifications as read. Returns the
 * number of rows updated, or null on error.
 */
export async function markAllNotificationsRead(
  userId: string,
): Promise<number | null> {
  // Pull the unread ids, then fan out updates. Directus has no
  // native "update many by filter" REST endpoint — we issue N
  // updates. With << 100 unread per DI, this is acceptable; if
  // someone ever has thousands unread, switch to a Postgres-side
  // batch via a Directus flow.
  let unreadIds: string[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("notification" as never, {
        filter: {
          _and: [
            { recipient: { _eq: userId } },
            { read: { _eq: false } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    unreadIds = Array.isArray(rows) ? rows.map((r) => r.id) : [];
  } catch (err) {
    console.warn(
      "[di-notifications] markAllRead read failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (unreadIds.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const results = await Promise.allSettled(
    unreadIds.map((id) =>
      directusServer().request(
        updateItem("notification" as never, id as never, {
          read: true,
          read_at: nowIso,
        } as never),
      ),
    ),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  if (succeeded < unreadIds.length) {
    console.warn(
      `[di-notifications] markAllRead partial: ${succeeded}/${unreadIds.length} updated`,
    );
  }
  return succeeded;
}
