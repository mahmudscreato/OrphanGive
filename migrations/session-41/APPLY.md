# Session 41 — APPLY instructions

> **There are two APPLY versions.** Use `APPLY-LOCAL.md` for local
> Directus dry-run first; this file (`APPLY.md`) is for VPS
> production apply during the batch deploy. Same migrations,
> different commands.

> **Amended 2026-05-14:** `region_division` text column removed;
> `bd_division` (existing M2O relation) is the single source of
> truth. Plus 4 new `child` columns added (`support_type`,
> `monthly_cost`, `guardian_summary_internal`, `last_visit_date`) —
> these replace the hardcoded `"Education support"` /
> `"From BDT 1,500/month"` constants currently in
> `BrowseChildCard` and the homepage `FeaturedChildren` card.

Step-by-step for taking the four artifacts in `migrations/session-41/`
and turning them into running production state.

## Prerequisites

- VPS shell access (`ssh root@orphangive.org`)
- `psql` available locally OR inside the `og-database` container
- Directus admin login
- Tag the current Directus DB backup as `pre-session-41` BEFORE step 1

## 0 — Backup

```bash
# On the VPS
cd /opt/orphangive
docker exec og-database pg_dump -U directus directus \
  > backups/directus-pre-session-41-$(date +%Y%m%d-%H%M%S).sql
ls -la backups/ | tail -5
```


Verify the backup file is non-empty (`> 1MB` for a real DB).

## 1 — Apply 001-schema.sql

This file is idempotent (`CREATE TABLE IF NOT EXISTS`, `DO` blocks
guard column adds). Safe to re-run.

```bash
# On the VPS
cd /opt/orphangive
docker exec -i og-database psql -U directus -d directus \
  < migrations/session-41/001-schema.sql
```


Expected: `BEGIN`, `CREATE EXTENSION`, several `DO` block notices,
`CREATE TABLE` × 6, `CREATE INDEX` × N, `COMMIT`.

If you see errors, check:
- `ERROR: relation "child" does not exist` → wrong DB; you're in
  the wrong Postgres connection
- `ERROR: column "..." already exists` → a previous half-apply left
  state. Drop the new tables manually and re-run, OR proceed (the
  DO blocks should handle this idempotently — investigate before
  re-running blindly).

## 2 — Apply 002-directus-snapshot.yaml

Two paths — pick whichever your Directus version supports cleanly.

### Path A — `directus schema apply` CLI (preferred)

```bash
cd /opt/orphangive
docker exec og-directus npx directus schema apply \
  /directus/migrations/session-41/002-directus-snapshot.yaml
```


You'll need to mount this repo's `migrations/` into the container.
If it's not already mounted, add this to `docker-compose.yml` under
`og-directus.volumes`:

```yaml
- ./migrations:/directus/migrations:ro
```


Then `docker compose up -d og-directus` to pick up the mount.

### Path B — manual via Directus Admin UI

If `schema apply` rejects the file format, do this by hand:

1. Open Directus Admin → **Settings → Data Model**
2. For each of the 6 new collections (in order):
   - Click **+ Create Collection**
   - Enter the collection name exactly (e.g. `pending_changes`)
   - Set sort field, icon, color, display template per the YAML
   - For each field listed under `fields:` in the YAML, click
     **+ Create Field** and configure type / interface / options
3. For the role + permissions:
   - **Settings → Access Control → + Create Role**
   - Name: `data_inputter`, App access: false, Admin access: false
   - For each collection, configure permissions per the YAML's
     `permissions:` section

This is tedious — Path A is preferred even if it requires a
test-and-fix loop on the snapshot format.

## 3 — Verify schema in Directus

After step 2, open **Settings → Data Model** in admin. You should
see the six new collections in the list. Click each one and verify:
- Field list matches the YAML
- Display template renders correctly in the collection's row list
- The new `region_division` and `assigned_divisions` fields exist
  on `child` and `directus_users` respectively

## 4 — Create the system user

Follow `003-system-user-note.md`. End state:
- One user with email `system+cron@orphangive.org` exists
- `SYSTEM_USER_ID` env var on the VPS is set to that user's UUID
- `docker compose up -d app` was run after env update

