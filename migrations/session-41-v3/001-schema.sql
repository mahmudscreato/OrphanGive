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
-- IDEMPOTENCY: every ALTER TABLE … ADD COLUMN guarded by an
-- information_schema check inside DO blocks; every CHECK constraint
-- guarded by a pg_constraint check inside DO blocks. Re-running on a
-- partially-applied DB is safe.
--
-- SCOPE NOTE (Session 41-v3-FIX4): this file used to also CREATE the
-- 4 new collections (child_proposal, aid_delivery, task, audit_log).
-- Those moved to bootstrap/src/v3-register-collections.ts so Directus
-- creates the tables via createCollection (atomic with metadata
-- registration). What stays here: column extensions on existing
-- collections + the child_moment workflow tightening. The 4 new
-- collection schemas are documented inline in the SDK script.

BEGIN;

-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ─── §2 New collections — REMOVED in Session 41-v3-FIX4 ────────────
--
-- The 4 new collections (child_proposal, aid_delivery, task, audit_log)
-- were originally created here as raw CREATE TABLE blocks. FIX4 moves
-- table creation to Directus's `createCollection` SDK call (in
-- bootstrap/src/v3-register-collections.ts, Phase 1). Reason:
-- Directus's SDK creates BOTH the Postgres table AND the metadata row
-- atomically — pre-creating the table in SQL and trying to register
-- it after via SDK doesn't work cleanly in Directus 11.17.4 (the
-- `meta=null` auto-introspection problem caught in FIX3 + the
-- unregistered-but-detected confusion that followed).
--
-- The 4 collection schemas (columns, types, constraints, indexes)
-- live in v3-register-collections.ts as field defs. FK relations
-- live in the same file's `NEW_RELATIONS` array (Phase 4). Diff'ing
-- against the prior version of this file shows what moved.
--
-- This file now does column-extensions only (§3 below).
-- =====================================================================

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
  'Array of bd_division.code values (lowercase slug strings like ''dhaka'', ''chittagong'', ''khulna''). Constrains divisions a DI can CREATE new children in via child_proposal. Does NOT govern READ visibility — that is uploaded_by_di = self OR assigned_di = self on child.';

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
-- 1. Run bootstrap/src/v3-register-collections.ts — CREATES the 4
--    new tables via Directus's createCollection SDK call (table +
--    metadata atomically). Also registers the new fields on existing
--    collections (child, directus_users, child_moment) in Directus's
--    metadata so they appear in admin UI. Also registers FK relations
--    on the 4 new collections.
-- 2. Run bootstrap/src/v3-update-permissions.ts — strips child
--    create/update from existing Data Inputter policy, adds workflow
--    presets/filters, attaches new permissions for child_proposal /
--    aid_delivery / task. Extends Admin policy with new collections.
-- 3. Restart og-directus-local container (picks up registrations).
-- 4. Verify via Directus admin UI + log in as data_in@input.com test user.
-- See APPLY-LOCAL-v3.md for the full apply walkthrough.
-- =====================================================================
