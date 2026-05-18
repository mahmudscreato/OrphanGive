# Deploy 2026-05-17 — APPLY procedure

Consolidated migration covering every schema change from Session 41-v3 through Session 52e. Brings any Directus install (localhost OR VPS) to the canonical state expected by the post-52e codebase.

**Scope:** purely additive. No data manipulation, no DROP statements, no NOT NULL on existing tables. Production rows survive untouched.

---

## What this migration does

| Step | Artifact | Purpose |
|------|----------|---------|
| 1 | `001-schema.sql` | Postgres DDL: ADD COLUMN / CREATE TABLE / CREATE INDEX for every change since Session 41-v3 baseline |
| 2 | (restart Directus) | Force schema re-introspection so the metadata layer sees the new columns / tables |
| 3 | `002-directus-register.sh` | Directus metadata: register 6 collections, all field interfaces / choices / specials, M2O relations, DI + Admin permissions, the `intake-locked` storage preset |
| 4 | `003-cleanup-checks.sh` | Verify every expected column, index, collection, permission, preset is in place + that the keyed asset URL serves a smaller variant |

All three scripts are **idempotent** — safe to re-run if a step partially fails.

---

## Prerequisites

- `psql` access to the Postgres database (via Docker or direct)
- Admin token in `DIRECTUS_SERVER_TOKEN`
- Directus URL in `NEXT_PUBLIC_DIRECTUS_URL`
- `python3` (used by Python heredocs in the registration script)

---

## Localhost: apply + verify

```bash
# 0. Take a safety backup (Docker container name `og-postgres-local`)
mkdir -p backups
docker exec og-postgres-local pg_dump -U directus -d directus \
  | gzip > "backups/PRE_DEPLOY_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

# 1. Apply schema
docker exec -i og-postgres-local psql -U directus -d directus \
  < migrations/deploy-2026-05-17/001-schema.sql

# 2. Restart Directus so it re-introspects
docker restart og-directus-local
until curl -sf -o /dev/null "$NEXT_PUBLIC_DIRECTUS_URL/server/health"; do sleep 2; done

# 3. Apply Directus registrations (loads env from .env.local)
set -a; source .env.local; set +a
bash migrations/deploy-2026-05-17/002-directus-register.sh

# 4. Verify
bash migrations/deploy-2026-05-17/003-cleanup-checks.sh
# Expected: "Summary: PASS=112 FAIL=0" and EXIT=0
```

---

## VPS: apply + verify

**Pre-condition:** localhost has been migrated successfully and a smoke test has been performed (DI submits → admin approves → donor surface renders all expected sections).

### VPS step-by-step

```bash
# 0. SSH in and `cd` to the deploy directory
ssh root@orphangive.org
cd /opt/orphangive   # or wherever the docker-compose lives

# 1. Take a fresh backup (CRITICAL — production has 10 children +
#    73 sponsorships + 10 users; this must survive)
mkdir -p backups
docker exec og-database pg_dump -U directus -d directus \
  | gzip > "backups/PRE_DEPLOY_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
ls -lh backups/PRE_DEPLOY_*.gz | tail -1   # confirm size > 1MB

# 2. Pull the migration files (either git pull, or scp from local)
#    Option A — git pull on a release branch that includes this dir:
git fetch origin && git checkout origin/<release-branch>
#    Option B — scp from your local checkout:
#    (run from local) scp -r migrations/deploy-2026-05-17 \
#      root@orphangive.org:/opt/orphangive/migrations/

# 3. Apply schema. The container name differs from localhost —
#    confirm with `docker ps` and adjust if needed.
docker exec -i og-database psql -U directus -d directus \
  < migrations/deploy-2026-05-17/001-schema.sql

# 4. Restart Directus (whatever compose service name applies)
docker compose restart directus
until curl -sf -o /dev/null "$NEXT_PUBLIC_DIRECTUS_URL/server/health"; do sleep 2; done
sleep 5    # give the schema cache time to warm

# 5. Set env + apply Directus registrations
export NEXT_PUBLIC_DIRECTUS_URL="https://admin.orphangive.org"
export DIRECTUS_SERVER_TOKEN="<paste from VPS env>"
bash migrations/deploy-2026-05-17/002-directus-register.sh

# 6. Verify (point the checks script at the VPS Postgres container)
export DOCKER_PG_CONTAINER="og-database"
bash migrations/deploy-2026-05-17/003-cleanup-checks.sh

# Expected: "Summary: PASS=112 FAIL=0" and exit 0.
# If any FAIL: do not deploy app code. Restore from the
# pre-deploy backup (see Rollback below) and investigate.
```

