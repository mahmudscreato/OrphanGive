// Safeguarding report data layer.
//
// ACCESS: every CALLER of this module must already have passed
// requireSafeguardingLead() (admin queue + admin APIs), EXCEPT
// createSafeguardingReport(), which the PUBLIC submit endpoint calls to
// insert a report (no read access — write-only path for the public form).
//
// All reads/writes go through directusServer() (the full-access server
// token). The collection grants no user policy any access, so this server
// token is the only DB principal that can touch it.
//
// PRIVACY: report bodies (description / child_reference / action_taken)
// are NEVER logged to stdout/Sentry. Only ids surface in logs.

import "server-only";

import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  type ReportSource,
  type ReportStatus,
  type ReportType,
  type RiskLevel,
  type SafeguardingReport,
} from "./safeguarding-report-types";

export type {
  ReportSource,
  ReportStatus,
  ReportType,
  RiskLevel,
  SafeguardingReport,
};

const COLLECTION = "safeguarding_report";

const REPORT_FIELDS = [
  "id",
  "created_at",
  "source",
  "reporter_name",
  "reporter_email",
  "reporter_relationship",
  "child_reference",
  "report_type",
  "risk_level",
  "description",
  "status",
  "assigned_to",
  "action_taken",
  "closed_at",
] as const;

export interface CreateSafeguardingReportInput {
  source: ReportSource;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_relationship?: string | null;
  child_reference?: string | null;
  report_type: ReportType;
  description: string;
}

/**
 * Insert a new report. Called by the public submit endpoint (source=
 * public_form) and the manual email-log action (source=email_logged_
 * manually). risk_level/status/action_taken are NOT accepted here — the
 * lead sets risk + status later; status defaults to 'new' in the DB.
 */
export async function createSafeguardingReport(
  input: CreateSafeguardingReportInput,
): Promise<{ id: string }> {
  const payload = {
    source: input.source,
    reporter_name: input.reporter_name?.trim() || null,
    reporter_email: input.reporter_email?.trim().toLowerCase() || null,
    reporter_relationship: input.reporter_relationship?.trim() || null,
    child_reference: input.child_reference?.trim() || null,
    report_type: input.report_type,
    description: input.description.trim(),
    status: "new" as ReportStatus,
  };

  const row = (await directusServer().request(
    createItem(COLLECTION as never, payload as never),
  )) as unknown as { id?: string } | undefined;

  const id = row?.id;
  if (!id) {
    throw new Error("createSafeguardingReport: no id returned");
  }
  return { id };
}

export async function listSafeguardingReports(
  filter: { status?: ReportStatus | "all" } = {},
): Promise<SafeguardingReport[]> {
  const f =
    filter.status && filter.status !== "all"
      ? { status: { _eq: filter.status } }
      : undefined;
  try {
    const rows = (await directusServer().request(
      readItems(COLLECTION as never, {
        ...(f ? { filter: f } : {}),
        fields: [...REPORT_FIELDS],
        sort: ["-created_at"],
        limit: -1,
      } as never),
    )) as unknown as SafeguardingReport[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[safeguarding-reports] list failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function getSafeguardingReport(
  id: string,
): Promise<SafeguardingReport | null> {
  try {
    const row = (await directusServer().request(
      readItem(COLLECTION as never, id as never, {
        fields: [...REPORT_FIELDS],
      } as never),
    )) as unknown as SafeguardingReport | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** Lead sets the triage risk level. */
export async function setSafeguardingReportRisk(
  id: string,
  risk: RiskLevel,
): Promise<void> {
  await directusServer().request(
    updateItem(COLLECTION as never, id as never, {
      risk_level: risk,
    } as never),
  );
}

/** Lead changes status. Stamps closed_at when entering a terminal state. */
export async function setSafeguardingReportStatus(
  id: string,
  status: ReportStatus,
): Promise<void> {
  const closing = status === "resolved" || status === "closed";
  await directusServer().request(
    updateItem(COLLECTION as never, id as never, {
      status,
      closed_at: closing ? new Date().toISOString() : null,
    } as never),
  );
}

/** Lead records the action taken (free text). */
export async function setSafeguardingReportAction(
  id: string,
  actionTaken: string,
): Promise<void> {
  await directusServer().request(
    updateItem(COLLECTION as never, id as never, {
      action_taken: actionTaken.trim() || null,
    } as never),
  );
}

/** Lead assigns the report to a user (default: themselves). */
export async function assignSafeguardingReport(
  id: string,
  userId: string,
): Promise<void> {
  await directusServer().request(
    updateItem(COLLECTION as never, id as never, {
      assigned_to: userId,
    } as never),
  );
}

/** Count of un-triaged (new) reports — for the lead's nav badge. */
export async function countNewSafeguardingReports(): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems(COLLECTION as never, {
        filter: { status: { _eq: "new" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}
