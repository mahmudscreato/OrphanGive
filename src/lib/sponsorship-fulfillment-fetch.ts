// Donation Lifecycle — sub-phase 2 — fetch layer feeding the resolver.
//
// This module is the ONLY place that reads sponsorship.fulfillment_*
// columns + the latest task + the latest child_update for the
// purpose of computing fulfillment status. Centralising it here
// gives us:
//
//   1. ONE place to grep when auditing the donor-visibility boundary —
//      `fulfillment_reason` (private) is fetched into a server-only
//      input, then immediately passed to the pure resolver, which
//      returns BOTH internal + donor views. Callers must read .donor
//      on donor surfaces, .internal on admin surfaces. This module
//      never exposes the raw row.
//   2. ONE place to extend when Spine 1.2 merges — the latest-report
//      query already uses the right collection (`child_update`);
//      no change needed.
//
// Field selection notes:
//   - sponsorship: full fulfillment columns + the payment-axis fields
//     the resolver needs (status, cancelled_at). NOT the donor's
//     name, NOT the child's PII, NOT the donor-currency amounts —
//     none of which the resolver reads.
//   - task: only id, di_status, admin_status, date_created.
//     Deliberately no title/description/assignee — none feed the
//     resolver, and we don't want to accidentally surface admin's
//     internal task description on a donor screen.
//   - child_update: only id, status, published_at. Deliberately no
//     content/donor_text/photo — those render in the OTHER donor
//     section (Updates / "your report from the field") via the
//     separate getApprovedChildUpdates path. Fulfillment panel only
//     needs status to derive the phase.

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  resolveFulfillment,
  type FulfillmentResolved,
  type LatestReportInput,
  type LatestTaskInput,
  type SponsorshipFulfillmentInput,
} from "./fulfillment-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sponsorship row shape we fetch. Narrow on purpose — only the
// resolver's input fields. NOTE: includes `fulfillment_reason`
// (PRIVATE) so admin surfaces can render it via resolver.internal.
// Donor surfaces MUST read only resolver.donor — they get no access
// to fulfillment_reason because the resolver never copies it into
// the donor view.
type SponsorshipFulfillmentRow = {
  id: string;
  status: string | null;
  cancelled_at: string | null;
  fulfillment_exception: string | null;
  fulfillment_exception_at: string | null;
  fulfillment_reason: string | null;
  fulfillment_donor_visible_reason: string | null;
};

const SPONSORSHIP_FIELDS = [
  "id",
  "status",
  "cancelled_at",
  "fulfillment_exception",
  "fulfillment_exception_at",
  "fulfillment_reason",
  "fulfillment_donor_visible_reason",
] as const;

const TASK_FIELDS = [
  "id",
  "di_status",
  "admin_status",
  "date_created",
] as const;

const REPORT_FIELDS = ["id", "status", "published_at", "date_created"] as const;

function toInputs(
  row: SponsorshipFulfillmentRow,
): SponsorshipFulfillmentInput {
  // Narrow string → resolver's expected enum. The resolver tolerates
  // unknown statuses (falls through to spine derivation) so this is
  // just shape coercion.
  return {
    status: (row.status ?? "pending_payment") as SponsorshipFulfillmentInput["status"],
    cancelled_at: row.cancelled_at,
    fulfillment_exception:
      row.fulfillment_exception === "on_hold" ||
      row.fulfillment_exception === "disputed" ||
      row.fulfillment_exception === "refund_requested" ||
      row.fulfillment_exception === "refunded"
        ? row.fulfillment_exception
        : null,
    fulfillment_exception_at: row.fulfillment_exception_at,
    fulfillment_reason: row.fulfillment_reason,
    fulfillment_donor_visible_reason: row.fulfillment_donor_visible_reason,
  };
}

