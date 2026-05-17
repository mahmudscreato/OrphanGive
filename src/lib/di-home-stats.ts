// Session 47 — DI home page stat-tile data layer.
//
// Why this file exists: Sessions 42-46 used the SDK's `aggregate()`
// helper for the four home-page tiles, which silently ignored every
// `filter` we passed (verified during Session 47 discovery — the
// REST endpoint with the same filter shape returns 1, the SDK call
// returns the unfiltered total of 10). Result: every tile was
// showing global counts since Session 42.
//
// Fix: replace `aggregate()` with `readItems({ fields: ['id'],
// limit: -1 })` and count `array.length`. Same pattern Session 44's
// `getPendingProposalCountForUser` already used correctly.
//
// All exports are server-only and admin-token-scoped; the tiles
// themselves render in the (authed) layout's server component.

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Generic count helper ────────────────────────────────────────────

/**
 * Returns the count of rows matching `filter`, or null on error.
 * The home page renders `—` for null.
 */
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
      `[di-home-stats] count failed for ${collection}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface HomeStats {
  // 1. Children scoped to this DI (uploaded_by_di OR assigned_di),
  //    excluding withdrawn.
  childCount: number | null;
  // 2. Tasks the DI still has work on.
  openTaskCount: number | null;
  // 3. Aggregate of pending submissions across 4 mutation surfaces.
  pendingProposalCount: number | null;
  pendingMomentCount: number | null;
  pendingReportCount: number | null;
  pendingDeliveryCount: number | null;
  // 4. Children assigned to this DI with a support_type set but no
  //    active monthly sponsorship — the "ready to be sponsored" pool.
  awaitingSponsorCount: number | null;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Loads all four tile counts for the DI home page in parallel.
 * Returns nulls for any individual count that errors so partial
 * failures degrade gracefully (one broken tile renders "—" while the
 * rest show real numbers).
 */
export async function getDiHomeStats(userId: string): Promise<HomeStats> {
  const [
    childCount,
    openTaskCount,
    pendingProposalCount,
    pendingMomentCount,
    pendingReportCount,
    pendingDeliveryCount,
    awaitingSponsorCount,
  ] = await Promise.all([
    // 1. Children I manage — (uploaded_by OR assigned) AND status
    //    not withdrawn / awaiting_intake. Session 52a — stubs
    //    excluded so the headline count matches the children list.
    safeCount("child", {
      _and: [
        {
          _or: [
            { uploaded_by_di: { _eq: userId } },
            { assigned_di: { _eq: userId } },
          ],
        },
        { status: { _nin: ["withdrawn", "awaiting_intake"] } },
      ],
    }),

    // 2. Open Tasks — Session 47 spec is explicit: di_status IN
    //    (open, in_progress) AND admin_status != verified_complete.
    //    The admin_status guard handles the (uncommon) case where a
    //    task is verified by admin without DI marking it complete
    //    first. The di_status filter alone would also work but the
    //    explicit shape closes the loop tightly.
    safeCount("task", {
      _and: [
        { assignee: { _eq: userId } },
        { di_status: { _in: ["open", "in_progress"] } },
        { admin_status: { _neq: "verified_complete" } },
      ],
    }),

    // 3a-d. Pending submissions across 4 collections. Each query is
    //    independent so partial failures don't cascade.
    safeCount("child_proposal", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "pending" } },
      ],
    }),
    safeCount("child_moment", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "pending" } },
      ],
    }),
    safeCount("child_update", {
      _and: [
        { created_by: { _eq: userId } },
        { status: { _eq: "pending" } },
      ],
    }),
    safeCount("aid_delivery", {
      _and: [
        { delivered_by: { _eq: userId } },
        { status: { _eq: "pending" } },
      ],
    }),

    // 4. Awaiting Sponsor — children in DI's scope with support_type
    //    set, that DON'T have an active monthly sponsorship.
    //    Computed below via a 2-step query (Directus filter syntax
    //    can't express "no related row exists" cleanly).
    countAwaitingSponsor(userId),
  ]);

  return {
    childCount,
    openTaskCount,
    pendingProposalCount,
    pendingMomentCount,
    pendingReportCount,
    pendingDeliveryCount,
    awaitingSponsorCount,
  };
}

/**
 * Two-step count: (a) DI's scoped children with support_type set,
 * (b) which of those have NO active monthly/monthly_prepaid
 * sponsorship row. Returns null on any read error.
 *
 * Implemented in JS because Directus's REST API can't express
 * "EXISTS / NOT EXISTS" subqueries in a filter. At the dev DB scale
 * (10 children) the round-trip is trivial; if this ever hits
 * thousands of children, push the predicate into a Directus flow or
 * a Postgres view.
 */
async function countAwaitingSponsor(userId: string): Promise<number | null> {
  let scopedChildren: Array<{ id: string }>;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [
            {
              _or: [
                { uploaded_by_di: { _eq: userId } },
                { assigned_di: { _eq: userId } },
              ],
            },
            // Session 52a — exclude stub children from the
            // awaiting-sponsor pool (they have no real profile yet).
            { status: { _nin: ["withdrawn", "awaiting_intake"] } },
            { support_type: { _nnull: true } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    scopedChildren = Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[di-home-stats] awaitingSponsor child read failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (scopedChildren.length === 0) return 0;

  const childIds = scopedChildren.map((c) => c.id);
  let activeSponsoredChildIds = new Set<string>();
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _in: childIds } },
            { status: { _eq: "active" } },
            // Both monthly_prepaid and monthly count as "active
            // monthly sponsorship" for this tile — both represent an
            // ongoing donor commitment to this child. (Brief said
            // "schedule = monthly" but reality has both shapes.)
            { payment_schedule: { _in: ["monthly", "monthly_prepaid"] } },
          ],
        },
        fields: ["child"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ child: string }> | undefined;
    if (Array.isArray(rows)) {
      activeSponsoredChildIds = new Set(rows.map((r) => r.child));
    }
  } catch (err) {
    console.warn(
      "[di-home-stats] awaitingSponsor sponsorship read failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return childIds.filter((id) => !activeSponsoredChildIds.has(id)).length;
}
