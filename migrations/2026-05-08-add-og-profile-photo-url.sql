-- Session 13.5c Part B — Profile photo URL
--
-- Adds one nullable text column to directus_users that stores the
-- Cloudinary secure_url returned after a signed upload. Idempotent —
-- safe to re-run.
--
-- Naming follows the existing OrphanGive-custom field convention on
-- directus_users (og_country, og_phone, og_stripe_customer_id, etc.).
-- The application layer reads/writes this through the Directus admin
-- token, so no Directus permissions/policies need updating beyond
-- whatever read access the Donor policy already has on the column
-- (none required — the app fetches via service token).
--
-- Apply with:
--   psql "$DATABASE_URL" -f migrations/2026-05-08-add-og-profile-photo-url.sql

ALTER TABLE directus_users
  ADD COLUMN IF NOT EXISTS og_profile_photo_url TEXT NULL;

-- After applying, Directus does NOT auto-detect the new column. Either
-- (a) restart the Directus container so it re-introspects the schema,
-- or (b) add the field via Directus Admin → Settings → Data Model →
-- Directus Users → Create Field with key=og_profile_photo_url, type=string.
-- Without this step the SDK won't accept patches for the field.
