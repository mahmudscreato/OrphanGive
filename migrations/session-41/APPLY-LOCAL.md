# Session 41 — APPLY-LOCAL instructions (local Docker stack dry-run)

> **Local dry-run version of `APPLY.md`.** Run this FIRST against the
> local Docker stack (`docker-compose.local.yml`) before touching
> the VPS. Once verification passes locally, follow `APPLY.md`
> against VPS as part of the batch deploy. Bootstrap your local
> stack with Session 41-LOCAL before running anything here.

> **Amended 2026-05-14:** `region_division` text column removed;
> `bd_division` (existing M2O relation) is the single source of
> truth. Plus 4 new `child` columns added (`support_type`,
> `monthly_cost`, `guardian_summary_internal`, `last_visit_date`) —
> these replace the hardcoded `"Education support"` /
> `"From BDT 1,500/month"` constants currently in
> `BrowseChildCard` and the homepage `FeaturedChildren` card.

Step-by-step for taking the four artifacts in `migrations/session-41/`
and dry-running them against the local Postgres + Directus mirror that
Session 41-LOCAL bootstrapped.

## Prerequisites

- Local Docker stack running per Session 41-LOCAL
  (`docker compose --env-file .env.local-stack -f docker-compose.local.yml ps`
  shows both `og-postgres-local` and `og-directus-local` healthy)
- Production DB already restored into the local Postgres (Step 8 of
  Session 41-LOCAL — local row counts should match VPS: 10 children,
  73 sponsorships, 10 directus_users)
- `psql` available inside the `og-postgres-local` container
  (postgis/postgis:15-3.4-alpine ships it)
- Local Directus admin login (after the dump restore, **VPS admin
  credentials work** — the dump brought VPS users with it)

## 0 — Backup

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
mkdir -p backups
docker exec -i og-postgres-local pg_dump -U directus directus \
  > backups/directus-local-pre-session-41-$(date +%Y%m%d-%H%M%S).sql
ls -la backups/ | tail -5
```


Verify the backup file is non-empty (> 1 MB for the restored prod
data; ~4 MB matches the original VPS dump size).

## 1 — Apply 001-schema.sql

This file is idempotent (`CREATE TABLE IF NOT EXISTS`, `DO` blocks
guard column adds). Safe to re-run.

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
docker exec -i og-postgres-local psql -U directus -d directus \
  < migrations/session-41/001-schema.sql
```


Expected: `BEGIN`, `CREATE EXTENSION` (pgcrypto), several `DO`
notices, `CREATE TABLE` × 6, `CREATE INDEX` × N, `COMMIT`.

If you see errors, check:
- `ERROR: relation "child" does not exist` → the dump didn't restore;
  re-run Session 41-LOCAL Step 8 before continuing
- `ERROR: column "..." already exists` → a previous half-apply left
  state. The `DO` blocks should handle this idempotently — investigate
  before re-running blindly.

## 2 — Apply 002-directus-snapshot.yaml

Two paths — pick whichever your Directus version supports cleanly.

### Path A — `directus schema apply` CLI (preferred)

The `migrations/` folder is already mounted read-only into the local
Directus container at `/directus/migrations` (per
`docker-compose.local.yml`):

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
docker exec og-directus-local npx directus schema apply \
  /directus/migrations/session-41/002-directus-snapshot.yaml
```


### Path B — manual via Directus Admin UI

If `schema apply` rejects the file format, do this by hand against
`http://localhost:8055/admin`:

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

Tedious — Path A is preferred even if it requires a test-and-fix loop
on the snapshot format. If it fails locally it will also fail on VPS,
so resolve the format issue here first.

## 3 — Verify schema in Directus

After step 2, open `http://localhost:8055/admin` and **Settings →
Data Model**. You should see the six new collections in the list.
Click each one and verify:
- Field list matches the YAML
- Display template renders correctly in the collection's row list
- The new `assigned_divisions` field exists on `directus_users`

## 4 — Create the system user

