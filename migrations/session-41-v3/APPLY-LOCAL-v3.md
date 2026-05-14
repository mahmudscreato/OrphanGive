# Session 41-v3 — APPLY-LOCAL instructions

> **Local dry-run version of the Session 41-v3 apply.** Run this against
> the local Docker stack (`docker-compose.local.yml` from
> `session-41-di-foundation` branch — still on disk and the containers
> are still running) BEFORE touching VPS. Once verification passes
> locally, the planning Claude session will translate this into a VPS
> APPLY guide.

> **Replaces Session 41 (v2).** The v2 branch (`session-41-di-foundation`)
> stays in the repo as historical context but is NOT merged. v3 builds on
> production reality: existing `Data Inputter` + `Admin` policies, existing
> per-collection approval pattern (`child_update`, `child_moment`), and the
> new `child_proposal` collection that mirrors that pattern for child-row
> mutations.

Step-by-step for taking the artifacts in `migrations/session-41-v3/` +
`bootstrap/src/v3-*.ts` and dry-running them against the local mirror.

## Prerequisites

- Local Docker stack running. Confirm via:
  ```bash
  docker ps --filter "name=og-postgres-local" --filter "name=og-directus-local" \
    --format "{{.Names}}: {{.Status}}"
  ```
  Both should report `Up … (healthy)`.
- Production DB already restored into the local Postgres (Session 41-LOCAL
  Step 8). Local row counts should match VPS: 10 children, 73 sponsorships,
  10 directus_users.
- Local Postgres is in **pre-Session-41 state** (the Session 41 v2 columns
  + tables were rolled back via the surgical drop). Confirm:
  ```bash
  docker exec -i og-postgres-local psql -U directus -d directus -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'child' AND column_name IN
      ('uploaded_by_di_id', 'uploaded_by_di', 'monthly_cost');
  "
  ```
  Expected: 0 rows. (If you see rows, run the surgical drop again before
  proceeding.)
- `bootstrap/.env` has:
  ```
  DIRECTUS_URL=http://localhost:8055
  ADMIN_EMAIL=<your VPS admin email — restored into local DB>
  ADMIN_PASSWORD=<your VPS admin password>
  ```
- For the cron route smoke-test only (Step 11):
  `public-site/.env.local` has `CRON_SECRET=<any value>` and
  `SYSTEM_USER_ID=<UUID of a system Directus user>`. See Session 41-v2's
  `003-system-user-note.md` for the system-user setup pattern (still
  applies — same env var name).

## 1 — Backup local Postgres

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
mkdir -p backups
docker exec -i og-postgres-local pg_dump -U directus -Fp \
  --no-owner --no-privileges directus \
  > backups/directus-local-pre-session-41-v3-$(date +%Y%m%d-%H%M%S).sql
ls -la backups/ | tail -3
```

Expected: a fresh `~4 MB` SQL file alongside the prior backup.

## 2 — Apply 001-schema.sql

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
docker exec -i og-postgres-local psql -U directus -d directus \
  < migrations/session-41-v3/001-schema.sql
```

Expected output: `BEGIN`, `CREATE EXTENSION` (pgcrypto, may already
exist → notice), several `DO` blocks, four `CREATE TABLE`s, ~13
`CREATE INDEX`s, `COMMENT`s, `ALTER TABLE … ALTER COLUMN … SET
DEFAULT 'pending'` (child_moment status default tightening), `COMMIT`.

If errors:
- `relation "child" does not exist` → wrong DB; you're not in the
  restored prod mirror
- `column "..." already exists` → `DO` block guards should prevent
  this; investigate before re-running

## 3 — Verify schema

### 3a. Four new tables

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('child_proposal', 'aid_delivery', 'task', 'audit_log')
  ORDER BY table_name;
"
```

Expected: 4 rows.

### 3b. New `child` columns

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'child'
    AND column_name IN
      ('uploaded_by_di', 'assigned_di', 'district_internal',
       'support_type', 'monthly_cost', 'guardian_summary_internal',
       'last_visit_date')
  ORDER BY column_name;
"
```

Expected: 7 rows. **`monthly_cost` is_nullable = YES** (per locked
decision; not NOT NULL like v2).

