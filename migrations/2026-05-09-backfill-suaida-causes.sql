-- Optional backfill — varied cause values for Suaida's test sponsorships.
-- Apply this if you want the dashboard to actually show different cause
-- labels during visual verification; otherwise every existing row stays
-- at NULL and renders as "Where most needed" (the labelForCause fallback).
--
-- This is NOT a schema migration; it's pure data backfill. Idempotent
-- (uses display_name+email matching, so re-running is safe but may
-- silently fail if Suaida's sponsorships have already been altered).
-- Apply via Directus admin SQL panel or psql with DATABASE_URL.
--
-- Donor: mahmud@printagraphy.com (Suaida Afrin)

UPDATE sponsorship
SET cause = CASE
  WHEN c.display_name = 'Nishi Banu'      THEN 'education'
  WHEN c.display_name = 'Hasib Mia'       THEN 'healthcare'
  WHEN c.display_name = 'Fuad Hasan'      THEN 'food'
  WHEN c.display_name = 'Moni. Khatun'    THEN 'general_care'
  WHEN c.display_name = 'Fahim Khan'      THEN 'eid_gift'
  WHEN c.display_name = 'Salim Hasan'     THEN 'general_care'
  WHEN c.display_name = 'Tasneem Begum'   THEN 'eid_gift'
  WHEN c.display_name = 'Masum Ahmed'     THEN 'education'
  ELSE sponsorship.cause
END
FROM child c, directus_users d
WHERE sponsorship.child = c.id
  AND sponsorship.donor = d.id
  AND d.email = 'mahmud@printagraphy.com';
