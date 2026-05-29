// P4 — partnership inquiry shared types + label maps. Lives in its
// own module (no "server-only") so client components like the
// admin actions panel can import the labels without pulling the
// Directus SDK into the browser bundle.

export const INQUIRY_TYPES = [
  "offer_help",
  "need_help",
  "partner",
  "other",
] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];

export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  offer_help: "Offer help / can support a child",
  need_help: "Need help / NGO seeking sponsorship",
  partner: "Partnership / collaboration",
  other: "Other",
};

export const INQUIRY_STATUSES = [
  "new",
  "reviewed",
  "contacted",
  "closed",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  contacted: "Contacted",
  closed: "Closed",
};

export interface PartnershipInquiry {
  id: string;
  organisation_name: string | null;
  contact_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  inquiry_type: InquiryType | null;
  message: string | null;
  source: string | null;
  status: InquiryStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
}
