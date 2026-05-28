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

import { readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { countActiveSponsorships } from "./admin-sponsorships";
import { countActiveChildrenForBadge } from "./admin-children";
import { countPendingDonorApprovals } from "./admin-donors";
import { getAdminHomeStats, type AdminHomeStats } from "./admin-home-stats";
import {
  bucketForCollection,
  formatActionLabel,
  normaliseActorRole,
  resolveAuditSubjectLink,
  type AuditActorRole,
  type AuditSubjectLink,
} from "./audit-labels";

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
  pendingDonorApprovals: number | null;
  // Pending work additions
  openTasks: number | null; // task.di_status IN (open, in_progress)
  tasksAwaitingVerification: number | null; // di_status=completed_pending_verification AND admin_status=open
  // Fulfillment attention items (columns present on main per sub-phase 1).
  fulfillmentOnHold: number | null;
  fulfillmentDisputed: number | null;
  fulfillmentRefundRequested: number | null;
  fulfillmentRefunded: number | null;
  // Recent activity feed
  recentActivity: RecentActivityEvent[];
}

export interface RecentActivityEvent {
  id: string;
  timestamp: string | null;
  actorLabel: string;
  actorRole: AuditActorRole;
  action: string;
  actionLabel: string; // human-readable
  subject: AuditSubjectLink | null;
  subjectBucket: ReturnType<typeof bucketForCollection>;
}

async function fetchRecentActivity(limit = 8): Promise<RecentActivityEvent[]> {
  // Pull a small window of the most recent audit events. We deliberately
  // limit to "action-y" rows (skip read-only `_viewed_*` and webhook noise
  // for the home feed); a small set of explicitly interesting actions
  // surfaces here. Future polish: a settings-driven filter.
  const INCLUDE_ACTIONS = [
    "admin_approved_proposal",
    "admin_rejected_proposal",
    "admin_approved_document",
    "admin_rejected_document",
    "admin_approved_intake_photo",
    "admin_rejected_intake_photo",
    "admin_approved_moment",
    "admin_rejected_moment",
    "admin_approved_report",
    "admin_requested_report_correction",
    "admin_cancelled_sponsorship",
    "admin_paused_sponsorship",
    "admin_refunded_sponsorship_charge",
    "admin_approved_donor",
    "admin_rejected_donor",
    "admin_suspended_donor",
    "di_submitted_proposal",
    "di_submitted_report",
    "di_resubmitted_report",
    "di_uploaded_document",
    "di_uploaded_moment",
  ];
  let rows: Array<{
    id: string;
    timestamp: string | null;
    actor: string | null;
    actor_role: string | null;
    action: string | null;
    collection: string | null;
    record_id: string | null;
    metadata: Record<string, unknown> | null;
  }> = [];
  try {
    const raw = (await directusServer().request(
      readItems("audit_log" as never, {
        filter: { action: { _in: INCLUDE_ACTIONS } },
        fields: [
          "id",
          "timestamp",
          "actor",
          "actor_role",
          "action",
          "collection",
          "record_id",
          "metadata",
        ],
        sort: ["-timestamp"],
        limit,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(raw)) rows = raw;
  } catch (err) {
    console.warn(
      "[admin-dashboard] recent activity read failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (rows.length === 0) return [];

  // Resolve actor first names in one batch.
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
      )) as unknown as
        | Array<{ id: string; first_name: string | null }>
        | undefined;
      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.first_name?.trim()) nameById.set(u.id, u.first_name.trim());
        }
      }
    } catch {
      // best effort
    }
  }

  return rows.map((r) => {
    const role = normaliseActorRole(r.actor_role);
    const actorLabel =
      r.actor && nameById.get(r.actor)
        ? nameById.get(r.actor)!
        : role === "admin"
          ? "Admin"
          : role === "data_inputter"
            ? "DI"
            : role === "system"
              ? "System"
              : role === "donor"
                ? "Donor"
                : "Unknown";
    return {
      id: r.id,
      timestamp: r.timestamp,
      actorLabel,
      actorRole: role,
      action: r.action ?? "",
      actionLabel: formatActionLabel(r.action),
      subject: resolveAuditSubjectLink(r.collection, r.record_id, r.metadata),
      subjectBucket: bucketForCollection(r.collection),
    };
  });
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    base,
    activeSponsorships,
    activeChildren,
    pendingDonorApprovals,
    openTasks,
    tasksAwaitingVerification,
    fulfillmentOnHold,
    fulfillmentDisputed,
    fulfillmentRefundRequested,
    fulfillmentRefunded,
    recentActivity,
  ] = await Promise.all([
    getAdminHomeStats(),
    countActiveSponsorships(),
    // countActiveChildrenForBadge returns number (not nullable)
    countActiveChildrenForBadge().then((n) => n).catch(() => null),
    countPendingDonorApprovals().then((n) => n).catch(() => null),
    safeCount("task", {
      _or: [
        { di_status: { _eq: "open" } },
        { di_status: { _eq: "in_progress" } },
      ],
    }),
    safeCount("task", {
      _and: [
        { di_status: { _eq: "completed_pending_verification" } },
        { admin_status: { _eq: "open" } },
      ],
    }),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "on_hold" } }),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "disputed" } }),
    safeCount("sponsorship", {
      fulfillment_exception: { _eq: "refund_requested" },
    }),
    safeCount("sponsorship", { fulfillment_exception: { _eq: "refunded" } }),
    fetchRecentActivity(10),
  ]);

  return {
    base,
    activeSponsorships,
    activeChildren,
    pendingDonorApprovals,
    openTasks,
    tasksAwaitingVerification,
    fulfillmentOnHold,
    fulfillmentDisputed,
    fulfillmentRefundRequested,
    fulfillmentRefunded,
    recentActivity,
  };
}
