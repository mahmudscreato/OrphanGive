// Daily cron — OTP request cleanup (Session 15b1).
//
// Triggered by the Hostinger VPS crontab at 02:30 UTC. Deletes
// og_otp_request rows older than 24 hours. OTPs are short-lived
// auth artifacts (signin / verify codes); after use OR after the
// short expiry window they're useless and just bloat the table.
//
// Auth: Bearer token must equal process.env.CRON_SECRET. Mirrors
// the auth pattern from /api/cron/promote-queue.
//
// Idempotent: a second run finds zero stale rows and reports 0.

import { NextResponse, type NextRequest } from "next/server";
import { deleteItems, readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const runtime = "nodejs";

// One-day grace window. Most OTP codes expire in 5-15 minutes; we
// retain a day of trail for forensics (e.g. brute-force detection)
// then purge.
const RETAIN_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      "[cron/cleanup-otp] CRON_SECRET not configured — refusing to run",
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
  const cutoffIso = new Date(Date.now() - RETAIN_MS).toISOString();
  let deleted = 0;
  let errors = 0;

  try {
    // Directus's deleteItems requires a list of ids. Read first,
    // then bulk-delete. Cap per-run at 5000 to avoid pathological
    // runtime; the next cron tick mops up any remainder.
    const stale = (await ds.request(
      readItems("og_otp_request" as never, {
        filter: { requested_at: { _lt: cutoffIso } },
        fields: ["id"],
        limit: 5000,
      } as never),
    )) as unknown as Array<{ id: string }>;
    const ids = (stale ?? []).map((r) => r.id).filter(Boolean);
    if (ids.length > 0) {
      try {
        await ds.request(deleteItems("og_otp_request" as never, ids as never));
        deleted = ids.length;
      } catch (err) {
        errors++;
        console.warn(
          "[cron/cleanup-otp] bulk delete failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    errors++;
    console.warn(
      "[cron/cleanup-otp] read failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    "[cron/cleanup-otp] done",
    JSON.stringify({ deleted, errors, duration_ms }),
  );
  return NextResponse.json({ deleted, errors, duration_ms });
}
