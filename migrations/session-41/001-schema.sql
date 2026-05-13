-- =====================================================================
-- Session 41 — DI Dashboard foundation schema migration
-- Authored: 2026-05-14
-- Spec: docs/DI_DASHBOARD_SPEC_v2.md
-- Apply: see migrations/session-41/APPLY.md (NOT applied automatically)
-- =====================================================================
--
-- This file is BOTH:
--   1. Schema source-of-truth for the 6 new collections + 3 column
--      additions introduced in Session 41.
--   2. The raw DDL to run against Postgres for tables NOT managed by
--      Directus's Admin UI.
--
-- ⚠ For Directus-managed collections, the canonical apply path is the
-- Directus Admin UI (see migrations/README.md). However, because this
-- migration creates SIX new collections and Directus doesn't import
-- arbitrary CREATE TABLE statements automatically, the recommended
-- flow is:
--   (a) Run this SQL via psql to create the underlying Postgres tables.
--   (b) Apply 002-directus-snapshot.yaml via `npx directus schema apply`
--       so Directus picks up the tables into its metadata + builds the
--       Admin UI surfaces + applies role + permissions.
-- See APPLY.md for the full step-by-step.
--
-- Idempotency: this file uses `CREATE TABLE IF NOT EXISTS` and `CREATE
-- INDEX IF NOT EXISTS` everywhere they're supported. Column additions
-- and CHECK constraints don't have idempotent syntax in standard
-- Postgres — those are guarded with DO blocks that test the catalog
-- first. Re-running this file on a fresh DB is safe; re-running on a
-- partially-applied DB is also safe.
--
-- ─── Schema/reality gap (see ship report flag #3) ─────────────────────
--
-- Some field names in DI_DASHBOARD_SPEC_v2.md don't match the existing
-- `child` collection's actual column names. This SQL uses the names
-- from the spec verbatim so the artifact matches the spec doc; where
-- the existing schema uses a different name or shape, the DI Dashboard
-- code in Sessions 42–46 will need a reconciliation step (either rename
-- existing columns, or have the app layer translate).
--
-- The two known gaps as of 2026-05-14:
--   * Spec uses `region_division text`. Production has `bd_division`
--     as a M2O relation to a `bd_division` lookup table. This SQL
--     ADDS `region_division text` as a new column rather than touch
--     the relation. Mahmud's call to consolidate or keep both.
--   * Spec uses `photo_url text`. Production uses `Photo` as a M2O
--     relation to `directus_files`. Not touched here — DI Dashboard
--     code will read from `Photo` and resolve via the existing
--     `directusAssetUrl()` helper.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- =====================================================================
-- 1. EXTENSIONS — required for gen_random_uuid()
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 2. MODIFICATIONS TO EXISTING COLLECTIONS
-- =====================================================================

-- 2.1 child — three new columns
-- ──────────────────────────────
-- uploaded_by_di_id   : DI who created the originating pending_change.
--                       Populated only on admin approval. Read-only after.
-- assigned_di_id      : Admin-assigned DI; nullable; reassignable.
-- district_internal   : Internal-only district label; NEVER exposed at
--                       Tier 1. Coexists with the existing `bd_district`
--                       M2O relation for now — DI-side input flow.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'child' AND column_name = 'uploaded_by_di_id'
  ) THEN
    ALTER TABLE child
      ADD COLUMN uploaded_by_di_id uuid REFERENCES directus_users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'child' AND column_name = 'assigned_di_id'
  ) THEN
    ALTER TABLE child
      ADD COLUMN assigned_di_id uuid REFERENCES directus_users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'child' AND column_name = 'district_internal'
  ) THEN
    ALTER TABLE child
      ADD COLUMN district_internal text;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_child_uploaded_by_di ON child(uploaded_by_di_id);
CREATE INDEX IF NOT EXISTS idx_child_assigned_di    ON child(assigned_di_id);