async function fetchSponsorshipRow(
  sponsorshipId: string,
): Promise<SponsorshipFulfillmentRow | null> {
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { id: { _eq: sponsorshipId } },
        fields: [...SPONSORSHIP_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as SponsorshipFulfillmentRow[] | undefined;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch (err) {
    console.warn(
      "[sponsorship-fulfillment-fetch] sponsorship read failed",
      { sponsorshipId, err: err instanceof Error ? err.message : err },
    );
    return null;
  }
}

async function fetchLatestTask(
  sponsorshipId: string,
): Promise<LatestTaskInput | null> {
  try {
    const rows = (await directusServer().request(
      readItems("task" as never, {
        filter: { sponsorship: { _eq: sponsorshipId } },
        fields: [...TASK_FIELDS],
        sort: ["-date_created"],
        limit: 1,
      } as never),
    )) as unknown as
      | Array<{
          id: string;
          di_status: string | null;
          admin_status: string | null;
          date_created: string | null;
        }>
      | undefined;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return null;
    return {
      id: row.id,
      di_status: row.di_status ?? "",
      admin_status: row.admin_status ?? "",
      date_created: row.date_created,
    };
  } catch (err) {
    console.warn(
      "[sponsorship-fulfillment-fetch] task read failed",
      { sponsorshipId, err: err instanceof Error ? err.message : err },
    );
    return null;
  }
}

async function fetchLatestReport(
  sponsorshipId: string,
): Promise<LatestReportInput | null> {
  try {
    const rows = (await directusServer().request(
      readItems("child_update" as never, {
        filter: { sponsorship: { _eq: sponsorshipId } },
        fields: [...REPORT_FIELDS],
        // FF1/FF2 — sort by date_created desc (the actual most-recent
        // report), NOT by id. child_update ids are uuid v4, which do
        // NOT sort by time, so "-id" could pick the wrong report as
        // latest when a sponsorship has multiple reports. date_created
        // is always populated (unlike published_at, which is null for
        // unpublished reports), so it's the robust chronological key —
        // matching how fetchLatestTask sorts.
        sort: ["-date_created"],
        limit: 1,
      } as never),
    )) as unknown as
      | Array<{ id: string; status: string | null; published_at: string | null }>
      | undefined;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return null;
    return {
      id: row.id,
      status: row.status ?? "",
      published_at: row.published_at,
    };
  } catch (err) {
    console.warn(
      "[sponsorship-fulfillment-fetch] child_update read failed",
      { sponsorshipId, err: err instanceof Error ? err.message : err },
    );
    return null;
  }
}

/**
 * Server-side helper: resolves the fulfillment status for a single
 * sponsorship by fetching the row + the latest task + the latest
 * report, then passing them through the pure resolver.
 *
 * Returns `null` when the sponsorship doesn't exist. Returns
 * `{internal, donor}` with `internal=null AND donor=null` when the
 * sponsorship is in pending_payment (donation not yet "in"; caller
 * should hide the fulfillment panel).
 *
 * THE PUBLIC CONTRACT:
 *   - Donor surfaces use the `.donor` property ONLY.
 *   - Admin / Super Admin surfaces use the `.internal` property.
 *   - Both must never be passed to the OTHER role's render. The
 *     resolver enforces field-level separation: `.donor` never
 *     carries `fulfillment_reason` (PRIVATE) or any internal source
 *     debug strings.
 */
export async function getSponsorshipFulfillment(
  sponsorshipId: string,
): Promise<FulfillmentResolved | null> {
  if (!UUID_RE.test(sponsorshipId)) return null;
  const row = await fetchSponsorshipRow(sponsorshipId);
  if (!row) return null;
  // Parallel-fetch the spine rows.
  const [latestTask, latestReport] = await Promise.all([
    fetchLatestTask(sponsorshipId),
    fetchLatestReport(sponsorshipId),
  ]);
  return resolveFulfillment({
    sponsorship: toInputs(row),
    latestTask,
    latestReport,
  });
}
