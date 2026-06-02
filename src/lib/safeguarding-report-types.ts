// Safeguarding report types + label maps. No server imports here so
// client components (the public form, admin actions) can import the
// enums/labels without pulling the Directus SDK into the browser bundle.

export const REPORT_SOURCES = [
  "public_form",
  "email_logged_manually",
  "internal",
] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

// Reporter-facing report types (shown on the public form).
export const REPORT_TYPES = [
  "concern_for_child",
  "inappropriate_contact",
  "data_privacy",
  "staff_conduct",
  "other",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  concern_for_child: "Concern for a child's welfare or safety",
  inappropriate_contact: "Inappropriate contact",
  data_privacy: "Data or privacy concern",
  staff_conduct: "Staff or contractor conduct",
  other: "Something else",
};

// Risk level — set by the lead during triage, NOT the reporter.
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const REPORT_STATUSES = [
  "new",
  "acknowledged",
  "under_review",
  "referred_to_authority",
  "resolved",
  "closed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  under_review: "Under review",
  referred_to_authority: "Referred to authority",
  resolved: "Resolved",
  closed: "Closed",
};

export interface SafeguardingReport {
  id: string;
  created_at: string | null;
  source: ReportSource | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_relationship: string | null;
  child_reference: string | null;
  report_type: ReportType | null;
  risk_level: RiskLevel | null;
  description: string | null;
  status: ReportStatus | null;
  assigned_to: string | null;
  action_taken: string | null;
  closed_at: string | null;
}
