-- Session 48a — form expansion. Adds 13 new columns to BOTH `child`
-- and `child_proposal`, migrates `areas_of_interest` from text to
-- text[], and creates a new `school` lookup collection.
--
-- Idempotent — safe to re-run. Uses ADD COLUMN IF NOT EXISTS for
-- columns and conditional checks before the ALTER TYPE for arrays.
--
-- guardian_relationship enum extension is NOT done at the DB layer
-- (no CHECK constraint exists on either table per Session 48a
-- discovery — verified by SELECT-ing pg_constraint). The enum
-- extension is purely a Directus admin metadata update.
--
-- last_visit_date is intentionally NOT dropped — both columns coexist
-- for now; new submission_date is written alongside last_visit_date
-- by the form layer. Drop deferred to a future session after we
-- verify nothing else reads from last_visit_date.

BEGIN;

-- ─── New scalar columns on child ────────────────────────────────────

ALTER TABLE child
  ADD COLUMN IF NOT EXISTS permanent_address text,
  ADD COLUMN IF NOT EXISTS school_name_raw text,
  ADD COLUMN IF NOT EXISTS priority_support varchar(16) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS priority_notes text,
  ADD COLUMN IF NOT EXISTS parent_loss varchar(16),
  ADD COLUMN IF NOT EXISTS guardian_phone varchar(32),
  ADD COLUMN IF NOT EXISTS guardian_phone_alt varchar(32),
  ADD COLUMN IF NOT EXISTS submission_date date,
  ADD COLUMN IF NOT EXISTS guardian_employment_type varchar(32);

-- educational_organization is a forward FK; the school table is
-- created below so we add the column first then the constraint at
-- the end (post-table-creation).
ALTER TABLE child
  ADD COLUMN IF NOT EXISTS educational_organization uuid;

-- ─── Same scalar columns on child_proposal ──────────────────────────
--
-- Mirror set for the proposal collection so DIs can submit edits
-- against any of the new fields. Same defaults / nullability.

ALTER TABLE child_proposal
  ADD COLUMN IF NOT EXISTS permanent_address text,
  ADD COLUMN IF NOT EXISTS school_name_raw text,
  ADD COLUMN IF NOT EXISTS priority_support varchar(16) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS priority_notes text,
  ADD COLUMN IF NOT EXISTS parent_loss varchar(16),
  ADD COLUMN IF NOT EXISTS guardian_phone varchar(32),
  ADD COLUMN IF NOT EXISTS guardian_phone_alt varchar(32),
  ADD COLUMN IF NOT EXISTS submission_date date,
  ADD COLUMN IF NOT EXISTS guardian_employment_type varchar(32),
  ADD COLUMN IF NOT EXISTS educational_organization uuid;

-- ─── school collection ──────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS school_name_idx ON school (name);
CREATE INDEX IF NOT EXISTS school_division_idx ON school (bd_division);

-- Now wire the FK from child / child_proposal → school. Conditional
-- on the constraint not already existing so re-runs are safe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'child_educational_organization_fkey'
  ) THEN
    ALTER TABLE child
      ADD CONSTRAINT child_educational_organization_fkey
      FOREIGN KEY (educational_organization) REFERENCES school(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'child_proposal_educational_organization_fkey'
  ) THEN
    ALTER TABLE child_proposal
      ADD CONSTRAINT child_proposal_educational_organization_fkey
      FOREIGN KEY (educational_organization) REFERENCES school(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── areas_of_interest: text → text[] ───────────────────────────────
--
-- Both tables had this as plain text (free-form CSV in practice).
-- We migrate to text[] using string_to_array; existing CSV values
-- become array elements split on commas. NULL values stay NULL.
-- Conditional: only run the ALTER COLUMN if the current type is
-- text/varchar (skip if already text[]).

DO $$
BEGIN
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

COMMIT;