### Smoke test after migration (before flipping the app over)

Manually verify the platform behaves as expected with the new schema:

1. **Admin login** — log into Directus admin UI. Confirm:
   - `child_intake_photo`, `child_proposal`, `aid_delivery`, `task`, `audit_log`, `school` all appear in the data model sidebar with their icons.
   - Opening any child row shows the Session 48a fields (parent_loss dropdown, guardian_phone, etc.) in the form.
   - Opening any document row shows `document_type` dropdown with the Session 52d split (father_death_certificate, mother_death_certificate, etc.).

2. **DI flow** — log in as a Data Inputter:
   - Visit `/di/children/new`, save a draft. Confirm the draft row appears in `child_proposal` with a `target_child` stub.
   - Upload a PDF on a document row. Confirm it lands in `child_document` with `document_type` populated.
   - Upload an intake photo. Confirm it lands in `child_intake_photo`.
   - Submit the proposal. Confirm `status='pending'`.

3. **Admin approval** — back in admin:
   - Visit `/admin/reviews/documents`. List should render (not blank).
   - Approve a pending document. Confirm `notification` row written for the DI.

4. **Donor surface** — log out, visit any approved child profile:
   - Intake photo gallery renders. Non-sponsor view shows the locked thumbnails with `?key=intake-locked` URLs returning ~1.6KB blurred JPEGs (verify in Network tab).
   - Documents banner shows the verified-count badge.

---

## CRITICAL: DI user setup — `assigned_divisions` must use the canonical codes

When creating or editing a Data Inputter user, their `assigned_divisions` JSONB field MUST contain codes that exist in the `bd_division.code` column. Production uses lowercase, geographic names — **not letter codes**.

The canonical eight codes are:

```
barisal, chittagong, dhaka, khulna, mymensingh, rajshahi, rangpur, sylhet
```

A DI whose `assigned_divisions` contains codes that don't match anything in `bd_division.code` (e.g. legacy letter codes like `BD-A`, `BD-B`, …) will silently fail every submit operation with a 403 `division not allowed` error from `isDivisionAllowedForUser` in `src/lib/di-proposals.ts`. The UI surfaces this as a generic submit failure with no helpful diagnostic.

Verify codes match by running both queries and eyeballing the overlap:

```bash
# Canonical codes (the source of truth)
docker exec og-database psql -U directus -d directus -c \
  "SELECT code FROM bd_division ORDER BY code;"

# Per-DI assigned codes
docker exec og-database psql -U directus -d directus -c \
  "SELECT email, assigned_divisions FROM directus_users
   WHERE role IN (SELECT id FROM directus_roles WHERE name = 'Data Inputter');"
```

If any DI has wrong codes, fix via the Directus admin UI (Settings → Data Model → Directus Users → edit the user → assigned_divisions) by pasting an array of correct codes, e.g. `["dhaka", "chittagong"]`. The form layer in `/di/children/new` does NOT lock the dropdown to assigned divisions (so the DI sees all 8), but the server-side `createCreateProposal` does enforce the check — a mismatch silently 403s every submit until corrected.

If you're scripting user creation in the future, pull the codes dynamically rather than hard-coding to avoid drift:

