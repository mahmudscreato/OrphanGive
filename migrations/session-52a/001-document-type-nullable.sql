-- Session 52a — relax legacy NOT NULLs on child_document so the
-- new brief-spec writes succeed.
--
-- Why this exists. Session 41-v3 bootstrap created child_document
-- with `type` as varchar NOT NULL with NO default. Session 49 added
-- the new `document_type` column (canonical) ADDITIVELY but didn't
-- touch the legacy NOT NULL. New writes from the DI documents form
-- set `document_type` and leave `type` null → Postgres rejects the
-- INSERT with "null value in column type violates not-null
-- constraint" → /api/di/documents POST returns 500 → DocumentsSection
-- surfaces the generic "Couldn't save that document" toast.
--
-- The Session 50 reconciliation (`document-normalize.ts`) already
-- handles READS from either column shape — the donor-facing
-- DocumentsBanner sees the right counts whether a row uses the new
-- or legacy vocabulary. The remaining work is to let new WRITES
-- proceed with the legacy column null.
--
-- Future cleanup (Session 52+N): backfill `document_type` from
-- legacy `type` for any rows still using only the legacy column,
-- then DROP the legacy `type` / `review_notes` / `waiver_justification`
-- columns entirely. Not in scope for this hotfix.
--
-- Same logic applies to the legacy `status` column on paper, but
-- that one has DEFAULT 'pending_review' so an INSERT that omits it
-- works fine — and we're writing `status='pending'` explicitly
-- anyway. No constraint relaxation needed there.
--
-- Idempotent: Postgres ALTER ... DROP NOT NULL is a no-op when the
-- column is already nullable.

BEGIN;

ALTER TABLE child_document ALTER COLUMN type DROP NOT NULL;

COMMIT;
