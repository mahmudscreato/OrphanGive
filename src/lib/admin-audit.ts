// Session 67 — Admin audit log data layer.
//
// Read-only. The audit_log collection is the single source of truth
// for every mutation worth tracing; this module shapes the rows for
// the global admin viewer at /admin/audit. Per-entity audit panels
// (admin-children's listAdminAuditEventsForChild, etc.) keep their
// own narrowed readers — this file is the unscoped, filterable,
// paginated firehose.
//
// Schema (from di-audit.ts header):
//   id            uuid PK
//   timestamp     timestamp NULLABLE  (set explicitly by recordAuditEvent)
//   actor         uuid M2O directus_users  NOT NULL
//   actor_role    string                  NOT NULL
//   action        string                  NOT NULL
//   collection    string                  NULLABLE
//   record_id     string                  NULLABLE  (string, not uuid)
//   diff          json                    NULLABLE
//   ip            string                  NULLABLE
//   user_agent    text                    NULLABLE
//   metadata      json                    NULLABLE
//
// Permissions: directusServer() uses the admin token, so the read
// is unscoped. The route handler / page gates on requireAdminUser
// before calling here — never call this from a non-admin context.

import "server-only";

import { readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  bucketForCollection,
  collectionsForBucket,
  type AuditActorRole,
  type AuditSubjectBucket,
} from "./audit-labels";

// ─── Public types ───────────────────────────────────────────────────

export interface AdminAuditRowOut {
  id: string;
  timestamp: string | null;
  actorId: string | null;
  actorName: string; // resolved from directus_users; "Unknown" fallback
  actorRole: string; // raw string from audit_log.actor_role
  action: string; // raw action string; UI formats via formatActionLabel
  collection: string | null; // raw Directus collection name
  recordId: string | null;
  metadata: Record<string, unknown> | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  // user_agent is intentionally NOT surfaced in V1 — UA strings
  // bloat the table without much investigative value. Available
  // in Directus admin directly if ops needs it. Filed for follow-up
  // if real-world use shows otherwise.
}

export interface AdminAuditPage {
  rows: AdminAuditRowOut[];
  total: number; // post-filter total; capped at MAX_TOTAL (see below)
  page: number; // 1-indexed
  pageSize: number;
  // Distinct values seen in the unfiltered population so the action
  // dropdown only shows things admin can actually find. Sorted
  // alphabetically.
  available_actions: string[];
}

export type AdminAuditSort = "timestamp_desc" | "timestamp_asc";

export interface ListAdminAuditOpts {
  page?: number;            // 1-indexed
  pageSize?: number;        // default 100, capped at 200
  actions?: string[];       // empty / undefined = no filter
  role?: AuditActorRole | "all";
  subjectBucket?: AuditSubjectBucket;
  subjectId?: string;       // exact-match on record_id (trimmed)
  // Inclusive ISO date strings (YYYY-MM-DD). The reader turns them
  // into _between filter clauses on `timestamp`. Single-side bounds
  // are supported (e.g., only from, or only to).
  from?: string;
  to?: string;
  sort?: AdminAuditSort;
}

// Hard ceiling on rows we'll consider per query. Audit log grows
// indefinitely; without a ceiling the page would slow down linearly
// with history size. The viewer surfaces this as "showing X of
// up to MAX_TOTAL — narrow filters to find older entries". Bumpable
// when we add server-side indexed pagination via a count query.
const MAX_TOTAL = 5000;

// ─── Internal row shape ─────────────────────────────────────────────

type AuditRowRaw = {
  id: string;
  timestamp: string | null;
  actor: string | null;
  actor_role: string | null;
  action: string | null;
  collection: string | null;
  record_id: string | null;
  diff: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
};

const AUDIT_FIELDS = [
  "id",
  "timestamp",
  "actor",
  "actor_role",
  "action",
  "collection",
  "record_id",
  "diff",
  "metadata",
  "ip",
] as const;

// ─── Public reader ─────────────────────────────────────────────────

/**
 * Filterable, paginated audit log read for the admin viewer.
 *
 * Filter strategy:
 *   - Server-side via Directus filter: action[], actor_role, collection
 *     (bucket → _in array), record_id (_eq), timestamp range.
 *   - The "other" subject bucket and pagination are post-applied in
 *     memory because Directus REST can't express "NOT IN [known
 *     collections]" cleanly + count + paginate in a single round-trip.
 *   - Maximum window: MAX_TOTAL rows. Past that, admin needs tighter
 *     filters (the viewer renders a "showing X of up to MAX_TOTAL"
 *     hint).
 */
