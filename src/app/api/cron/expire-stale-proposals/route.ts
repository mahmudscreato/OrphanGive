// Daily cron — DI Dashboard child_proposal stale auto-rejection (Session 41-v3).
//
// Triggered by the Hostinger VPS crontab once per day. Flips
// `child_proposal` rows from status='pending' to status='rejected' when
// they have not been reviewed within 30 days of date_created. Sets a
// canonical rejection_reason so admin UI can distinguish auto-rejects
// from manual ones.
//
// Per spec v3: a proposal that sits unreviewed for 30 days is
// auto-rejected. The DI sees the rejection on their dashboard; admin
// sees the audit trail. No notification this session — Session 46
// wires the notification side.
//
// Auth: Bearer token must equal process.env.CRON_SECRET (same secret
// used by the existing crons — expire-reveals, decrement-prepaid, etc.).
//
// Audit: each auto-reject inserts an audit_log row attributed to the
// `system` Directus user (process.env.SYSTEM_USER_ID). If the env
// var is unset, the route refuses to run rather than silently dropping
// the audit trail.
//
// Idempotent: rows already at status='rejected' (or any non-'pending'
// status) are excluded by the read filter. Safe to re-run hourly.

import { NextResponse, type NextRequest } from "next/server";
import { createItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const runtime = "nodejs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REJECTION_REASON =
  "Auto-rejected: not reviewed within 30 days";

type ProposalRow = {
  id: string;
  created_by: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // ─── Env preconditions ──────────────────────────────────────────
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error(
      "[cron/expire-stale-proposals] CRON_SECRET not configured — refusing to run",
    );
    return NextResponse.json(
      { error: "cron secret not configured" },
      { status: 500 },
    );
  }

  const systemUserId = process.env.SYSTEM_USER_ID;
  if (!systemUserId) {
    console.error(
      "[cron/expire-stale-proposals] SYSTEM_USER_ID not configured — refusing to run (audit_log writes need an actor)",
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
  const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const expired_ids: string[] = [];
  let errors = 0;

  // ─── Find pending rows past their 30-day window ─────────────────
  // Limit 5000 keeps a single run bounded; daily cadence × 5000 row
  // ceiling = ~150k rows/month, well above realistic DI throughput.
  let stale: ProposalRow[] = [];
  try {
    stale = (await ds.request(
      readItems("child_proposal" as never, {
        filter: {
          _and: [
            { status: { _eq: "pending" } },
            { date_created: { _lt: cutoffIso } },
          ],
        },
        fields: ["id", "created_by"],
        limit: 5000,
      } as never),
    )) as unknown as ProposalRow[];
  } catch (err) {
    console.warn(
      "[cron/expire-stale-proposals] read failed:",
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
      "[cron/expire-stale-proposals] done",
      JSON.stringify({ expired_count: 0, errors: 0, duration_ms }),
    );
    return NextResponse.json({
      expired_count: 0,
      expired_ids: [],
      duration_ms,
    });
  }

  // ─── Per-row update + audit ─────────────────────────────────────
  // Two writes per row: update status + rejection_reason, then insert
  // audit_log entry. If the audit insert fails after the status
  // update succeeded, we still count the rejection (user-facing state
  // is correct) but log + bump the error counter.
  for (const row of stale) {
    try {
      await ds.request(
        updateItem("child_proposal" as never, row.id as never, {
          status: "rejected",
          rejection_reason: REJECTION_REASON,
        } as never),
      );
      expired_ids.push(row.id);
    } catch (err) {
      errors++;
      console.warn(
        `[cron/expire-stale-proposals] update ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      continue; // skip audit write if status update failed
    }

    try {
      await ds.request(
        createItem("audit_log" as never, {
          actor: systemUserId,
          actor_role: "system",
          action: "system_expired_proposal",
          collection: "child_proposal",
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
        `[cron/expire-stale-proposals] audit insert for ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // No notification logic — deferred to Session 46.

  const duration_ms = Date.now() - startedAt;
  console.log(
    "[cron/expire-stale-proposals] done",
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
