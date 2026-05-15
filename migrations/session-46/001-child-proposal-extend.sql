-- Session 46-fix-2 — extend child_proposal with 17 missing columns
--
-- The original Session 41-v3 child_proposal scaffolding stopped at 17
-- columns; child has ~48. DI could only edit ~30% of a profile. This
-- migration mirrors all DI-collectable fields from child onto
-- child_proposal so DI can submit edits to the full data model.
--
-- DELIBERATELY EXCLUDED (admin-only per spec privacy posture):
--   medical_conditions, allergies, mental_health_notes
--   *_encrypted columns (full_address_encrypted, etc.)
--
-- All ADD COLUMN statements use IF NOT EXISTS so the script is
-- idempotent — safe to re-apply on local dev or production.
-- Postgres 9.6+.
--
-- Apply (local):
--   docker exec -i og-postgres-local psql -U directus -d directus < \
--     migrations/session-46/001-child-proposal-extend.sql
--   docker restart og-directus-local
--
-- Then run the bootstrap script to register the new fields with
-- Directus's metadata layer (see migrations/session-46/APPLY.md).

BEGIN;

-- Identity / classification
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS gender                       varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS class_grade                  varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS areas_of_interest            text;

-- Location: bd_district FK to bd_district(code)
-- Mirrors the FK that already exists on child.bd_district. ON DELETE
-- SET NULL prevents proposal rows from being orphaned if a district
-- is later removed.
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS bd_district                  varchar(255)
    REFERENCES bd_district(code) ON DELETE SET NULL;

-- Photo consent — defaults FALSE on the column; the form re-defaults
-- it on every load so DI explicitly ticks each submission.
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS photo_consent                boolean
    DEFAULT false;

-- Health (selected — medical_conditions, allergies, mental_health_notes
-- are intentionally omitted)
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS blood_group                  varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS vaccination_status           varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS last_medical_checkup         date;

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS disability_status            varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS disability_notes             text;

-- Family / siblings
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS siblings_count               integer;

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS sibling_position             integer;

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS siblings_notes               text;

-- Socioeconomic
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS household_income_source      varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS monthly_household_income_bdt integer;

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS household_size               integer;

-- Guardian context
ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS guardian_relationship        varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS guardian_employment          varchar(255);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS additional_family_notes      text;

COMMIT;
