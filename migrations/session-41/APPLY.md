# Session 41 — APPLY instructions

Step-by-step for taking the four artifacts in `migrations/session-41/`
and turning them into running production state. **Read the schema-gap
section at the bottom of this file before starting** — there are
spec/reality mismatches that need a decision before step 5.

## Prerequisites

- VPS shell access (`ssh root@orphangive.org`)
- `psql` available locally OR inside the `og-postgres` container
- Directus admin login
- Tag the current Directus DB backup as `pre-session-41` BEFORE step 1

## 0 — Backup

```bash
# On the VPS
cd /opt/orphangive
docker compose exec og-postgres pg_dump -U directus directus \
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
docker compose exec -T og-postgres psql -U directus -d directus \
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
docker compose exec og-directus npx directus schema apply \
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

## 5 — Backfill `child.region_division`

⚠ DECISION POINT — see schema-gap section at the bottom of this
file BEFORE running this step.

If Mahmud chose path (a) — keep both `region_division` and
`bd_division`:

```sql
-- Backfill region_division from the bd_division relation's name
-- column. Run inside psql against the directus DB.
UPDATE child
SET region_division = bd.name
FROM bd_division bd
WHERE child.bd_division = bd.id
  AND child.region_division IS NULL;

-- Verify zero remaining nulls before locking the column.
SELECT COUNT(*) FROM child WHERE region_division IS NULL;
-- Expected: 0

-- Lock the column NOT NULL.
ALTER TABLE child ALTER COLUMN region_division SET NOT NULL;
```


If Mahmud chose path (b) or (c) — see schema-gap section.

## 6 — Restart Directus container

```bash
cd /opt/orphangive
docker compose restart og-directus
```


Wait ~10 seconds for Directus to reintrospect, then check logs:

```bash
docker compose logs og-directus --tail 50
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

## Schema-gap section — read before step 5

The DI Dashboard spec (`docs/DI_DASHBOARD_SPEC_v2.md`) was written
against an idealised `child` schema. Production differs:

| Spec field           | Production reality                  | This migration's choice     |
|---|---|---|
| `region_division text NOT NULL` with 8-division CHECK | M2O relation `bd_division` to `bd_division` lookup table | Adds `region_division` as a new column alongside `bd_division`. Backfill in step 5. |
| `photo_url text`      | M2O relation `Photo` (capital P) to `directus_files` | Untouched. DI code uses existing `directusAssetUrl()` helper. |
| `age_years integer`   | Computed at app layer from `date_of_birth` | Untouched. DI code derives via `calcAge()`. |
| `support_type text`, `monthly_cost integer`, `guardian_summary_internal`, `background_story_excerpt`, `sponsor_count`, `sponsor_queue_depth`, `last_visit_date` | None of these exist in production | Listed in YAML field whitelist; Directus skips unknown fields gracefully. DI Dashboard code (Sessions 42–46) needs a reconciliation step — either add the columns or change spec/code to match reality. |

**Mahmud's decision before step 5:**

- **(a) Keep both `region_division` AND `bd_division`** (recommended).
  DI Dashboard writes to `region_division`. Admin approval flow
  syncs into `bd_division` for backwards compatibility with the
  existing /children page. Less invasive; preserves the lookup
  table and its locale data.

- **(b) Drop `bd_division`** entirely; denormalise to
  `region_division`. Simplest schema. Cost: lose any code/locale
  metadata stored on the lookup rows. Requires updating
  `src/lib/children-data.ts` to read from `region_division`
  directly.

- **(c) Rewrite spec** to use the existing `bd_division` relation.
  No schema change. Cost: spec drifts from "v2 locked", and the
  CHECK constraint moves from Postgres to application validation.

If unsure: pick (a). It's reversible.

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
