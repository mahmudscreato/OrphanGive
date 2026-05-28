// P4 — partnership_inquiry data layer.
//
// Two surfaces use this:
//   - POST /api/partnership-inquiry — public form submit, validated +
//     honeypot + rate-limited.
//   - /admin/partnerships — server-rendered admin queue listing.
//
// Privacy: adult partner-org contact info. NOT donor / child data.
// Standard PII handling. We never log message body anywhere; only
// the insert payload reaches Directus.
//
// Types + label maps live in partnership-inquiry-types.ts so client
// components can import them without dragging the Directus SDK into
// the browser bundle.

import "server-only";

import {
  createItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import {
  type InquiryStatus,
  type InquiryType,
  type PartnershipInquiry,
} from "./partnership-inquiry-types";

// Re-export so callers don't need two imports.
export {
  INQUIRY_TYPES,
  INQUIRY_TYPE_LABELS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABELS,
} from "./partnership-inquiry-types";
export type {
  InquiryStatus,
  InquiryType,
  PartnershipInquiry,
};

export interface CreatePartnershipInquiryInput {
  organisation_name: string;
  contact_name: string;
  role: string;
  email: string;
  phone?: string | null;
  inquiry_type: InquiryType;
  message: string;
  source?: string;
}

const INQUIRY_FIELDS = [
  "id",
  "organisation_name",
  "contact_name",
  "role",
  "email",
  "phone",
  "inquiry_type",
  "message",
  "source",
  "status",
  "created_at",
  "reviewed_by",
  "reviewed_at",
  "admin_notes",
] as const;

export async function createPartnershipInquiry(
  input: CreatePartnershipInquiryInput,
): Promise<{ id: string }> {
  // Defence-in-depth — trim everything before write so we never
  // store leading/trailing whitespace. Empty optional becomes null.
  const payload = {
    organisation_name: input.organisation_name.trim(),
    contact_name: input.contact_name.trim(),
    role: input.role.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    inquiry_type: input.inquiry_type,
    message: input.message.trim(),
    source: input.source?.trim() || "for-charities",
    status: "new" as InquiryStatus,
  };

  const row = (await directusServer().request(
    createItem("partnership_inquiry" as never, payload as never),
  )) as unknown as { id?: string } | undefined;

  const id = row?.id;
  if (!id) {
    throw new Error("createPartnershipInquiry: no id returned");
  }
  return { id };
}

export async function listPartnershipInquiries(
  filter: { status?: InquiryStatus | "all" } = {},
): Promise<PartnershipInquiry[]> {
  const f =
    filter.status && filter.status !== "all"
      ? { status: { _eq: filter.status } }
      : undefined;
  try {
    const rows = (await directusServer().request(
      readItems("partnership_inquiry" as never, {
        ...(f ? { filter: f } : {}),
        fields: [...INQUIRY_FIELDS],
        sort: ["-created_at"],
        limit: -1,
      } as never),
    )) as unknown as PartnershipInquiry[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[partnership-inquiries] list failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function setPartnershipInquiryStatus(
  id: string,
  status: InquiryStatus,
  reviewedByUserId: string,
): Promise<void> {
  await directusServer().request(
    updateItem("partnership_inquiry" as never, id as never, {
      status,
      reviewed_by: reviewedByUserId,
      reviewed_at: new Date().toISOString(),
    } as never),
  );
}

export async function setPartnershipInquiryNotes(
  id: string,
  notes: string,
  reviewedByUserId: string,
): Promise<void> {
  await directusServer().request(
    updateItem("partnership_inquiry" as never, id as never, {
      admin_notes: notes.trim() || null,
      reviewed_by: reviewedByUserId,
      reviewed_at: new Date().toISOString(),
    } as never),
  );
}

// ─── Counts for admin nav badge ────────────────────────────────────

export async function countNewPartnershipInquiries(): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("partnership_inquiry" as never, {
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
