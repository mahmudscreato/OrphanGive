-- =====================================================================
-- Session 41-v3 — DI Dashboard foundation, reconciled to production reality
-- Authored: 2026-05-14
-- Spec: planning Claude's locked v3 brief
-- Apply: see migrations/session-41-v3/APPLY-LOCAL-v3.md (NOT auto-applied)
-- =====================================================================
--
-- WHAT CHANGED FROM SESSION 41 (v2)
--
--   v2 (now superseded — branch session-41-di-foundation, NOT merged)
--   proposed 6 NEW collections incl. `pending_changes` as a generic
--   mutation queue. Local apply surfaced that production already has a
--   per-collection approval pattern (child_update / child_moment /
--   child_document), each with its own status + approved_by columns,
--   and a `Data Inputter` role with EXISTING direct create/update on
--   `child`. v3 builds on what exists instead of duplicating it.
--
--   v3 collections:
--     pending_changes  ──→  REPLACED by per-collection approval (no generic queue)
--     moments          ──→  EXTENDED existing `child_moment` (video + workflow)
--     child_reports    ──→  DROPPED (existing `child_update` covers this concept)
--     aid_deliveries   ──→  RENAMED `aid_delivery` (singular, matches existing convention)
--     tasks            ──→  RENAMED `task`         (singular)
--     audit_log        ──→  KEPT (no production equivalent)
--     [NEW]            ──→  child_proposal: proposed mutations to child
--                           records, columns matching child shape rather
--                           than JSONB payload (matches child_update style).
--
--   Plus: the existing `Data Inputter` role's direct create/update on
--   `child` will be STRIPPED in Part C (bootstrap/src/v3-update-permissions.ts)
--   so DI mutations route through child_proposal.
--
-- IDEMPOTENCY: every CREATE TABLE wrapped in IF NOT EXISTS; every
-- ALTER TABLE … ADD COLUMN guarded by an information_schema check
-- inside DO blocks; every CHECK constraint guarded by a pg_constraint
-- check inside DO blocks. Re-running on a partially-applied DB is safe.

BEGIN;

-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- =====================================================================
-- 2. NEW COLLECTIONS
-- =====================================================================

-- ─── 2.1 child_proposal ─────────────────────────────────────────────
-- Proposed mutations to child records (CREATE or UPDATE). Columns
-- mirror the `child` shape so the proposal is a typed staging area
-- rather than an opaque JSONB blob — matches the existing
-- `child_update` workflow shape.
--
-- Workflow: draft → pending → approved | rejected
-- DI writes proposal rows; admin approves; on approval, the application
-- layer applies the changes to `child` (Session 43 wires this).
--
-- previous_snapshot is a JSONB capture of the affected child row's
-- pre-mutation state, taken at the moment the proposal moves to
-- 'pending'. Lets admin diff old-vs-new during review without
-- re-querying historic state.

