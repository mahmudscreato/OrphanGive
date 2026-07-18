// Session 51 — Admin home page stat-tile data layer.
//
// Mirror of di-home-stats.ts (Session 47), but with no DI scope
// filter — admins see global counts. Same `safeCount` pattern using
// readItems + array.length (the SDK's aggregate() helper silently
// ignored filters per Session 47 discovery).
//
// V1 tiles per the Session 51 brief:
//   1. Pending proposals
//   2. Pending moments — combined count of child_moment + child_intake_photo
//                        in pending status. The audit doc Section 3
//                        flagged intake photos as a separate review queue
//                        candidate; combining for the home tile keeps
//                        "moments to look at" feeling like one task to the
//                        admin without obscuring the breakdown (rendered
//                        as a tooltip).
//   3. Pending deliveries
//   4. Pending documents

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";
import { countPendingDocuments } from "./admin-documents";
// Spine 1.2 — single source of truth for "pending reports" count.
// Same helper feeds the /admin/reviews index tile, so sidebar badge
// and index totals can't diverge. Status set is `submitted_by_di`
// + `under_admin_review` + legacy `pending` — `correction_requested`
// is awaiting the DI, NOT admin, so it's deliberately excluded.
import { countPendingReports } from "./admin-reports";
// fix/admin-quick-batch — pending donor information-access (reveal)
// requests. Same single-helper pattern: the /admin/reviews index tile
// already calls countPendingRevealRequests(), so surfacing the count
// here lets the sidebar Reviews badge include it without diverging.
import { countPendingRevealRequests } from "./reveal-data";

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
      `[admin-home-stats] count failed for ${collection}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export interface AdminHomeStats {
  pendingProposalCount: number | null;
  pendingMomentCount: number | null;
  pendingIntakePhotoCount: number | null;
  // NOTE: pendingDeliveryCount removed — the home "Deliveries" tile was
  // dropped (no admin delivery-review queue exists to link to). Re-add
  // when a real /admin delivery queue ships.
  pendingDocumentCount: number | null;
  // Spine 1.2 — surfaced for the sidebar Reviews badge aggregation
  // (src/app/admin/(authed)/layout.tsx). The /admin/reviews index
  // calls countPendingReports() directly for its tile; this field
  // exists so the badge can use the SAME helper without re-fetching.
  pendingReportCount: number | null;
  // fix/admin-quick-batch — pending donor information-access (reveal)
  // requests. Same rationale as pendingReportCount: the Reviews badge
  // needs this to bump when a new reveal request lands. The helper
  // returns 0 (not null) on failure, so this is effectively always a
  // number, but typed nullable to match the interface's other counts.
  pendingRevealCount: number | null;
}

export async function getAdminHomeStats(): Promise<AdminHomeStats> {
  const [
    pendingProposalCount,
    pendingMomentCount,
    pendingIntakePhotoCount,
    pendingDocumentCount,
    pendingReportCount,
    pendingRevealCount,
  ] = await Promise.all([
    safeCount("child_proposal", { status: { _eq: "pending" } }),
    safeCount("child_moment", { status: { _eq: "pending" } }),
    safeCount("child_intake_photo", { status: { _eq: "pending" } }),
    // Documents: Session 52d — delegate to countPendingDocuments
    // (the single read path also used by the queue list page
    // header) so divergence is impossible. 52c had separate
    // identical-looking queries that still produced a smoke-test
    // mismatch (home=9, queue=0); reusing the function eliminates
    // any drift.
    countPendingDocuments(),
    // Reports: Spine 1.2 — same single-helper pattern. Status set
    // matches the index tile: submitted_by_di + under_admin_review
    // + legacy 'pending'. Excludes correction_requested (those are
    // DI-blocked rows, not admin-blocked).
    countPendingReports(),
    // Reveal requests: fix/admin-quick-batch — same single-helper
    // pattern (the /admin/reviews index tile uses this exact call).
    // Counts reveal_request rows in 'pending' status.
    countPendingRevealRequests(),
  ]);

  return {
    pendingProposalCount,
    pendingMomentCount,
    pendingIntakePhotoCount,
    pendingDocumentCount,
    pendingReportCount,
    pendingRevealCount,
  };
}
