-- ⚠ For Directus-managed collections, prefer adding fields via
-- Directus Admin UI (Settings → Data Model). This SQL is kept
-- as schema reference, not as the primary apply mechanism.
-- See migrations/README.md.
--
-- Session 14.7 Phase 2 — Queue shift decision tracking
--
-- When the active monthly sponsor extends their commitment, every
-- queued donor's start date shifts forward. We email each affected
-- donor with three options:
--   A. Accept the new date (default)
--   B. Transfer their support to another awaiting child
--   C. Cancel and refund
--
-- These four columns track that decision lifecycle. After a shift,
-- shift_decision_required is true and shift_decision_required_at is
-- set; the donor's dashboard surfaces a decision card. After the
-- donor responds (or 14 days elapse and the cron auto-accepts),
-- shift_decision is one of {'accept','transfer','refund'} and
-- shift_decision_at marks the resolution time.
--
-- Idempotent.
--
-- Apply via Directus Admin UI:
--   1. Open https://admin.orphangive.org/admin/settings/data-model/sponsorship
--   2. + Create Field x4:
--        Key: shift_decision_required     | Type: boolean  | Default: false | Allow null: yes
--        Key: shift_decision_required_at  | Type: dateTime |                | Allow null: yes
--        Key: shift_decision              | Type: string   | Choices: accept, transfer, refund | Allow null: yes
--        Key: shift_decision_at           | Type: dateTime |                | Allow null: yes
--   3. Save

ALTER TABLE sponsorship
  ADD COLUMN IF NOT EXISTS shift_decision_required BOOLEAN NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shift_decision_required_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS shift_decision TEXT NULL,
  ADD COLUMN IF NOT EXISTS shift_decision_at TIMESTAMP NULL;