### 3c. `monthly_cost` backfill

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT COUNT(*) total, COUNT(monthly_cost) with_cost,
         MIN(monthly_cost), MAX(monthly_cost) FROM child;
"
```

Expected: `total=10, with_cost=10, min=1500, max=1500` — but values
*can* be NULL on future rows.

### 3d. `directus_users.assigned_divisions`

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'directus_users' AND column_name = 'assigned_divisions';
"
```

Expected: 1 row, `jsonb`, nullable.

### 3e. `child_moment` extensions

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'child_moment'
    AND column_name IN ('media_type', 'duration_seconds', 'status')
  ORDER BY column_name;
"
```

Expected: `media_type` (text, default `'image'`), `duration_seconds`
(integer, NULL default), `status` (text, default `'pending'` —
tightened from `'published'`).

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT id, media_type, status FROM child_moment ORDER BY date_created;
"
```

Expected: 2 existing rows, both `media_type='image'`, both retain
their original `status='published'` (the DEFAULT change applies only
to new inserts).

## 4 — Register collections + fields in Directus metadata

```bash
cd ~/Desktop/Claude/OrphanGive/bootstrap
npm run v3-register-collections
```

Expected: timestamped phased log output —
- Phase 1: 4 new collections registered (or skipped if re-run)
- Phase 2: ~14 fields per collection registered
- Phase 3: 7 child fields + 1 directus_users field + 2 child_moment
  fields registered

## 5 — Verify collections registered

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT collection, icon, note
  FROM directus_collections
  WHERE collection IN ('child_proposal', 'aid_delivery', 'task', 'audit_log')
  ORDER BY collection;
"
```

Expected: 4 rows. Each with the icon + note from
`v3-register-collections.ts`.

## 6 — Update Data Inputter + Admin policy permissions

```bash
cd ~/Desktop/Claude/OrphanGive/bootstrap
npm run v3-update-permissions
```

Expected:
- Phase 1: Data Inputter — 2 removes (child create + update), then
  ~14 upserts (child read scoped, child_moment workflow,
  child_update workflow, child_proposal CRU, aid_delivery CR, task RU)
- Phase 2: Admin — 10 upserts (child_proposal/aid_delivery/task full
  CRUD, audit_log read-only)

## 7 — Verify permissions

### 7a. Data Inputter no longer has child create/update

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT perm.collection, perm.action
  FROM directus_permissions perm
  JOIN directus_policies p ON perm.policy = p.id
  WHERE p.name = 'Data Inputter'
    AND perm.collection = 'child'
  ORDER BY perm.action;
"
```

Expected: 1 row, `child / read` only. `create` and `update` should be
gone.

### 7b. New permissions present

```bash
docker exec -i og-postgres-local psql -U directus -d directus -c "
  SELECT perm.collection, perm.action,
         CASE WHEN perm.permissions IS NULL THEN 'no filter' ELSE 'has filter' END AS filter,
         CASE WHEN perm.presets    IS NULL THEN 'no presets' ELSE 'has presets' END AS presets
  FROM directus_permissions perm
  JOIN directus_policies p ON perm.policy = p.id
  WHERE p.name = 'Data Inputter'
    AND perm.collection IN ('child_proposal', 'aid_delivery', 'task')
  ORDER BY perm.collection, perm.action;
"
```

Expected: child_proposal create/read/update; aid_delivery create/read;
task read/update. Filters set on read/update where appropriate;
presets set on create rows.

## 8 — Restart Directus

```bash
docker restart og-directus-local
```

Wait ~10s, then:

```bash
docker logs og-directus-local --tail 30
```

Expected: clean startup, no errors. The four new collections appear
in admin sidebar.

## 9 — Browser smoke-test as admin

1. Open `http://localhost:8055/admin` and log in with VPS admin
   credentials (the dump brought them over).
2. Sidebar should show: child_proposal, aid_delivery, task, audit_log
   — plus all the existing collections.
3. Click each new collection. Verify:
   - Field list matches the snapshot (e.g., child_proposal has
     proposal_type, target_child, display_name, …, status,
     created_by, etc.)
   - Display template renders sensibly
