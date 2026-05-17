-- Session 49 — child_document collection (or schema additions to it).
--
-- Tension worth understanding before reading this migration:
--
-- The bootstrap script (bootstrap/src/index.ts) already defined a
-- `child_document` table during Session 41-v3 with a different shape:
--
--   Legacy columns:           Brief-spec equivalent:
--     type (enum legacy)        document_type (varchar 32)
--     status (enum legacy)      status (varchar 32, new vocab)
--     review_notes (text)       notes (text)
--     waiver_justification      rejection_reason (text)
--     uploaded_by, reviewed_by, file, child  ← already match
--
-- Legacy enum values (`type` column):
--   DEATH_CERTIFICATE_FATHER, DEATH_CERTIFICATE_MOTHER, BIRTH_CERTIFICATE,
--   SCHOOL_RECOMMENDATION, MADRASA_RECOMMENDATION, GUARDIAN_NID, OTHER
--
-- Brief enum values (`document_type` column — the new canonical):
--   parent_death_certificate, child_birth_certificate, guardian_nid,
--   school_recommendation
--
-- Legacy status enum:
--   pending_review, verified, rejected, replacement_requested, waived
--
-- Brief status enum (the new canonical):
--   pending, approved, rejected, archived
--
-- Decision (Session 49):
--   - Migration is purely ADDITIVE so it works on both fresh DBs (no
--     legacy rows) AND existing DBs (legacy rows in production). Brief
--     columns get added IF NOT EXISTS, all NULLABLE so the existing
--     rows stay valid.
--   - The existing donor-side renderer (DocumentsBanner) reads the
--     LEGACY `type` + `status='verified'`. We do NOT modify that this
--     session — Session 49 is "documents collection + donor audit",
--     not "donor refactor". The audit doc flags this divergence.
--   - All NEW DI-side code (form, API, audit) writes ONLY to the
--     brief-spec columns: document_type, status (new vocab), notes,
--     reviewed_at, rejection_reason, proposal, date_created.
--   - Session 50 will be the right place to consolidate: backfill the
--     legacy columns from the new ones (or vice versa), then drop the
--     duplicates. The audit doc proposes the reconciliation plan.
--
-- Migration steps:
--   1. CREATE TABLE IF NOT EXISTS — handles fresh-DB case with the
--      brief's full spec (NOT NULLs included).
--   2. ALTER TABLE ADD COLUMN IF NOT EXISTS — handles existing-DB
--      case where the table was created via the bootstrap script and
--      is missing the new columns. NEW columns added here are nullable
--      so legacy rows don't violate constraints; the application layer
--      will populate them on every new write.
--   3. Indexes (per-column lookups + the unique partial constraint).
--
-- The unique partial index `uniq_document_child_type_approved` enforces
-- "one approved document of each type per child". A second approval
-- attempt for the same (child, document_type) pair fails with a
-- constraint violation; the application turns that into a friendly
-- "rejected the previous one first" message.

BEGIN;

-- 1. Fresh-DB path. NOT NULL on the canonical columns is the right
-- shape for new installs. On existing DBs this is a no-op (table
-- already exists).
CREATE TABLE IF NOT EXISTS child_document (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child             uuid NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  proposal          uuid REFERENCES child_proposal(id) ON DELETE SET NULL,
  document_type     varchar(32) NOT NULL,
  file              uuid NOT NULL REFERENCES directus_files(id) ON DELETE RESTRICT,
  notes             text,
  uploaded_by       uuid REFERENCES directus_users(id),
  status            varchar(32) NOT NULL DEFAULT 'pending',
  reviewed_by       uuid REFERENCES directus_users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  date_created      timestamptz DEFAULT now()
);

-- 2. Existing-DB path. Each new brief column is nullable here so
-- legacy rows (which have `type` populated but no `document_type`)
-- don't break. New writes from the application layer always set
-- document_type, file, status — so the lack of NOT NULL is purely a
-- transition concession, not a runtime risk.
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS proposal         uuid REFERENCES child_proposal(id) ON DELETE SET NULL;
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS document_type    varchar(32);
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS notes            text;
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz;
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS rejection_reason text;
-- date_created is auto-added by Directus's date-created special on
-- existing tables, but we ADD it defensively in case bootstrap missed.
ALTER TABLE child_document ADD COLUMN IF NOT EXISTS date_created     timestamptz DEFAULT now();

-- 3. Indexes — per-column lookup paths used by the data layer.
CREATE INDEX IF NOT EXISTS idx_document_child         ON child_document(child);
CREATE INDEX IF NOT EXISTS idx_document_proposal      ON child_document(proposal);
CREATE INDEX IF NOT EXISTS idx_document_status        ON child_document(status);
CREATE INDEX IF NOT EXISTS idx_document_type          ON child_document(document_type);

-- One approved row per (child, document_type). A WHERE-clause partial
-- index — pending/rejected/archived rows are unconstrained, only
-- approved is exclusive. Replacement workflow: admin rejects the old
-- approved row, then approves the new pending one.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_child_type_approved
  ON child_document (child, document_type)
  WHERE status = 'approved';

COMMIT;
