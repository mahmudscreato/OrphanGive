// Daily cron — DI Dashboard pending_changes 30-day expiration (Session 41).
//
// Triggered by the Hostinger VPS crontab once per day (Mahmud sets the
// exact slot post-deploy; see migrations/session-41/APPLY.md step 8).
// Flips `pending_changes` rows from status='pending' to status='expired'
// once their `expires_at` timestamp has passed.
//
// Per spec section 2.13: a DI proposal that sits unreviewed for 30
// days is auto-expired. The DI sees it disappear from their queue;
// admin sees the audit_log trail. No notification is sent THIS
// session (Session 46 wires the notification side).
//
// Auth: Bearer token must equal process.env.CRON_SECRET. Same secret
// as the existing crons (expire-reveals, decrement-prepaid, etc.).
//
// Idempotent: rows already at status='expired' or any non-'pending'
// status are excluded by the read filter. Safe to re-run hourly.
//
// Audit: each expiry inserts an audit_log row attributed to the
// `system` Directus user (process.env.SYSTEM_USER_ID — see
// migrations/session-41/003-system-user-note.md). If SYSTEM_USER_ID
// is unconfigured, the route refuses to run rather than silently
// dropping the audit trail.

import { NextResponse, type NextRequest } from "next/server";
import { createItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const runtime = "nodejs";

type PendingChangeRow = {
  id: string;
  collection_name: string;
  created_by: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // ─── Env preconditions ──────────────────────────────────────────
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error(
      "[cron/expire-pending-changes] CRON_SECRET not configured — refusing to run",
    );
    return NextResponse.json(
      { error: "cron secret not configured" },
      { status: 500 },
    );
  }

  const systemUserId = process.env.SYSTEM_USER_ID;
  if (!systemUserId) {
    console.error(
      "[cron/expire-pending-changes] SYSTEM_USER_ID not configured — refusing to run (audit_log writes need an actor)",
    );
    return NextResponse.json(
      { error: "SYSTEM_USER_ID not configured" },
      { status: 500 },
    );
  }

  // ─── Auth ───────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "");
  if (presented !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ds = directusServer();
  const nowIso = new Date().toISOString();
  const expired_ids: string[] = [];
  let errors = 0;

  // ─── Find expired-but-still-pending rows ────────────────────────
  // Read filter mirrors the partial index on pending_changes:
  // `WHERE status = 'pending' AND expires_at < now()`.
  // Limit 5000 keeps a single run bounded; if there's ever a backlog
  // larger than that, the next day's run picks up the rest. Daily
  // cadence × 5000-row limit = ~150k rows/month, well above any
  // realistic DI volume.
  let stale: PendingChangeRow[] = [];
  try {
    stale = (await ds.request(
      readItems("pending_changes" as never, {
        filter: {
          _and: [
            { status: { _eq: "pending" } },
            { expires_at: { _lt: nowIso } },
          ],
        },
        fields: ["id", "collection_name", "created_by"],
        limit: 5000,
      } as never),
    )) as unknown as PendingChangeRow[];
  } catch (err) {
    console.warn(
      "[cron/expire-pending-changes] read failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        expired_count: 0,
        expired_ids: [],
        errors: 1,
        duration_ms: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }

  if (stale.length === 0) {
    const duration_ms = Date.now() - startedAt;
    console.log(
      "[cron/expire-pending-changes] done",
      JSON.stringify({ expired_count: 0, errors: 0, duration_ms }),
    );
    return NextResponse.json({
      expired_count: 0,
      expired_ids: [],
      duration_ms,
    });
  }

  // ─── Per-row update + audit ─────────────────────────────────────
  // Two writes per row: update status, then insert audit_log entry.
  // If the audit insert fails after the status update succeeded, we
  // still count the expiry (the user-facing state is correct) but
  // log + bump the error counter. The audit gap is recoverable from
  // the row history if needed.
  for (const row of stale) {
    try {
      await ds.request(
        updateItem("pending_changes" as never, row.id as never, {
          status: "expired",
        } as never),
      );
      expired_ids.push(row.id);
    } catch (err) {
      errors++;
      console.warn(
        `[cron/expire-pending-changes] update ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      continue; // skip audit write if status update failed
    }

    try {
      await ds.request(
        createItem("audit_log" as never, {
          actor_id: systemUserId,
          actor_role: "system",
          action: "pending_expired",
          collection: row.collection_name,
          record_id: row.id,
          metadata: {
            reason: "30_day_expiry",
            original_created_by: row.created_by,
          },
        } as never),
      );
    } catch (err) {
      errors++;
      console.warn(
        `[cron/expire-pending-changes] audit insert for ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    "[cron/expire-pending-changes] done",
    JSON.stringify({
      expired_count: expired_ids.length,
      errors,
      duration_ms,
    }),
  );
  return NextResponse.json({
    expired_count: expired_ids.length,
    expired_ids,
    errors,
    duration_ms,
  });
}