-- 2.2 child — region_division NOT NULL + 8-division CHECK constraint
-- ──────────────────────────────────────────────────────────────────
-- ⚠ SCHEMA-GAP NOTE: production `child` does NOT have a `region_division`
-- column today; it has `bd_division` as a M2O relation. To honour the
-- spec's CHECK constraint, this block ADDS the column if missing and
-- attaches the CHECK. Mahmud decides whether to:
--   (a) keep both columns (DI Dashboard writes to region_division,
--       admin approval triggers a sync into bd_division), OR
--   (b) drop bd_division in favour of region_division (denormalising
--       the lookup table; simpler but loses code/locale data), OR
--   (c) rewrite the spec to use the bd_division relation FK (forces
--       DI Dashboard to dereference the lookup).
-- See ship report flag #4.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'child' AND column_name = 'region_division'
  ) THEN
    ALTER TABLE child ADD COLUMN region_division text;
  END IF;

  -- Add CHECK constraint only if not already present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'child_region_division_valid'
  ) THEN
    ALTER TABLE child
      ADD CONSTRAINT child_region_division_valid CHECK (
        region_division IS NULL OR region_division IN (
          'Dhaka', 'Chattogram', 'Khulna', 'Rajshahi',
          'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh'
        )
      );
  END IF;

  -- NOT NULL is deferred — flipping to NOT NULL on existing rows would
  -- fail if any production row has region_division IS NULL (which it
  -- will after this column is just added). Mahmud must:
  --   (1) backfill region_division from bd_division.name
  --   (2) THEN run:
  --         ALTER TABLE child ALTER COLUMN region_division SET NOT NULL;
  -- See APPLY.md step 5.
END
$$;

-- 2.3 directus_users — assigned_divisions jsonb
-- ─────────────────────────────────────────────
-- Per spec 2.1: stores array of Bangladesh divisions the DI can CREATE
-- new children in. Does NOT govern READ visibility (that's enforced
-- via uploaded_by_di_id / assigned_di_id filters). Null for non-DI users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'directus_users' AND column_name = 'assigned_divisions'
  ) THEN
    ALTER TABLE directus_users ADD COLUMN assigned_divisions jsonb;
  END IF;
END
$$;

-- =====================================================================
-- 3. NEW COLLECTIONS
-- =====================================================================

-- 3.1 pending_changes
-- ───────────────────
-- Every DI mutation routes through this table. Admin reviews → approve
-- writes the payload to the target collection; reject just sets status.
-- 30-day expiry handled by /api/cron/expire-pending-changes (Session 41).

CREATE TABLE IF NOT EXISTS pending_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid REFERENCES directus_users(id) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  collection_name   text NOT NULL,
  record_id         text,
  operation         text NOT NULL CHECK (operation IN ('create', 'update')),
  payload           jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  reviewed_by       uuid REFERENCES directus_users(id),
  reviewed_at       timestamptz,
  review_reason     text,
  applied_record_id text,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_pending_changes_created_by ON pending_changes(created_by);
CREATE INDEX IF NOT EXISTS idx_pending_changes_status     ON pending_changes(status);
CREATE INDEX IF NOT EXISTS idx_pending_changes_collection ON pending_changes(collection_name);
CREATE INDEX IF NOT EXISTS idx_pending_changes_expires_at ON pending_changes(expires_at) WHERE status = 'pending';

-- 3.2 tasks
-- ─────────
-- Admin-assigned work items. DI owns `di_status` only; admin owns
-- `admin_status` + verification fields. Two-status pattern enforces
-- the verify-after-complete loop.

CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  child_id      uuid REFERENCES child(id),
  assignee_id   uuid REFERENCES directus_users(id) NOT NULL,
  created_by    uuid REFERENCES directus_users(id) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  due_date      date,
  priority      text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  di_status     text DEFAULT 'open'   CHECK (di_status IN ('open', 'in_progress', 'completed_pending_verification')),
  admin_status  text DEFAULT 'open'   CHECK (admin_status IN ('open', 'verified_complete', 'rejected_redo')),
  completed_at  timestamptz,
  verified_at   timestamptz,
  verified_by   uuid REFERENCES directus_users(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(di_status, admin_status);
CREATE INDEX IF NOT EXISTS idx_tasks_child    ON tasks(child_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE di_status != 'completed_pending_verification';

-- 3.3 audit_log
-- ─────────────
-- Append-only log of every mutating action. DI role has ZERO access.
-- The cron in Session 41 is the only writer wired up; broader audit
-- wiring is deferred to Session 46.
--
-- actor_id is NOT NULL → system writes need a `system` Directus user.
-- See migrations/session-41/003-system-user-note.md.

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp   timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES directus_users(id) NOT NULL,
  actor_role  text NOT NULL,
  action      text NOT NULL,
  collection  text,
  record_id   text,
  diff        jsonb,
  ip          inet,
  user_agent  text,
  metadata    jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_actor              ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action             ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp          ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_collection_record  ON audit_log(collection, record_id);

-- 3.4 moments (v2 — photo OR video)
-- ─────────────────────────────────
-- A "moment" is a small, dated piece of media (photo or short video)
-- showing the sponsored child's life. Always pending review.
-- duration_seconds is enforced via CHECK to match media_type.

CREATE TABLE IF NOT EXISTS moments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          uuid REFERENCES child(id) NOT NULL,
  caption           text NOT NULL CHECK (length(caption) <= 200),
  media_url         text NOT NULL,
  media_type        text NOT NULL CHECK (media_type IN ('image', 'video')),
  duration_seconds  integer CHECK (
    (media_type = 'image' AND duration_seconds IS NULL)
    OR (media_type = 'video' AND duration_seconds BETWEEN 1 AND 60)
  ),
  moment_date       date NOT NULL,
  uploaded_by       uuid REFERENCES directus_users(id) NOT NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  status            text DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  approved_by       uuid REFERENCES directus_users(id),
  approved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_moments_child  ON moments(child_id);
CREATE INDEX IF NOT EXISTS idx_moments_status ON moments(status);

-- 3.5 child_reports
-- ─────────────────
-- Periodic narrative reports about a child (school, health, wellbeing).
-- Uniqueness on (child_id, report_period) — one report per child per
-- period (period format defined by application layer; typically YYYY-Q#).

CREATE TABLE IF NOT EXISTS child_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid REFERENCES child(id) NOT NULL,
  report_period   text NOT NULL,
  narrative       text NOT NULL CHECK (length(narrative) BETWEEN 50 AND 1000),
  photo_url       text,
  school_status   text CHECK (school_status IN ('excellent', 'good', 'needs_attention', 'not_in_school')),
  health_status   text CHECK (health_status IN ('excellent', 'good', 'needs_attention')),
  wellbeing_note  text,
  submitted_by    uuid REFERENCES directus_users(id) NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  approved_by     uuid REFERENCES directus_users(id),
  approved_at     timestamptz,
  CONSTRAINT child_reports_unique_period UNIQUE (child_id, report_period)
);

CREATE INDEX IF NOT EXISTS idx_reports_child  ON child_reports(child_id);
CREATE INDEX IF NOT EXISTS idx_reports_period ON child_reports(report_period);

-- 3.6 aid_deliveries
-- ──────────────────
-- Photographic + descriptive record of aid delivered to a child.
-- sponsorship_id is nullable to allow general-fund deliveries that
-- don't trace to a specific sponsor.

CREATE TABLE IF NOT EXISTS aid_deliveries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                  uuid REFERENCES child(id) NOT NULL,
  sponsorship_id            uuid REFERENCES sponsorship(id),
  aid_type                  text NOT NULL CHECK (aid_type IN ('education', 'food', 'healthcare', 'clothing', 'general_care', 'other')),
  description               text NOT NULL,
  delivery_date             date NOT NULL,
  photo_url                 text NOT NULL,
  recipient_acknowledgment  text,
  delivered_by              uuid REFERENCES directus_users(id) NOT NULL,
  submitted_at              timestamptz NOT NULL DEFAULT now(),
  status                    text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by               uuid REFERENCES directus_users(id),
  verified_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deliveries_child        ON aid_deliveries(child_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_sponsorship  ON aid_deliveries(sponsorship_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status       ON aid_deliveries(status);

COMMIT;

-- =====================================================================
-- 4. POST-APPLY MANUAL STEPS
-- =====================================================================
--
-- After this SQL runs cleanly:
--   1. Create the `system` Directus user (see 003-system-user-note.md)
--      and add SYSTEM_USER_ID to .env.local.
--   2. Backfill child.region_division from bd_division.name (see APPLY.md
--      step 5). Then flip column to NOT NULL:
--        ALTER TABLE child ALTER COLUMN region_division SET NOT NULL;
--   3. Apply 002-directus-snapshot.yaml so Directus registers the new
--      collections in its metadata + creates the data_inputter role
--      with field-level permissions.
--   4. Restart the og-directus container so it reintrospects.
--   5. Smoke-test in Directus admin (see APPLY.md step 9).
-- =====================================================================