## 5 — Verify division data via `bd_division` relation

No backfill required. Production `child` already populates
`bd_division` via the existing relation. Sanity-check the distribution
of children by division before continuing:

```sql
SELECT bd.name AS division, COUNT(c.id) AS child_count
FROM child c
LEFT JOIN bd_division bd ON c.bd_division = bd.id
GROUP BY bd.name
ORDER BY child_count DESC;
```


Expected: one row per division actually used in production, plus
possibly a row with `division = NULL` for any historical child whose
`bd_division` was never set. If you see NULLs, decide whether to
backfill them in Directus admin before exposing those children to the
DI Dashboard — the DI's READ permission technically still resolves a
null-division child, but the UI will render an empty division
location which is worth flagging in QA.

### Verify the 4 new child columns (Session 41.5)

```sql
-- Confirm 4 new child columns exist with expected constraints
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'child'
  AND column_name IN ('support_type', 'monthly_cost', 'guardian_summary_internal', 'last_visit_date')
ORDER BY column_name;
-- Expected: 4 rows. monthly_cost is_nullable = NO. Others = YES.

-- Backfill verification: every child should now have a monthly_cost
SELECT COUNT(*) AS children_without_cost FROM child WHERE monthly_cost IS NULL;
-- Expected: 0

-- support_type distribution (will be all NULL after first apply since
-- nothing backfills it):
SELECT support_type, COUNT(*) FROM child GROUP BY support_type;
-- Expected on fresh apply: one row with support_type=NULL containing
-- the full child count. DI/admin populates per-child going forward.
```


**Post-apply UI impact:** the hardcoded `"Education support"` and
`"From BDT 1,500/month"` strings in
`src/components/children/BrowseChildCard.tsx` (lines 277, 280) and
`src/components/home/FeaturedChildren.tsx` (lines 242, 246) become
orphaned constants once Session 43 ships the API route that returns
real per-child values. **Until Session 43, the UI continues to render
the hardcoded strings — there is NO regression.** The columns exist
on the table but nothing reads them yet. `support_type` rows will be
NULL until DI/admin populates them. `monthly_cost` rows are
backfilled to 1500 during apply so the column is NOT-NULL-safe;
admin can edit per-child afterward via the Admin Dashboard
(Sessions 47+). Two unrelated copies of "BDT 1,500" in
`SponsorCTA.tsx:57` and `ProfileHero.tsx:164` are descriptive
sponsorship-policy copy referencing the minimum tier, not per-child
display — they stay regardless.

## 6 — Restart Directus container

```bash
cd /opt/orphangive
docker restart og-directus
```


Wait ~10 seconds for Directus to reintrospect, then check logs:

```bash
docker logs og-directus --tail 50
```


No errors expected. The new collections should appear at the top of
the sidebar in Admin UI.

## 7 — Verify cron route

```bash
curl -X POST https://orphangive.org/api/cron/expire-pending-changes \
  -H "Authorization: Bearer $CRON_SECRET"
```


Expected (no expired rows yet):

```json
{ "expired_count": 0, "expired_ids": [], "duration_ms": 35 }
```


## 8 — Schedule the cron

Add to the VPS crontab (Mahmud's discretion on cadence; once a day
at 04:00 UTC matches the existing reveal-expiry cron):

```cron
# Session 41 — DI Dashboard pending_changes 30-day expiry.
# Expires status='pending' rows past their expires_at.
0 4 * * * curl -fsS -X POST https://orphangive.org/api/cron/expire-pending-changes -H "Authorization: Bearer $CRON_SECRET" >> /var/log/cron-expire-pending-changes.log 2>&1
```


## 9 — Smoke-test in Directus admin

Create a temporary `data_inputter` test user:
1. Settings → Users → + Create User
2. Role: `data_inputter`
3. `assigned_divisions: ["Dhaka"]`
4. Set a temporary password

