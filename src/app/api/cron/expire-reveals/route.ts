// Daily cron — reveal request expiration (Session 15b1).
//
// Triggered by the Hostinger VPS crontab at 03:00 UTC. Flips
// reveal_request rows from status='approved' to status='expired'
// when their decided_at is older than 90 days. Approved reveals
// give donors temporary access to a child's locked details (name,
// guardian contact, etc.); the 90-day window is a privacy boundary —
// access expires automatically and the donor can re-request if they
// still need it.
//
// Auth: Bearer token must equal process.env.CRON_SECRET.
//
// Idempotent: rows already at status='expired' aren't touched.

import { NextResponse, type NextRequest } from "next/server";
import { readItems, updateItem } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
// P2 — audit each cron-driven expiry. system actor, IDs only;
// never the decrypted Tier-3 value (only field_name, which is the
// public allowlist column name).
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      "[cron/expire-reveals] CRON_SECRET not configured — refusing to run",
    );
    return NextResponse.json(
      { error: "cron secret not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "");
  if (presented !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ds = directusServer();
  const cutoffIso = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
  let expired = 0;
  let errors = 0;

  try {
    const stale = (await ds.request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { status: { _eq: "approved" } },
            { decided_at: { _lt: cutoffIso } },
          ],
        },
        // P2 — pull donor / child / field_name so the audit row can
        // carry IDs without a second lookup. All three are public
        // allowlist values; never the decrypted Tier-3 column value.
        fields: ["id", "donor", "child", "field_name"],
        limit: 5000,
      } as never),
    )) as unknown as Array<{
      id: string;
      donor: string | null;
      child: string | null;
      field_name: string | null;
    }>;

    const nowIso = new Date().toISOString();
    for (const row of stale ?? []) {
      try {
        await ds.request(
          updateItem("reveal_request" as never, row.id as never, {
            status: "expired",
            expired_at: nowIso,
          } as never),
        );
        expired++;
        console.log(
          `[cron/expire-reveals] expired reveal_request=${row.id}`,
        );
        // P2 — audit each expiry. system actor. Best-effort; a
        // single audit failure shouldn't break the loop.
        if (row.donor) {
          try {
            await recordAuditEvent({
              actorUserId: row.donor,
              actorRole: "system",
              action: "system_expired_reveal",
              collection: "reveal_request",
              recordId: row.id,
              metadata: {
                donor: row.donor,
                childId: row.child,
                field_name: row.field_name,
                reason: "ninety_day_window",
              },
            });
          } catch (auditErr) {
            console.warn(
              `[cron/expire-reveals] audit for ${row.id} failed (non-fatal):`,
              auditErr instanceof Error ? auditErr.message : auditErr,
            );
          }
        }
      } catch (err) {
        errors++;
        console.warn(
          `[cron/expire-reveals] update ${row.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    errors++;
    console.warn(
      "[cron/expire-reveals] read failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    "[cron/expire-reveals] done",
    JSON.stringify({ expired, errors, duration_ms }),
  );
  return NextResponse.json({ expired, errors, duration_ms });
}
