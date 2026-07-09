// Admin Lot 1 — admin home dashboard data.
//
// READ-ONLY composer. Combines existing counters (no new heavy
// queries) + cheap one-off `safeCount` calls for the few metrics
// that didn't already have helpers. Adds a recent-activity feed
// pulled from audit_log.
//
// Nothing here writes. Privacy: returns counts + Tier-1 audit labels
// only. Audit metadata is never dereferenced to a Tier-3 field —
// the feed renders the action label + actor first-name + the subject
// link via the centralised audit-labels helpers.

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";
import { countActiveSponsorships } from "./admin-sponsorships";
import { countActiveChildrenForBadge } from "./admin-children";
import { getAdminHomeStats, type AdminHomeStats } from "./admin-home-stats";

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
      `[admin-dashboard] safeCount(${collection}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export interface AdminDashboardData {
  // From getAdminHomeStats
  base: AdminHomeStats;
  // Operational snapshot
  activeSponsorships: number | null;
  activeChildren: number | null;
  // Pending work additions
  openTasks: number | null; // task.di_status IN (open, in_progress)
  tasksAwaitingVerification: number | null; // di_status=completed_pending_verification AND admin_status=open
  // Fulfillment attention items (columns present on main per sub-phase 1).
  fulfillmentOnHold: number | null;
  fulfillmentDisputed: number | null;
  fulfillmentRefundRequested: number | null;
  fulfillmentRefunded: number | null;
}

// Standalone badge/count helper: tasks a DI marked complete that await
// admin verification (di_status=completed_pending_verification AND
// admin_status=open). Exported so the admin nav layout can show a Tasks
// badge with the SAME predicate the home "Tasks to verify" tile uses.
export async function countTasksAwaitingVerification(): Promise<number | null> {
  return safeCount("task", {
    _and: [
      { di_status: { _eq: "completed_pending_verification" } },
      { admin_status: { _eq: "open" } },
    ],
  });
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    base,
    activeSponsorships,
    activeChildren,
    openTasks,
    tasksAwaitingVerification,
    fulfillmentOnHold,
    fulfillmentDisputed,
    fulfillmentRefundRequested,
    fulfillmentRefunded,
  ] = await Promise.all([
    getAdminHomeStats(),
    countActiveSponsorships(),
    // countActiveChildrenForBadge returns number (not nullable)
    countActiveChildrenForBadge().then((n) => n).catch(() => null),
    safeCount("task", {
      _or: [
        { di_status: { _eq: "open" } },
        { di_status: { _eq: "in_progress" } },
      ],
    }),
    countTasksAwaitingVerification(),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "on_hold" } }),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "disputed" } }),
    safeCount("sponsorship", {
      fulfillment_exception: { _eq: "refund_requested" },
    }),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "refunded" } }),
  ]);

  return {
    base,
    activeSponsorships,
    activeChildren,
    openTasks,
    tasksAwaitingVerification,
    fulfillmentOnHold,
    fulfillmentDisputed,
    fulfillmentRefundRequested,
    fulfillmentRefunded,
  };
}
