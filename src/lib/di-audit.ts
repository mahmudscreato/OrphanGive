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
  | "di_submitted_proposal"
  | "di_withdrew_proposal"
  | "di_uploaded_moment"
  | "di_submitted_report"
  | "di_marked_delivery"
  | "di_started_task"
  | "di_completed_task"
  | "di_uploaded_photo"
  | "di_uploaded_video";

export type ActorRole = "data_inputter" | "admin" | "system";

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
      diff: input.diff ?? null,
      ip,
      user_agent: ua,
      metadata: input.metadata ?? null,
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
  di_marked_delivery: (a) => `${a} marked an aid delivery`,
  di_started_task: (a) => `${a} started a task`,
  di_completed_task: (a) => `${a} marked a task complete`,
  di_uploaded_photo: (a) => `${a} uploaded a photo`,
  di_uploaded_video: (a) => `${a} uploaded a video`,
};

function isAuditAction(s: string | null | undefined): s is AuditAction {
  return (
    s === "di_submitted_proposal" ||
    s === "di_withdrew_proposal" ||
    s === "di_uploaded_moment" ||
    s === "di_submitted_report" ||
    s === "di_marked_delivery" ||
    s === "di_started_task" ||
    s === "di_completed_task" ||
    s === "di_uploaded_photo" ||
    s === "di_uploaded_video"
  );
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
