-- ============================================================
-- Deploy 2026-05-17 — Consolidated schema migration
-- ============================================================
--
-- Brings any Directus installation from "post-Session-41-v3 bootstrap
-- but missing Sessions 41-fix3 → 52e schema deltas" up to the
-- canonical state expected by the post-Session-52e codebase.
--
-- Composes every prior schema change ever made across sessions
-- 41-v3 (bootstrap baseline), 41-v3-FIX3 (uploaded_by_di etc.),
-- 46-fix-2 (child_proposal extensions), 47 (notification),
-- 48a (form expansion + school), 48b (intake photos + child_moment),
-- 49 (documents), 52a (document_type NOT NULL drop), plus the
-- standalone sponsorship migrations from May 2026 (queue, cause,
-- visibility, shift-decision).
--
-- ─── Idempotency contract ────────────────────────────────────────
--   • Every column add uses ADD COLUMN IF NOT EXISTS (PG 9.6+).
--   • Every table create uses CREATE TABLE IF NOT EXISTS.
--   • Every index create uses CREATE INDEX IF NOT EXISTS.
--   • Every FK constraint is wrapped in a DO block that checks
--     pg_constraint first.
--   • No DROP statements. No data manipulation. No NOT NULL on
--     newly-added columns. New columns either get a sensible
--     DEFAULT (so a NULL would never arise) or are nullable.
--   • Safe to re-run multiple times; subsequent runs are pure
--     no-ops.
--
-- ─── What this migration does NOT do ────────────────────────────
--   • Does not register collections / fields / permissions /
--     storage presets with Directus's metadata layer — that's
--     the job of 002-directus-register.sh, which MUST run after
--     this SQL + a Directus container restart.
--   • Does not insert seed data (donation buckets, addons, FAQ,
--     site_content). Production already has these; localhost
--     was seeded by the bootstrap script during Session 41-v3.
--   • Does not backfill any data. The child_document.type
--     column may stay nullable with legacy enum values; the
--     application reads via document-normalize.ts which handles
--     both shapes. Future backfill is a separate session.
--
-- Apply: see APPLY.md in this directory.

BEGIN;

-- ==================================================================
-- SECTION A: Extensions to existing tables
-- ==================================================================
--
-- The order matters in one place: child_proposal must exist BEFORE
-- we attempt to add child_document.proposal FK that references it.
-- We put child_proposal creation in this section because it's
-- conceptually an "existing" table on localhost (already created
-- by Session 41-v3 bootstrap) and a "new" table on VPS — the
-- CREATE TABLE IF NOT EXISTS handles both cases uniformly.

