-- Session 48b — child_intake_photo collection.
--
-- Distinct from child_moment: this collection stores the 3-5 photos
-- captured at the initial field-visit / onboarding step as evidence
-- that the child profile is genuine. child_moment is the ongoing
-- timeline of life-update photos the donor sees post-sponsorship.
--
-- Design decisions:
--   - Linked to BOTH `child` (NOT NULL — the child this is about)
--     AND optionally `child_proposal` (nullable — set only when the
--     intake photos were uploaded as part of a CREATE proposal that
--     hasn't been approved yet; cleared / kept on approval depending
--     on admin policy). ON DELETE CASCADE on child so a child
--     deletion sweeps its intake set; ON DELETE SET NULL on
--     proposal so a proposal cleanup doesn't orphan the photos.
--   - `photo` ON DELETE RESTRICT prevents accidentally deleting the
--     underlying directus_files row out from under the intake.
--   - `display_order` drives the form-side reorder; admin can also
--     set it post-approval if curating for donor display.
--   - status enum mirrors child_proposal for consistency:
--     pending / approved / rejected / archived.
--   - reviewed_by / reviewed_at / rejection_reason fill in on admin
--     review; same shape Sessions 44-46 used on other collections.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS child_intake_photo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child             uuid NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  proposal          uuid REFERENCES child_proposal(id) ON DELETE SET NULL,
  photo             uuid NOT NULL REFERENCES directus_files(id) ON DELETE RESTRICT,
  caption           text,
  display_order     integer DEFAULT 0,
  uploaded_by       uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  status            varchar(32) DEFAULT 'pending',
  reviewed_by       uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  rejection_reason  text,
  date_created      timestamptz DEFAULT now()
);

-- List path: per-child query sorted by display_order. Composite covers
-- both filter + sort.
CREATE INDEX IF NOT EXISTS idx_intake_photo_child_order
  ON child_intake_photo (child, display_order);

-- Admin review queue: pending rows across all children.
CREATE INDEX IF NOT EXISTS idx_intake_photo_status
  ON child_intake_photo (status);

-- Per-DI list path: "what intake photos has this DI uploaded".
CREATE INDEX IF NOT EXISTS idx_intake_photo_uploader
  ON child_intake_photo (uploaded_by);

-- Per-proposal path: when admin reviews a CREATE proposal they need
-- to see all attached intake photos in one query.
CREATE INDEX IF NOT EXISTS idx_intake_photo_proposal
  ON child_intake_photo (proposal);

COMMIT;