4. Open a child record. Confirm new fields appear:
   uploaded_by_di, assigned_di, district_internal, support_type,
   monthly_cost, guardian_summary_internal, last_visit_date.
5. Open a directus_users row. Confirm `assigned_divisions` field.
6. Open child_moment. Confirm `media_type` + `duration_seconds`.

## 10 — Browser smoke-test as Data Inputter

1. Log out as admin.
2. Log in as `data_in@input.com` (existing test user — kept per
   spec). If you don't know the password, reset it via admin panel
   first.
3. Verify:
   - ✓ Sees child_proposal in sidebar; can create a draft proposal.
   - ✓ Sees task in sidebar; reads tasks assigned to self only.
   - ✓ Sees aid_delivery; can create.
   - ✓ Sees child records assigned to them or uploaded by them
     (won't see any unless you set `child.assigned_di` to this DI's
     UUID first via admin).
   - ✗ **Cannot create or update child records directly** — this is
     the v3 contract.
   - ✗ Cannot see audit_log.
   - ✗ Cannot see donor / sponsorship / payment data.

## 11 — Optional: invoke the cron route

In another terminal, start the local Next.js dev server:

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
npm run dev
```

Confirm `.env.local` has both `CRON_SECRET=…` and
`SYSTEM_USER_ID=…`. Then:

```bash
curl -X POST http://localhost:3000/api/cron/expire-stale-proposals \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected (no stale rows yet):

```json
{ "expired_count": 0, "expired_ids": [], "duration_ms": 35 }
```

If you get `{ "error": "SYSTEM_USER_ID not configured" }`, set the
env var + restart `npm run dev`.

## Rollback

To return local Postgres to pre-v3 state:

```bash
# Drop the 4 new tables (CASCADE drops their indexes + constraints)
docker exec -i og-postgres-local psql -U directus -d directus -c "
  DROP TABLE IF EXISTS child_proposal CASCADE;
  DROP TABLE IF EXISTS aid_delivery   CASCADE;
  DROP TABLE IF EXISTS task           CASCADE;
  DROP TABLE IF EXISTS audit_log      CASCADE;
"

# Drop the 7 child columns + assigned_divisions
docker exec -i og-postgres-local psql -U directus -d directus -c "
  ALTER TABLE child
    DROP COLUMN IF EXISTS uploaded_by_di,
    DROP COLUMN IF EXISTS assigned_di,
    DROP COLUMN IF EXISTS district_internal,
    DROP COLUMN IF EXISTS support_type,
    DROP COLUMN IF EXISTS monthly_cost,
    DROP COLUMN IF EXISTS guardian_summary_internal,
    DROP COLUMN IF EXISTS last_visit_date;
  ALTER TABLE directus_users DROP COLUMN IF EXISTS assigned_divisions;
"

# Drop the child_moment extensions (revert default + drop new cols)
docker exec -i og-postgres-local psql -U directus -d directus -c "
  ALTER TABLE child_moment ALTER COLUMN status SET DEFAULT 'published';
  ALTER TABLE child_moment DROP COLUMN IF EXISTS duration_seconds;
  ALTER TABLE child_moment DROP COLUMN IF EXISTS media_type;
"
```

Note: this rollback does NOT undo the permission changes from Step 6.
To undo those, re-run the original `bootstrap/src/policies.ts` workflow
or restore from the backup taken in Step 1:

```bash
# Restore from backup (uses the temp-DB swap pattern; same as Session 41-LOCAL)
docker exec -i og-postgres-local psql -U directus -d postgres -c "DROP DATABASE IF EXISTS directus_temp;"
docker exec -i og-postgres-local psql -U directus -d postgres -c "CREATE DATABASE directus_temp;"
docker exec -i og-postgres-local psql -U directus -d directus_temp \
  < backups/directus-local-pre-session-41-v3-<timestamp>.sql
docker stop og-directus-local
docker exec -i og-postgres-local psql -U directus -d postgres -c "DROP DATABASE directus;"
docker exec -i og-postgres-local psql -U directus -d postgres -c "ALTER DATABASE directus_temp RENAME TO directus;"
docker start og-directus-local
```
