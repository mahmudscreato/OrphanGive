// Session 45 — DI report option lists.
//
// Lives in its own (non-`server-only`) module so the client ReportForm
// can import the dropdown choices without dragging the server data
// layer into the bundle. The server di-reports.ts re-exports these
// values for symmetry with V1's call sites.

export type ReportType =
  | "academic"
  | "health"
  | "story"
  | "photo"
  | "milestone"
  | "eid_greeting"
  | "letter";

export type ReportVisibility = "sponsor_only" | "all_donors";

export const REPORT_TYPE_OPTIONS: ReadonlyArray<{
  value: ReportType;
  label: string;
}> = [
  { value: "story", label: "Story / general update" },
  { value: "academic", label: "Academic" },
  { value: "health", label: "Health" },
  { value: "milestone", label: "Milestone" },
  { value: "eid_greeting", label: "Eid greeting" },
  { value: "letter", label: "Letter from child" },
  { value: "photo", label: "Photo update" },
];

export const REPORT_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ReportVisibility;
  label: string;
  helper: string;
}> = [
  {
    value: "all_donors",
    label: "All donors",
    helper: "Visible to anyone browsing this child's profile.",
  },
  {
    value: "sponsor_only",
    label: "Sponsor only",
    helper: "Visible only to the donors currently sponsoring this child.",
  },
];
