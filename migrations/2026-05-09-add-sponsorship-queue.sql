-- ⚠ For Directus-managed collections, prefer adding fields via
-- Directus Admin UI (Settings → Data Model). This SQL is kept
-- as schema reference, not as the primary apply mechanism.
-- See migrations/README.md.
--
-- Session 14.7 — Sponsor Queue (FIFO upfront-paid waiting list)
--
-- Extends 14.6's child-lock with a queue: when a child has an
-- active monthly sponsor, additional donors can pay upfront NOW
-- to claim a future slot. When the active sub ends (natural OR
-- early cancel), the next queued donor's sub activates
-- automatically.
--
-- Four new columns on the sponsorship collection:
--
--   queue_position (int, nullable, default 0)
--     0 = active sponsor (current behavior; all existing rows)
--     1 = next in queue (will activate when position=0 ends)
--     2, 3 = subsequent slots (depth limit = 3 queued donors)
--     null = doesn't apply (one-time, completed, cancelled)
--
--   queued_starts_at (timestamp, nullable)
--     When this queued sub will activate. Computed at queue-join
--     time = current active end date + sum of earlier-queued
--     subs' durations. Recomputed by promoteQueue / shiftQueueDates.
--
--   queued_ends_at (timestamp, nullable)
--     queued_starts_at + duration_months
--
--   queue_status (string, nullable)
--     'queued' = waiting (sponsorship row is status='active' but
--                not yet supporting the child)
--     null = doesn't apply (active and supporting, completed,
--            cancelled)
--
-- IMPORTANT — interaction with status='active':
-- A queued row carries status='active' (the donor's commitment
-- is alive in Stripe; the money is committed) but queue_status='queued'
-- + queue_position>0 indicate it's not yet supporting the child.
-- Every read site that wants "currently supporting" rows MUST also
-- filter `(queue_position IS NULL OR queue_position = 0)`. See
-- getActiveMonthlySponsorForChild + getMonthlySponsoredChildIds
-- for the canonical pattern.
--
-- Idempotent.
--
-- Apply via Directus Admin UI:
--   1. Open https://admin.orphangive.org/admin/settings/data-model/sponsorship
--   2. + Create Field x4:
--        Key: queue_position    | Type: integer  | Default: 0    | Allow null: yes
--        Key: queued_starts_at  | Type: dateTime |                | Allow null: yes
--        Key: queued_ends_at    | Type: dateTime |                | Allow null: yes
--        Key: queue_status      | Type: string   | Choices: queued | Allow null: yes
--   3. Save

ALTER TABLE sponsorship
  ADD COLUMN IF NOT EXISTS queue_position INT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_starts_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS queued_ends_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS queue_status TEXT NULL;