Follow `003-system-user-note.md` against the LOCAL Directus admin
(http://localhost:8055/admin). End state for the local dry-run:
- One user with email `system+cron@local.test` (use a `.test` domain
  locally so you don't email-clash with VPS) exists
- A new env var `SYSTEM_USER_ID=<that uuid>` available to the local
  Next.js dev server (add to `.env.local`, NOT `.env.local-stack` —
  the Next.js app reads `.env.local`)
- Restart `npm run dev` to pick up the new env var

## 5 — Verify division data via `bd_division` relation

No backfill required. The dump-restored local `child` already
populates `bd_division`. Sanity-check distribution:

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT bd.name AS division, COUNT(c.id) AS child_count
  FROM child c
  LEFT JOIN bd_division bd ON c.bd_division = bd.id
  GROUP BY bd.name
  ORDER BY child_count DESC;
"
```


### Verify the 4 new child columns (Session 41.5)

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'child'
    AND column_name IN ('support_type', 'monthly_cost', 'guardian_summary_internal', 'last_visit_date')
  ORDER BY column_name;
"
# Expected: 4 rows. monthly_cost is_nullable = NO. Others = YES.

docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT COUNT(*) AS children_without_cost FROM child WHERE monthly_cost IS NULL;
"
# Expected: 0

docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT support_type, COUNT(*) FROM child GROUP BY support_type;
"
# Expected: one row with support_type=NULL containing all 10 (or
# however many you restored).
```


**Post-apply UI impact (informational; same as VPS):** the hardcoded
`"Education support"` / `"From BDT 1,500/month"` strings in
`BrowseChildCard.tsx` and `FeaturedChildren.tsx` become orphaned
once Session 43 ships. **No regression** until then.

## 6 — Restart Directus container

```bash
docker restart og-directus-local
```


Wait ~10 seconds for Directus to reintrospect, then check logs:

```bash
docker logs og-directus-local --tail 50
```


No errors expected. The new collections should appear at the top of
the sidebar in `http://localhost:8055/admin`.

## 7 — Verify cron route

Run the local Next.js dev server in another terminal first
(`npm run dev`), then:

```bash
curl -X POST http://localhost:3000/api/cron/expire-pending-changes \
  -H "Authorization: Bearer $CRON_SECRET"
```


Expected (no expired rows yet):

```json
{ "expired_count": 0, "expired_ids": [], "duration_ms": 35 }
```


You'll need `CRON_SECRET` and `SYSTEM_USER_ID` in `.env.local` for
the dev server to load them. Both must be set or the route refuses
to run.

## 8 — Schedule the cron — N/A for local

Cron scheduling is VPS-only. Skip this step locally; the route is
hit on demand via curl during dry-run testing. The actual scheduled
cadence is configured in the VPS crontab during the production
APPLY (`APPLY.md` step 8).

## 9 — Smoke-test in Directus admin

Create a temporary `data_inputter` test user against
`http://localhost:8055/admin`:

1. Settings → Users → + Create User
2. Role: `data_inputter`
3. `assigned_divisions: ["<UUID-of-Dhaka-bd_division-row>"]`
   (run a SELECT against bd_division first to find the UUIDs)
4. Set a temporary password

Open an incognito browser tab to `http://localhost:8055/admin`,
log in as the test user. Verify (these should all be true per the
permission matrix):

- ✓ Can see `pending_changes` collection but only own rows
- ✓ Can see `tasks` collection but only assigned-to-self rows
- ✓ Can see `moments`, `child_reports`, `aid_deliveries` (read-only)
- ✗ Cannot see `audit_log` collection at all
- ✗ Cannot see `site_page`, `faq` collections
- ✗ Cannot CREATE / UPDATE / DELETE on `child`
- ✗ Cannot CREATE / UPDATE / DELETE on `sponsorship`
- ✓ Can READ child rows where uploaded_by_di_id = self OR
  assigned_di_id = self (won't see any until you manually assign one
  in admin — set an existing child's `assigned_di_id` to the test DI's
  UUID to give them visibility)
- ✓ Field-level READ on `child` excludes guardian contact, GPS,
  exact school, medical records, internal admin notes
- ✓ **bd_division relation traversal renders.** Open any visible
  child record; the division name should pull through via the
  `bd_division.name` whitelist entry. If the relation resolves but
  the name shows as blank/UUID, Directus has applied the field
  whitelist at the scalar level but not the relation sub-fields —
  fix by ensuring both `bd_division` AND `bd_division.name` (and
  `bd_division.code` if used) appear in the fields whitelist in
  002-snapshot.yaml's `child read` permission.

Delete the test user after verification.

## 10 — Done (locally)

Local dry-run complete. Findings to bring to the VPS APPLY:

- Did `schema apply` Path A work cleanly, or did you need Path B?
- Did the `bd_division` relation traversal render correctly?
- Any unexpected errors in the Directus logs after restart?
- Any permission edges that surprised you?

If any surprises: fix them in the artifacts (`001-schema.sql`,
`002-directus-snapshot.yaml`), commit additively to the branch,
and re-run this dry-run from the top.

When clean: proceed to `APPLY.md` for VPS.

---

## Local stack housekeeping

Tear down (data persists in named volumes):

```bash
docker compose --env-file .env.local-stack -f docker-compose.local.yml down
```


Tear down + DESTROY local data (fresh-start the dry-run):

```bash
docker compose --env-file .env.local-stack -f docker-compose.local.yml down -v
```


Re-restore from the original VPS dump (re-run Session 41-LOCAL Step 8)
to start over with clean prod-mirror data.

## Schema reconciliation — locked decision (2026-05-14)

Same as `APPLY.md`. The DI Dashboard spec was written against an
idealised `child` schema. Production reality wins on the division
question — `bd_division` (the existing M2O relation to the
`bd_division` lookup table) is the single source of truth. See
`APPLY.md` for the full informational table.