CREATE TABLE IF NOT EXISTS child_proposal (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_type               text NOT NULL CHECK (proposal_type IN ('create', 'update')),
  target_child                uuid REFERENCES child(id),
  display_name                text,
  first_name                  text,
  date_of_birth               date,
  gender                      text,
  bd_division                 uuid REFERENCES bd_division(id),
  district_internal           text,
  "Photo"                     uuid REFERENCES directus_files(id),
  story                       text,
  education_level             text,
  class_grade                 text,
  support_type                text,
  monthly_cost                integer,
  guardian_summary_internal   text,
  last_visit_date             date,
  status                      text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_reason            text,
  created_by                  uuid REFERENCES directus_users(id) NOT NULL,
  approved_by                 uuid REFERENCES directus_users(id),
  date_created                timestamptz NOT NULL DEFAULT now(),
  published_at                timestamptz,
  previous_snapshot           jsonb
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_proposal_support_type_check') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_support_type_check
      CHECK (support_type IS NULL OR support_type IN (
        'education', 'food', 'healthcare', 'clothing', 'general_care', 'other'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_proposal_monthly_cost_check') THEN
    ALTER TABLE child_proposal ADD CONSTRAINT child_proposal_monthly_cost_check
      CHECK (monthly_cost IS NULL OR monthly_cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_child_proposal_created_by ON child_proposal(created_by);
CREATE INDEX IF NOT EXISTS idx_child_proposal_status     ON child_proposal(status);
CREATE INDEX IF NOT EXISTS idx_child_proposal_target     ON child_proposal(target_child);

COMMENT ON TABLE child_proposal IS
  'DI-originated proposed mutations to child records. Columns mirror child shape; admin reviews + approves; app layer applies on approval.';
COMMENT ON COLUMN child_proposal.previous_snapshot IS
  'JSONB capture of the affected child row pre-mutation. Set when status transitions to ''pending''. Null for create proposals (no prior state).';

-- ─── 2.2 aid_delivery ───────────────────────────────────────────────
-- Photographic + descriptive record of aid delivered to a child.
-- sponsorship is nullable to allow general-fund deliveries that don't
-- trace to a specific sponsor. Matches the per-collection workflow
-- pattern (status defaults 'pending', admin verifies).

CREATE TABLE IF NOT EXISTS aid_delivery (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child                     uuid REFERENCES child(id) NOT NULL,
  sponsorship               uuid REFERENCES sponsorship(id),
  aid_type                  text NOT NULL CHECK (aid_type IN (
                              'education', 'food', 'healthcare', 'clothing', 'general_care', 'other'
                            )),
  description               text NOT NULL,
  delivery_date             date NOT NULL,
  photo                     uuid REFERENCES directus_files(id) NOT NULL,
  recipient_acknowledgment  text,
  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason          text,
  delivered_by              uuid REFERENCES directus_users(id) NOT NULL,
  verified_by               uuid REFERENCES directus_users(id),
  date_created              timestamptz NOT NULL DEFAULT now(),
  verified_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_aid_delivery_child         ON aid_delivery(child);
CREATE INDEX IF NOT EXISTS idx_aid_delivery_sponsorship   ON aid_delivery(sponsorship);
CREATE INDEX IF NOT EXISTS idx_aid_delivery_status        ON aid_delivery(status);

COMMENT ON TABLE aid_delivery IS
  'DI-recorded aid delivery events. Photo + description + optional acknowledgment. Admin verifies via the per-collection workflow.';

-- ─── 2.3 task ───────────────────────────────────────────────────────
-- Admin-assigned work items. DI owns `di_status` only; admin owns
-- `admin_status` + verification fields. Two-status pattern enforces
-- the verify-after-complete loop.

CREATE TABLE IF NOT EXISTS task (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  child         uuid REFERENCES child(id),
  assignee      uuid REFERENCES directus_users(id) NOT NULL,
  created_by    uuid REFERENCES directus_users(id) NOT NULL,
  date_created  timestamptz NOT NULL DEFAULT now(),
  due_date      date,
  priority      text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  di_status     text DEFAULT 'open'   CHECK (di_status IN ('open', 'in_progress', 'completed_pending_verification')),
  admin_status  text DEFAULT 'open'   CHECK (admin_status IN ('open', 'verified_complete', 'rejected_redo')),
  completed_at  timestamptz,
  verified_at   timestamptz,
  verified_by   uuid REFERENCES directus_users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignee  ON task(assignee);
CREATE INDEX IF NOT EXISTS idx_task_status    ON task(di_status, admin_status);
CREATE INDEX IF NOT EXISTS idx_task_child     ON task(child);
CREATE INDEX IF NOT EXISTS idx_task_due_date  ON task(due_date) WHERE di_status != 'completed_pending_verification';

COMMENT ON TABLE task IS
  'Admin-assigned work items for DI. di_status owned by DI; admin_status owned by admin.';

-- ─── 2.4 audit_log ──────────────────────────────────────────────────
-- Append-only log of every mutating action. DI role has ZERO access.
-- The cron in Part D is the only writer this session; broader audit
-- wiring deferred to Session 46.
--
-- actor is NOT NULL → system writes need a `system` Directus user
-- (SYSTEM_USER_ID env var; see Session 41-v3 system-user note).

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp   timestamptz NOT NULL DEFAULT now(),
  actor       uuid REFERENCES directus_users(id) NOT NULL,
  actor_role  text NOT NULL,
  action      text NOT NULL,
  collection  text,
  record_id   text,
  diff        jsonb,
  ip          inet,
  user_agent  text,
  metadata    jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_actor              ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_action             ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp          ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_collection_record  ON audit_log(collection, record_id);

COMMENT ON TABLE audit_log IS
  'Append-only audit trail. DI role has zero access. Wired narrowly in Session 41-v3 (cron only); broader wiring in Session 46.';

-- =====================================================================
-- 3. EXISTING COLLECTION EXTENSIONS
-- =====================================================================

-- ─── 3.1 child — DI tracking + per-child support fields ────────────
-- monthly_cost stays NULLABLE per locked decision. Existing rows are
-- backfilled to 1500 for continuity with the previously-hardcoded UI
-- string, but new rows can be NULL until DI/admin populates.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='uploaded_by_di') THEN
    ALTER TABLE child ADD COLUMN uploaded_by_di uuid REFERENCES directus_users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='assigned_di') THEN
    ALTER TABLE child ADD COLUMN assigned_di uuid REFERENCES directus_users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='district_internal') THEN
    ALTER TABLE child ADD COLUMN district_internal text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='support_type') THEN
    ALTER TABLE child ADD COLUMN support_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='monthly_cost') THEN
    ALTER TABLE child ADD COLUMN monthly_cost integer;
    -- Backfill existing rows; new rows can stay NULL.
    UPDATE child SET monthly_cost = 1500 WHERE monthly_cost IS NULL;
    -- NOT NULL is INTENTIONALLY NOT enforced — locked decision per spec v3.
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='guardian_summary_internal') THEN
    ALTER TABLE child ADD COLUMN guardian_summary_internal text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child' AND column_name='last_visit_date') THEN
    ALTER TABLE child ADD COLUMN last_visit_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_support_type_check') THEN
    ALTER TABLE child ADD CONSTRAINT child_support_type_check
      CHECK (support_type IS NULL OR support_type IN (
        'education', 'food', 'healthcare', 'clothing', 'general_care', 'other'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_monthly_cost_check') THEN
    ALTER TABLE child ADD CONSTRAINT child_monthly_cost_check
      CHECK (monthly_cost IS NULL OR monthly_cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_child_uploaded_by_di ON child(uploaded_by_di);
CREATE INDEX IF NOT EXISTS idx_child_assigned_di    ON child(assigned_di);

-- ─── 3.2 directus_users.assigned_divisions ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='directus_users' AND column_name='assigned_divisions') THEN
    ALTER TABLE directus_users ADD COLUMN assigned_divisions jsonb;
  END IF;
END $$;

COMMENT ON COLUMN directus_users.assigned_divisions IS
  'Array of bd_division record UUIDs (NOT text names). Constrains divisions a DI can CREATE new children in via child_proposal. Does NOT govern READ visibility — that is uploaded_by_di = self OR assigned_di = self on child.';

-- ─── 3.3 child_moment — video support + workflow tightening ────────
-- The existing collection holds curated photos (status default
-- 'published', no workflow gate). v3 adds:
--   * media_type column + check (image|video)
--   * duration_seconds with media_type-coupled CHECK
--   * status default flipped from 'published' → 'pending' for new rows
-- Existing 2 rows keep their current 'published' status (they were
-- created by Mahmud directly; backfill not needed).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_moment' AND column_name='media_type') THEN
    ALTER TABLE child_moment ADD COLUMN media_type text DEFAULT 'image';
    UPDATE child_moment SET media_type = 'image' WHERE media_type IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_moment' AND column_name='duration_seconds') THEN
    ALTER TABLE child_moment ADD COLUMN duration_seconds integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_moment_media_type_check') THEN
    ALTER TABLE child_moment ADD CONSTRAINT child_moment_media_type_check
      CHECK (media_type IN ('image', 'video'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_moment_duration_check') THEN
    ALTER TABLE child_moment ADD CONSTRAINT child_moment_duration_check
      CHECK (
        (media_type = 'image' AND duration_seconds IS NULL)
        OR (media_type = 'video' AND duration_seconds BETWEEN 1 AND 60)
      );
  END IF;
END $$;

-- Tighten new-row default to 'pending'. Existing 2 rows remain
-- 'published' (DEFAULT change only affects future inserts).
ALTER TABLE child_moment ALTER COLUMN status SET DEFAULT 'pending';

COMMIT;

-- =====================================================================
-- POST-APPLY MANUAL STEPS
-- =====================================================================
--
-- 1. Run bootstrap/src/v3-register-collections.ts — registers the 4
--    new collections + child_moment additions in directus_collections /
--    directus_fields metadata so they appear in admin UI.
-- 2. Run bootstrap/src/v3-update-permissions.ts — strips child
--    create/update from existing Data Inputter policy, adds workflow
--    presets/filters, attaches new permissions for child_proposal /
--    aid_delivery / task. Extends Admin policy with new collections.
-- 3. Restart og-directus-local container (picks up registrations).
-- 4. Verify via Directus admin UI + log in as data_in@input.com test user.
-- See APPLY-LOCAL-v3.md for the full apply walkthrough.
-- =====================================================================
