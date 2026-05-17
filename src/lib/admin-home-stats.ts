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
import { DOCUMENT_PENDING_STATUS_VALUES } from "./admin-documents";

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
  pendingDeliveryCount: number | null;
  pendingDocumentCount: number | null;
}

export async function getAdminHomeStats(): Promise<AdminHomeStats> {
  const [
    pendingProposalCount,
    pendingMomentCount,
    pendingIntakePhotoCount,
    pendingDeliveryCount,
    pendingDocumentCount,
  ] = await Promise.all([
    safeCount("child_proposal", { status: { _eq: "pending" } }),
    safeCount("child_moment", { status: { _eq: "pending" } }),
    safeCount("child_intake_photo", { status: { _eq: "pending" } }),
    safeCount("aid_delivery", { status: { _eq: "pending" } }),
    // Documents: imports DOCUMENT_PENDING_STATUS_VALUES from
    // admin-documents (Session 52c — single source of truth for
    // legacy + new vocabulary mapping; eliminates the "tile says 1
    // pending, queue shows empty" divergence that bit Mahmud in
    // 52b smoke testing).
    safeCount("child_document", {
      status: { _in: [...DOCUMENT_PENDING_STATUS_VALUES] },
    }),
  ]);

  return {
    pendingProposalCount,
    pendingMomentCount,
    pendingIntakePhotoCount,
    pendingDeliveryCount,
    pendingDocumentCount,
  };
}
