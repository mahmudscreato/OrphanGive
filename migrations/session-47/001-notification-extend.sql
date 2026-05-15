-- Session 47 — extend the existing `notification` collection.
--
-- The collection was already created (likely during the bootstrap run
-- that seeded other DI/Admin Dashboard collections). It has 6 columns:
--   id, recipient, type, payload (json), read, read_at
--
-- We need two more columns so the API can sort newest-first and
-- attribute "who triggered this":
--   - date_created   timestamp, set automatically on insert
--   - created_by     uuid, set automatically to the requesting user
--
-- Both use Postgres-side defaults. The Directus admin UI also needs
-- the matching field rows in directus_fields with `special` values
-- so the auto-fill behavior shows in the admin form. We register
-- those via a separate API call after this migration runs (see
-- migrations/session-47/APPLY.md).
--
-- Idempotent — safe to re-run.

ALTER TABLE notification
  ADD COLUMN IF NOT EXISTS date_created timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES directus_users(id) ON DELETE SET NULL;

-- Index for the sort path: list-by-recipient-newest-first runs on
-- every notification API call, plus the bell-icon's unread-count
-- query. Composite index covers both.
CREATE INDEX IF NOT EXISTS notification_recipient_date_created_idx
  ON notification (recipient, date_created DESC);

-- Index for the unread filter (bell badge).
CREATE INDEX IF NOT EXISTS notification_recipient_read_idx
  ON notification (recipient, read);