```bash
docker exec og-database psql -U directus -d directus -tA -c \
  "SELECT json_agg(code) FROM bd_division;"
```

---

## Rollback

If anything goes wrong on VPS, restore from the pre-deploy backup:

```bash
# 1. Stop Directus to release DB connections
docker compose stop directus

# 2. Restore (this WIPES the current DB and reloads from backup)
gunzip -c backups/PRE_DEPLOY_<timestamp>.sql.gz \
  | docker exec -i og-database psql -U directus -d directus

# 3. Restart Directus
docker compose start directus
until curl -sf -o /dev/null "$NEXT_PUBLIC_DIRECTUS_URL/server/health"; do sleep 2; done
```

This restores both the schema AND the data. The migration is purely additive so the only risk is partial Directus metadata changes (e.g., a dropdown choice update) — those can be reverted manually via the admin UI if rolling back the DB seems excessive.

---

## What this migration does NOT do (intentional)

- **No data backfill.** The Session 49 brief introduced `document_type` (canonical) alongside the legacy `type` column on `child_document`. Existing rows may have only `type` populated and `document_type` NULL. The application's `document-normalize.ts` handles both shapes on read; new writes always set `document_type`. A future session may backfill `document_type` from `type` for legacy rows, but that's out of scope here.

- **No DROP of legacy columns.** `child_document.type` stays alongside `document_type`. Same for `review_notes` / `notes`, `waiver_justification` / `rejection_reason`. Drop is a future cleanup once we're sure nothing reads the legacy columns.

- **No CHECK constraints on `child_moment.media_type` / `duration_seconds`.** On localhost these exist (added via Directus's createField API during the 41-v3 bootstrap). Adding them via SQL would fail if any existing row has `media_type IS NULL`. Application-layer enforcement is sufficient.

- **No role / user creation.** Production already has the 5 roles (Admin, Data Inputter, Legal Guardian, Donor, Org Donor) seeded by the original bootstrap. The script looks up policy IDs by name; if either "Data Inputter" or "Admin" isn't found, the script aborts with a clear error.

- **No seed data.** Donation buckets, addons, FAQs, site_content are assumed to be in place from earlier bootstrap runs. If they're missing, run `npm run bootstrap` from the `bootstrap/` directory separately.

---

## Failure modes and recovery

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `001-schema.sql` errors with `relation does not exist` | A precondition table is missing (rare — would mean even the Directus bootstrap hasn't run) | Run `npm run bootstrap` first |
| `002-directus-register.sh` shows `WARN (column not in cache)` | Directus didn't restart, or didn't pick up the new columns | `docker restart <directus>` and re-run the script |
| `003-cleanup-checks.sh` reports `permission MISSING` | The DI / Admin policy lookup failed | Check policy names in Directus admin → Access Control → Policies |
| `003` reports `preset NOT serving smaller variant` | Storage preset registration didn't land OR the test photo is too small for the resize | Investigate via curl: `curl -sI "$URL/assets/<uuid>?key=intake-locked" -H "Authorization: Bearer $TOKEN"` |
| App routes return 500 after migration | Directus permission cache stale | Run `curl -X POST "$URL/utils/cache/clear" -H "Authorization: Bearer $TOKEN"` |

---

## Estimated time

Based on localhost runs (PG 15, Directus 11.17.4, ~150 rows total):

- `001-schema.sql`: < 2 seconds (no row scans; all ADD COLUMN / CREATE INDEX is metadata-only because the columns are nullable and small)
- Directus restart: 15–30 seconds
- `002-directus-register.sh`: ~ 60 seconds (lots of REST calls)
- `003-cleanup-checks.sh`: ~ 15 seconds

Total VPS apply: **2–3 minutes** of database + Directus activity. The app is unaffected during the SQL (additive columns don't lock anything) but should be flipped to maintenance during the Directus restart so users don't hit the brief unavailability window.