Open an incognito browser, go to `https://admin.orphangive.org`,
log in as the test user. Verify (these should all be true per the
permission matrix):
- ✓ Can see `pending_changes` collection but only own rows
- ✓ Can see `tasks` collection but only assigned-to-self rows
- ✓ Can see `moments`, `child_reports`, `aid_deliveries` (read-only)
- ✗ Cannot see `donor` collection at all
- ✗ Cannot see `audit_log` collection at all
- ✗ Cannot see `site_page`, `faq` collections
- ✗ Cannot CREATE / UPDATE / DELETE on `child`
- ✗ Cannot CREATE / UPDATE / DELETE on `sponsorship`
- ✓ Can READ child rows where uploaded_by_di_id = self OR
  assigned_di_id = self
- ✓ Field-level READ on `child` excludes guardian contact, GPS,
  exact school, medical records, internal admin notes
- ✓ **bd_division relation traversal renders.** Open any visible
  child record as the test DI; the division name should pull through
  via the `bd_division.name` whitelist entry. If the relation
  resolves but the name shows as blank/UUID, Directus has applied
  the field whitelist at the scalar level but not the relation
  sub-fields — fix by ensuring both `bd_division` AND
  `bd_division.name` (and `bd_division.code` if used) appear in the
  fields whitelist in 002-snapshot.yaml's `child read` permission.

Delete the test user after verification.

## 10 — Done

Branch is on `session-41-di-foundation`. NOT merged. Held open for
batch deploy with Sessions 42–46 + Admin Dashboard + Child Profile +
Donor Dashboard branches.

When you're ready to merge the whole Stack:
```bash
git checkout main
git merge session-41-di-foundation
# … merge other DI Dashboard branches …
git push origin main
# THEN deploy: VPS git pull + this APPLY.md
```


---

## Schema reconciliation — locked decision (2026-05-14)

The DI Dashboard spec was written against an idealised `child` schema.
Production reality wins on the division question — `bd_division` (the
existing M2O relation to the `bd_division` lookup table) is the single
source of truth. The previous version of this file documented three
reconciliation paths; that decision is now locked and the section has
been removed. The remaining production-vs-spec gaps below are
informational only — Sessions 43–46 handle them at the app layer.

| Spec field | Production reality | Handling |
|---|---|---|
| `region_division text NOT NULL` with 8-division CHECK | M2O relation `bd_division` to `bd_division` lookup table | **Use the relation.** 002-snapshot.yaml whitelists `bd_division`, `bd_division.code`, `bd_division.name` so DI sees the division through the join. CREATE-scope validation in Session 44 compares submitted UUID against `directus_users.assigned_divisions`. |
| `photo_url text` | M2O relation `Photo` (capital P) to `directus_files` | Whitelist uses `Photo`. DI code reads the UUID and resolves via the existing `directusAssetUrl()` helper. |
| `age_years integer` | Computed at app layer from `date_of_birth` | Whitelist uses `date_of_birth`. DI code derives via `calcAge()`. |
| `support_type`, `monthly_cost`, `guardian_summary_internal`, `background_story_excerpt`, `sponsor_count`, `sponsor_queue_depth`, `last_visit_date` | None exist in production | Omitted from whitelist. Sessions 43–46's app-layer route returns these as derived/computed/hardcoded values. |
| `created_at` / `updated_at` | `date_created` not readable per existing code comment in `src/lib/children-data.ts:524` | Omitted from whitelist. Use `approved_at` (whitelisted) as the proxy for "when did this child go live". |

## Schema-gap section — sponsorship

Spec assumes `sponsorship.donor_display_name` and `sponsorship.country`
are denormalised columns. They are not — sponsorship joins to `donor`
via relation. The DI's READ permission on `sponsorship` lists those
fields in the whitelist; Directus will silently skip the missing ones
on apply. The DI Dashboard UI (Session 43) will need a Next.js API
route that:
- Reads `sponsorship` for the DI's child scope
- Joins to `donor` server-side
- Returns a redacted shape: `{ donor_display_name, sponsor_category,
  amount, country, start_date, end_date, status, queue_position }` —
  donor_real_name + email + phone + payment fields stripped before
  the JSON ever reaches the DI's browser

This is the right architecture either way: even if the columns were
denormalised, going through a typed API route gives us one place to
enforce the redaction.
