// Session 68 — DI dashboard stat-tile data layer.
//
// Distinct from di-home-stats.ts: that module ships the Session 47
// tiles (Children / Open tasks / Pending submissions roll-up /
// Awaiting sponsor). This module ships the Session 68 tile set the
// brief asks for, anchored on the DI's proposal lifecycle:
//
//   1. Drafts in progress
//   2. Awaiting admin review        (status='pending')
//   3. Approved this month          (status='approved' AND
//                                    published_at in current calendar
//                                    month, the DI's local timezone)
//   4. Changes requested            (Session 60 admin "request
//                                    changes" flow sets status='draft'
//                                    AND populates rejection_reason —
//                                    those are the rows that need DI
//                                    attention vs. fresh drafts)
//
// Implementation notes:
//   - safeCount mirrors di-home-stats's pattern (readItems + length,
//     not the SDK aggregate() which silently strips filters per
//     Session 47 discovery)
//   - "Approved this month" anchors on the SERVER's UTC clock — the
//     DI's local timezone could shift the cutover but we don't track
//     timezone per user. Documented in the ship report.
//   - "Changes requested" is the post-Session-60 admin shape; on a
//     deployment that pre-dates Session 60 the count returns 0
//     (rejection_reason is always null on plain drafts).

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export interface DiDashboardStats {
  draftCount: number | null;
  pendingCount: number | null;
  approvedThisMonthCount: number | null;
  changesRequestedCount: number | null;
}

async function safeCount(
  collection: string,
  filter: Record<string, unknown>,
): Promise<number | null> {
  try {
    const rows = (await directusServer().request(
      readItems(collection as never, {
        filter,
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      `[di-dashboard-stats] count failed for ${collection}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * First-of-current-month and first-of-next-month ISO strings, in
 * UTC. Used to bound the "Approved this month" count on
 * published_at. We anchor on UTC because that's what Directus
 * stores and the DI's session has no timezone field; close-of-month
 * cutovers may differ by ≤ ~14 hours from local Bangladesh time
 * (UTC+6) for a few rows. Acceptable for a "this month" stat.
 */
function currentMonthBoundsUtc(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getDiDashboardStats(
  userId: string,
): Promise<DiDashboardStats> {
  const { start, end } = currentMonthBoundsUtc();

  const [
    draftCount,
    pendingCount,
    approvedThisMonthCount,
    changesRequestedCount,
  ] = await Promise.all([
    // 1. Drafts in progress — same shape getDraftCountForUser uses
    //    in di-proposals.ts; inlined here so we can issue all four
    //    counts in parallel rather than via four separate helpers.
    safeCount("child_proposal", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "draft" } },
        // Defence-in-depth: a "changes requested" row is technically
        // status='draft' with a rejection_reason — exclude those
        // from the headline draft count so they don't double-count
        // against tile #4.
        {
          _or: [
            { rejection_reason: { _null: true } },
            { rejection_reason: { _eq: "" } },
          ],
        },
      ],
    }),

    // 2. Awaiting admin review — proposals the DI submitted that
    //    haven't been touched yet.
    safeCount("child_proposal", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "pending" } },
      ],
    }),

    // 3. Approved this month. published_at is set by the approve
    //    handler (admin-proposals.ts) on the same write that flips
    //    status='approved', so it's a reliable timestamp anchor.
    safeCount("child_proposal", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "approved" } },
        { published_at: { _gte: start } },
        { published_at: { _lt: end } },
      ],
    }),

    // 4. Changes requested — Session 60 admin "request changes"
    //    sends the row back to status='draft' with rejection_reason
    //    populated as the admin's comments. A plain draft has
    //    rejection_reason=null; we only count the ones with the
    //    admin note (the DI has something to read + act on).
    safeCount("child_proposal", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "draft" } },
        { rejection_reason: { _nnull: true } },
        { rejection_reason: { _neq: "" } },
      ],
    }),
  ]);

  return {
    draftCount,
    pendingCount,
    approvedThisMonthCount,
    changesRequestedCount,
  };
}