-- ─── A0. child_proposal table (Session 41-v3 + 46 + 48a) ──────────
--
-- Creates the table on VPS (where it doesn't exist yet) and is a
-- no-op on localhost (where it does). The subsequent ALTERs then
-- add any Session 46/48a columns that might be missing on either.

CREATE TABLE IF NOT EXISTS child_proposal (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_type     varchar(255) NOT NULL,
  target_child      uuid,
  status            varchar(255) NOT NULL DEFAULT 'draft',
  rejection_reason  text,
  created_by        uuid,
  approved_by       uuid,
  date_created      timestamptz,
  published_at      timestamptz,
  previous_snapshot json
);

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS display_name              varchar(255),
  ADD COLUMN IF NOT EXISTS first_name                varchar(255),
  ADD COLUMN IF NOT EXISTS date_of_birth             date,
  ADD COLUMN IF NOT EXISTS gender                    varchar(255),
  ADD COLUMN IF NOT EXISTS bd_division               varchar(255),
  ADD COLUMN IF NOT EXISTS bd_district               varchar(255),
  ADD COLUMN IF NOT EXISTS district_internal         varchar(255),
  ADD COLUMN IF NOT EXISTS "Photo"                   uuid,
  ADD COLUMN IF NOT EXISTS photo_consent             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS story                     text,
  ADD COLUMN IF NOT EXISTS education_level           varchar(255),
  ADD COLUMN IF NOT EXISTS class_grade               varchar(255),
  ADD COLUMN IF NOT EXISTS areas_of_interest         text,
  ADD COLUMN IF NOT EXISTS support_type              varchar(255),
  ADD COLUMN IF NOT EXISTS monthly_cost              integer,
  ADD COLUMN IF NOT EXISTS blood_group               varchar(255),
  ADD COLUMN IF NOT EXISTS vaccination_status        varchar(255),
  ADD COLUMN IF NOT EXISTS last_medical_checkup      date,
  ADD COLUMN IF NOT EXISTS disability_status         varchar(255),
  ADD COLUMN IF NOT EXISTS disability_notes          text,
  ADD COLUMN IF NOT EXISTS siblings_count            integer,
  ADD COLUMN IF NOT EXISTS sibling_position          integer,
  ADD COLUMN IF NOT EXISTS siblings_notes            text,
  ADD COLUMN IF NOT EXISTS household_income_source   varchar(255),
  ADD COLUMN IF NOT EXISTS monthly_household_income_bdt integer,
  ADD COLUMN IF NOT EXISTS household_size            integer,
  ADD COLUMN IF NOT EXISTS guardian_relationship     varchar(255),
  ADD COLUMN IF NOT EXISTS guardian_employment       varchar(255),
  ADD COLUMN IF NOT EXISTS guardian_summary_internal text,
  ADD COLUMN IF NOT EXISTS additional_family_notes   text,
  ADD COLUMN IF NOT EXISTS last_visit_date           date,
  ADD COLUMN IF NOT EXISTS permanent_address         text,
  ADD COLUMN IF NOT EXISTS school_name_raw           text,
  ADD COLUMN IF NOT EXISTS priority_support          varchar(16) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS priority_notes            text,
  ADD COLUMN IF NOT EXISTS parent_loss               varchar(16),
  ADD COLUMN IF NOT EXISTS guardian_phone            varchar(32),
  ADD COLUMN IF NOT EXISTS guardian_phone_alt        varchar(32),
  ADD COLUMN IF NOT EXISTS submission_date           date,
  ADD COLUMN IF NOT EXISTS guardian_employment_type  varchar(32),
  ADD COLUMN IF NOT EXISTS educational_organization  uuid;

-- FKs on child_proposal — conditional, only added if not already
-- present. ON DELETE SET NULL keeps the proposal row alive when
-- the referenced row is removed (matches what Session 46-fix-2
-- and bootstrap establish).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_target_child_foreign') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_target_child_foreign
      FOREIGN KEY (target_child) REFERENCES child(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_created_by_foreign') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_created_by_foreign
      FOREIGN KEY (created_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_approved_by_foreign') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_approved_by_foreign
      FOREIGN KEY (approved_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_bd_division_foreign') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_bd_division_foreign
      FOREIGN KEY (bd_division) REFERENCES bd_division(code) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_bd_district_fkey') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_bd_district_fkey
      FOREIGN KEY (bd_district) REFERENCES bd_district(code) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_photo_foreign') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_photo_foreign
      FOREIGN KEY ("Photo") REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Convert child_proposal.areas_of_interest text → text[] if still
-- text. Idempotent: skips if already text[]. NULL/empty values
-- stay NULL; non-empty CSVs split on commas.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='child_proposal' AND column_name='areas_of_interest')
     IN ('text','character varying') THEN
    ALTER TABLE child_proposal
      ALTER COLUMN areas_of_interest TYPE text[]
      USING CASE
        WHEN areas_of_interest IS NULL OR areas_of_interest = ''
          THEN NULL
        ELSE string_to_array(areas_of_interest, ',')
      END;
  END IF;
END $$;

-- ─── A1. child (Sessions 41-v3, 46, 48a) ──────────────────────────
--
-- Adds the seven Session 41-v3 columns (uploaded_by_di, assigned_di,
-- district_internal, support_type, monthly_cost,
-- guardian_summary_internal, last_visit_date) and the eleven
-- Session 48a columns (permanent_address through
-- educational_organization).

ALTER TABLE child
  ADD COLUMN IF NOT EXISTS uploaded_by_di            uuid,
  ADD COLUMN IF NOT EXISTS assigned_di               uuid,
  ADD COLUMN IF NOT EXISTS district_internal         text,
  ADD COLUMN IF NOT EXISTS support_type              text,
  ADD COLUMN IF NOT EXISTS monthly_cost              integer,
  ADD COLUMN IF NOT EXISTS guardian_summary_internal text,
  ADD COLUMN IF NOT EXISTS last_visit_date           date,
  ADD COLUMN IF NOT EXISTS permanent_address         text,
  ADD COLUMN IF NOT EXISTS school_name_raw           text,
  ADD COLUMN IF NOT EXISTS priority_support          varchar(16) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS priority_notes            text,
  ADD COLUMN IF NOT EXISTS parent_loss               varchar(16),
  ADD COLUMN IF NOT EXISTS guardian_phone            varchar(32),
  ADD COLUMN IF NOT EXISTS guardian_phone_alt        varchar(32),
  ADD COLUMN IF NOT EXISTS submission_date           date,
  ADD COLUMN IF NOT EXISTS guardian_employment_type  varchar(32),
  ADD COLUMN IF NOT EXISTS educational_organization  uuid;

-- FKs on child.uploaded_by_di and child.assigned_di.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_uploaded_by_di_fkey') THEN
    ALTER TABLE child ADD CONSTRAINT child_uploaded_by_di_fkey
      FOREIGN KEY (uploaded_by_di) REFERENCES directus_users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_assigned_di_fkey') THEN
    ALTER TABLE child ADD CONSTRAINT child_assigned_di_fkey
      FOREIGN KEY (assigned_di) REFERENCES directus_users(id);
  END IF;
END $$;

-- Indexes covering the per-DI list paths (the dashboard renders
-- "children assigned to me" + "children I uploaded" on every load).
CREATE INDEX IF NOT EXISTS idx_child_uploaded_by_di ON child(uploaded_by_di);
CREATE INDEX IF NOT EXISTS idx_child_assigned_di    ON child(assigned_di);

-- Convert child.areas_of_interest text → text[] if still text. Same
-- idempotency dance as on child_proposal above.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='child' AND column_name='areas_of_interest')
     IN ('text','character varying') THEN
    ALTER TABLE child
      ALTER COLUMN areas_of_interest TYPE text[]
      USING CASE
        WHEN areas_of_interest IS NULL OR areas_of_interest = ''
          THEN NULL
        ELSE string_to_array(areas_of_interest, ',')
      END;
  END IF;
END $$;

-- ─── A2. child_document (Sessions 49, 52a) ────────────────────────
--
-- Adds the post-Session-49 brief columns alongside the legacy
-- shape. Drops legacy NOT NULL on `type` so new inserts can leave
-- it null and write to `document_type` instead. Drops legacy NOT
-- NULL on `file` defensively (Session 49 brief made it nullable
-- but legacy bootstrap may have set it NOT NULL).

ALTER TABLE child_document
  ADD COLUMN IF NOT EXISTS document_type    varchar(32),
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS date_created     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS proposal         uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_document_proposal_fkey') THEN
    ALTER TABLE child_document ADD CONSTRAINT child_document_proposal_fkey
      FOREIGN KEY (proposal) REFERENCES child_proposal(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Session 52a — relax legacy NOT NULLs so new writes (which use
-- document_type, not type) don't violate the constraint.
ALTER TABLE child_document ALTER COLUMN type DROP NOT NULL;

-- Indexes — per-column lookup paths used by the admin queue list,
-- per-child filter, and per-status home tile.
CREATE INDEX IF NOT EXISTS idx_document_child    ON child_document(child);
CREATE INDEX IF NOT EXISTS idx_document_proposal ON child_document(proposal);
CREATE INDEX IF NOT EXISTS idx_document_status   ON child_document(status);
CREATE INDEX IF NOT EXISTS idx_document_type     ON child_document(document_type);

-- One approved row per (child, document_type). Partial unique:
-- pending/rejected/archived rows are unconstrained; only approved
-- is exclusive. Replacement workflow: admin rejects the old
-- approved row before approving the new pending one.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_child_type_approved
  ON child_document (child, document_type)
  WHERE status = 'approved';

-- ─── A3. child_moment (Session 48b) ───────────────────────────────
--
-- The media_type / duration_seconds columns were originally added
-- via Directus's createField API during the v3 bootstrap and aren't
-- in any session-XX SQL file. We add them here so VPS gets them via
-- the same path as localhost. Defaults to 'image' so existing rows
-- (none on VPS yet, 4 on localhost) all classify as image — which
-- they are.
ALTER TABLE child_moment
  ADD COLUMN IF NOT EXISTS media_type       text DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- We deliberately do NOT add the CHECK constraints
-- (child_moment_media_type_check, child_moment_duration_check)
-- here because they would fail on any pre-existing row where
-- media_type is NULL. The application layer enforces the same
-- invariants (see src/lib/di-moments.ts) so the check is belt-only.
-- If the production data is known-clean, the constraints can be
-- added post-deploy manually.

-- ─── A4. child_update — no new columns post-bootstrap ─────────────
-- (Listed for clarity; no ALTERs needed.)

-- ─── A5. notification (Session 47) ────────────────────────────────
ALTER TABLE notification
  ADD COLUMN IF NOT EXISTS date_created timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by   uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='notification_created_by_fkey') THEN
    ALTER TABLE notification ADD CONSTRAINT notification_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_recipient_date_created_idx
  ON notification (recipient, date_created DESC);
CREATE INDEX IF NOT EXISTS notification_recipient_read_idx
  ON notification (recipient, read);

-- ─── A6. directus_users (Session 41-v3 + Session 13.5c) ───────────
ALTER TABLE directus_users
  ADD COLUMN IF NOT EXISTS assigned_divisions   jsonb,
  ADD COLUMN IF NOT EXISTS og_profile_photo_url text;

-- ─── A7. sponsorship (Sessions 14.5, 14.6, 14.7, 14.7-P2) ─────────
ALTER TABLE sponsorship
  ADD COLUMN IF NOT EXISTS cause                       text      DEFAULT 'general_care',
  ADD COLUMN IF NOT EXISTS visibility                  text      DEFAULT 'anonymous',
  ADD COLUMN IF NOT EXISTS queue_position              integer   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_starts_at            timestamp,
  ADD COLUMN IF NOT EXISTS queued_ends_at              timestamp,
  ADD COLUMN IF NOT EXISTS queue_status                text,
  ADD COLUMN IF NOT EXISTS shift_decision_required     boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS shift_decision_required_at  timestamp,
  ADD COLUMN IF NOT EXISTS shift_decision              text,
  ADD COLUMN IF NOT EXISTS shift_decision_at           timestamp;

-- ==================================================================
-- SECTION B: New collections
-- ==================================================================

-- ─── B1. school (Session 48a) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS school (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  type         varchar(32),
  bd_division  varchar(64) REFERENCES bd_division(code) ON DELETE SET NULL,
  bd_district  varchar(64) REFERENCES bd_district(code) ON DELETE SET NULL,
  notes        text,
  created_by   uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  date_created timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_name_idx     ON school (name);
CREATE INDEX IF NOT EXISTS school_division_idx ON school (bd_division);

-- Wire FKs from child / child_proposal → school (now that school
-- exists). Conditional on the constraint not already existing.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_educational_organization_fkey') THEN
    ALTER TABLE child ADD CONSTRAINT child_educational_organization_fkey
      FOREIGN KEY (educational_organization) REFERENCES school(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='child_proposal_educational_organization_fkey') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_educational_organization_fkey
      FOREIGN KEY (educational_organization) REFERENCES school(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── B2. aid_delivery (Session 41-v3) ─────────────────────────────
CREATE TABLE IF NOT EXISTS aid_delivery (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child                    uuid NOT NULL REFERENCES child(id) ON DELETE SET NULL,
  sponsorship              uuid REFERENCES sponsorship(id) ON DELETE SET NULL,
  aid_type                 varchar(255) NOT NULL,
  description              text,
  delivery_date            date,
  photo                    uuid REFERENCES directus_files(id) ON DELETE SET NULL,
  recipient_acknowledgment text,
  status                   varchar(255) NOT NULL DEFAULT 'pending',
  rejection_reason         text,
  delivered_by             uuid NOT NULL REFERENCES directus_users(id) ON DELETE SET NULL,
  verified_by              uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  date_created             timestamptz,
  verified_at              timestamptz
);

-- ─── B3. task (Session 41-v3) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS task (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        varchar(255) NOT NULL,
  description  text,
  child        uuid REFERENCES child(id) ON DELETE SET NULL,
  assignee     uuid NOT NULL REFERENCES directus_users(id) ON DELETE SET NULL,
  created_by   uuid NOT NULL REFERENCES directus_users(id) ON DELETE SET NULL,
  date_created timestamptz,
  due_date     date,
  priority     varchar(255) DEFAULT 'normal',
  di_status    varchar(255) DEFAULT 'open',
  admin_status varchar(255) DEFAULT 'open',
  completed_at timestamptz,
  verified_at  timestamptz,
  verified_by  uuid REFERENCES directus_users(id) ON DELETE SET NULL
);

-- ─── B4. audit_log (Session 41-v3) ────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamptz,
  actor      uuid NOT NULL REFERENCES directus_users(id) ON DELETE SET NULL,
  actor_role varchar(255) NOT NULL,
  action     varchar(255) NOT NULL,
  collection varchar(255),
  record_id  varchar(255),
  diff       json,
  ip         varchar(255),
  user_agent text,
  metadata   json
);

-- ─── B5. child_intake_photo (Session 48b) ─────────────────────────
CREATE TABLE IF NOT EXISTS child_intake_photo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child            uuid NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  proposal         uuid REFERENCES child_proposal(id) ON DELETE SET NULL,
  photo            uuid NOT NULL REFERENCES directus_files(id) ON DELETE RESTRICT,
  caption          text,
  display_order    integer DEFAULT 0,
  uploaded_by      uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  status           varchar(32) DEFAULT 'pending',
  reviewed_by      uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  date_created     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_photo_child_order ON child_intake_photo (child, display_order);
CREATE INDEX IF NOT EXISTS idx_intake_photo_status      ON child_intake_photo (status);
CREATE INDEX IF NOT EXISTS idx_intake_photo_uploader    ON child_intake_photo (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_intake_photo_proposal    ON child_intake_photo (proposal);

COMMIT;

-- ============================================================
-- End of 001-schema.sql
-- ============================================================
--
-- After this completes:
--   1. Restart the Directus container so it re-introspects.
--   2. Run 002-directus-register.sh to register collections,
--      fields, permissions, and the storage preset.
--   3. Run 003-cleanup-checks.sh to verify the migration produced
--      the expected schema state.