export async function listAdminAuditPage(
  opts: ListAdminAuditOpts = {},
): Promise<AdminAuditPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 100));
  const role = opts.role ?? "all";
  const subjectBucket = opts.subjectBucket ?? "all";
  const subjectId = (opts.subjectId ?? "").trim();
  const sort = opts.sort ?? "timestamp_desc";
  const actions = (opts.actions ?? []).filter((s) => s.length > 0);

  // ── Build Directus filter ──
  const filters: Record<string, unknown>[] = [];
  if (actions.length > 0) filters.push({ action: { _in: actions } });
  if (role !== "all") filters.push({ actor_role: { _eq: role } });
  if (subjectId.length > 0) filters.push({ record_id: { _eq: subjectId } });

  // Subject bucket → collection clause. 'all' and 'other' both omit
  // the clause and post-filter (other) after.
  const collectionFilter =
    subjectBucket === "all" || subjectBucket === "other"
      ? null
      : collectionsForBucket(subjectBucket);
  if (collectionFilter && collectionFilter.length > 0) {
    filters.push({ collection: { _in: collectionFilter } });
  }

  // Date range. Inclusive on both sides; timestamps are ISO strings
  // so we compose them by appending T00:00:00Z (from) and
  // T23:59:59.999Z (to). Single-side bounds drop the unused half.
  if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) {
    filters.push({ timestamp: { _gte: `${opts.from}T00:00:00.000Z` } });
  }
  if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    filters.push({ timestamp: { _lte: `${opts.to}T23:59:59.999Z` } });
  }

  const sortClause = sort === "timestamp_asc" ? ["timestamp"] : ["-timestamp"];

  // ── Fetch window ──
  let rows: AuditRowRaw[] = [];
  try {
    const result = (await directusServer().request(
      readItems("audit_log" as never, {
        filter: filters.length > 0 ? { _and: filters } : undefined,
        fields: [...AUDIT_FIELDS],
        sort: sortClause,
        limit: MAX_TOTAL,
      } as never),
    )) as unknown as AuditRowRaw[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-audit] listAdminAuditPage fetch failed",
      err instanceof Error ? err.message : err,
    );
    rows = [];
  }

  // 'other' bucket post-filter: rows whose collection doesn't map to
  // any of the known buckets. Cheap — string compare per row.
  if (subjectBucket === "other") {
    rows = rows.filter((r) => bucketForCollection(r.collection) === "other");
  }

  // ── Distinct-action list for the filter dropdown ──
  // Cheap independent fetch over `action` only — separated so the
  // dropdown doesn't shrink as admin narrows the main filter. Soft-
  // fails to an empty list (dropdown still renders with just the
  // currently-selected values).
  const availableActions = await fetchAvailableActions();

  // ── Actor-name resolution in one batch ──
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor).filter((x): x is string => !!x)),
  );
  const nameById = await resolveUserNames(actorIds);

  // ── Paginate ──
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);

  const out: AdminAuditRowOut[] = slice.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    actorId: r.actor,
    actorName: r.actor ? nameById.get(r.actor) ?? "Unknown" : "System",
    actorRole: r.actor_role ?? "unknown",
    action: r.action ?? "unknown",
    collection: r.collection,
    recordId: r.record_id,
    metadata: r.metadata,
    diff: r.diff,
    ip: r.ip,
  }));

  return {
    rows: out,
    total,
    page,
    pageSize,
    available_actions: availableActions,
  };
}

// ─── Filter-dropdown options ────────────────────────────────────────

async function fetchAvailableActions(): Promise<string[]> {
  try {
    const rows = (await directusServer().request(
      readItems("audit_log" as never, {
        fields: ["action"],
        // Scan a wider window than the page itself reads so brand-new
        // action names don't disappear from the dropdown after the
        // first 5000 rows. Aggregating with DISTINCT over the audit
        // log via Directus REST has known caveats per Session 47
        // discovery (aggregate() filter behaviour), so we pull a
        // working slice and dedupe in memory.
        limit: 5000,
        sort: ["-timestamp"],
      } as never),
    )) as unknown as Array<{ action: string | null }> | undefined;
    if (!Array.isArray(rows)) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const a = r.action?.trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort();
  } catch (err) {
    console.warn(
      "[admin-audit] fetchAvailableActions failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
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
      "[admin-audit] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}
