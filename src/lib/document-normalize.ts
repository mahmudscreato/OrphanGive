// Session 50 — child_document dual-enum compatibility layer.
//
// Background. The bootstrap script defined `child_document` with one
// vocabulary (Session 41-v3); the Session 49 brief introduced a new
// vocabulary with different column names AND different enum values.
// Both shapes coexist on the same table — the migration was purely
// additive — but the donor-facing renderer (DocumentsBanner) and
// the new DI-side write path target different columns.
//
//   Legacy column / enum    Brief-spec column / enum (Session 49)
//   ─────────────────────   ──────────────────────────────────────
//   type                    document_type
//     BIRTH_CERTIFICATE       child_birth_certificate
//     DEATH_CERTIFICATE_F.    parent_death_certificate
//     DEATH_CERTIFICATE_M.    parent_death_certificate
//     SCHOOL_RECOMMENDATION   school_recommendation
//     MADRASA_RECOMMENDATION  school_recommendation
//     GUARDIAN_NID            guardian_nid
//     OTHER                   (no canonical mapping → null)
//
//   status                  status (same column name, different vocab)
//     pending_review          pending
//     verified                approved
//     rejected                rejected
//     replacement_requested   pending
//     waived                  archived
//
// This module exposes two normalizers and one tiny row shape, so
// downstream readers (donor renderer + future admin review UI) can
// read either column shape without case-by-case logic. The new DI
// write path stays clean — it writes only the brief-spec columns.
//
// Future migration path. When Session-50+ N has ramp-down ready:
//   1. One-shot data migration copies legacy (type, status) into
//      (document_type, status) using the maps below.
//   2. Drop the legacy `type` and `review_notes` /
//      `waiver_justification` columns; simplify the bootstrap script.
//   3. Delete this module — readers go back to a single column path.
//
// Until then this file is the single point of vocabulary
// reconciliation. New enum values added in either vocabulary need a
// matching entry in the maps below.

import {
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "./form-constants";

// ─── Row shape ──────────────────────────────────────────────────────
//
// Minimal subset of `child_document` columns we need for
// normalization. Either vocabulary's column may be null on a given
// row — that's expected, the normalizers fall through to the other.
export interface RawDocumentRow {
  // Brief-spec columns (Session 49)
  document_type?: string | null;
  status?: string | null;
  // Legacy columns (Session 41-v3 bootstrap)
  type?: string | null;
}

// ─── Type normalization ─────────────────────────────────────────────

const LEGACY_TYPE_TO_NEW: Record<string, DocumentType | null> = {
  BIRTH_CERTIFICATE: "child_birth_certificate",
  DEATH_CERTIFICATE_FATHER: "parent_death_certificate",
  DEATH_CERTIFICATE_MOTHER: "parent_death_certificate",
  GUARDIAN_NID: "guardian_nid",
  SCHOOL_RECOMMENDATION: "school_recommendation",
  MADRASA_RECOMMENDATION: "school_recommendation",
  // OTHER intentionally omitted — no canonical brief equivalent.
  // Rows with type='OTHER' return null; downstream surfaces filter
  // those out so they don't surface in the new "X of 4 documents"
  // count.
};

const NEW_TYPES_SET = new Set<string>(DOCUMENT_TYPES);

/**
 * Returns one of the four canonical DocumentType values, or null
 * when the row doesn't map to any (e.g., legacy `type='OTHER'`,
 * or brand-new `document_type` value not yet in our enum).
 */
export function normalizeDocumentType(
  row: RawDocumentRow,
): DocumentType | null {
  // Prefer the new column if set.
  const newVal = row.document_type;
  if (newVal && NEW_TYPES_SET.has(newVal)) {
    return newVal as DocumentType;
  }
  // Fall back to legacy.
  const legacyVal = row.type;
  if (legacyVal && Object.prototype.hasOwnProperty.call(LEGACY_TYPE_TO_NEW, legacyVal)) {
    return LEGACY_TYPE_TO_NEW[legacyVal];
  }
  return null;
}

// ─── Status normalization ───────────────────────────────────────────

const LEGACY_STATUS_TO_NEW: Record<string, DocumentStatus> = {
  pending_review: "pending",
  verified: "approved",
  rejected: "rejected",
  replacement_requested: "pending",
  waived: "archived",
};

const NEW_STATUSES = new Set<DocumentStatus>([
  "pending",
  "approved",
  "rejected",
  "archived",
]);

/**
 * Returns one of the four canonical DocumentStatus values
 * (pending / approved / rejected / archived).
 *
 * Resolution order:
 *   1. If the row's status is one of the new vocabulary values, use it.
 *   2. Else if it's a known legacy value, map it.
 *   3. Else default to 'pending' (defensive — we'd rather show "not
 *      yet verified" than silently treat unknown rows as approved).
 */
export function normalizeDocumentStatus(row: RawDocumentRow): DocumentStatus {
  const v = row.status;
  if (v && NEW_STATUSES.has(v as DocumentStatus)) {
    return v as DocumentStatus;
  }
  if (v && Object.prototype.hasOwnProperty.call(LEGACY_STATUS_TO_NEW, v)) {
    return LEGACY_STATUS_TO_NEW[v];
  }
  return "pending";
}
