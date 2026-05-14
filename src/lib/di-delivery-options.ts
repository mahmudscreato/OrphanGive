// Session 45 — DI delivery option lists.
//
// Mirrors di-report-options.ts: a non-`server-only` home for the
// values the client DeliveryForm needs to render its select.

export type AidType =
  | "education"
  | "food"
  | "healthcare"
  | "clothing"
  | "general_care"
  | "other";

export const AID_TYPE_OPTIONS: ReadonlyArray<{
  value: AidType;
  label: string;
}> = [
  { value: "education", label: "Education" },
  { value: "food", label: "Food" },
  { value: "healthcare", label: "Healthcare" },
  { value: "clothing", label: "Clothing" },
  { value: "general_care", label: "General care" },
  { value: "other", label: "Other" },
];
