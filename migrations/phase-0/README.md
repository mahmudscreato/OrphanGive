# Phase 0 — Foundation migrations

Schema-additions-only migrations for the Admin OS Phase 0 foundation
work. Three pieces ship in `feature/phase-0-foundation`:

- **A. FK links** — these migration scripts (this directory).
- **B. Super Admin gate** — code-only (no migration). Requires a
  `"Super Admin"` Directus role; see ship report for creation steps.
- **C. Audit-write holes** — code-only (no migration).

## Scripts (run in order)

| # | Script | What it does |
|---|--------|--------------|
| 001 | `001-add-sponsorship-fks.mjs` | Adds two NEW NULLABLE columns: `task.sponsorship` (uuid, M2O sponsorship), `child_update.sponsorship` (uuid, M2O sponsorship). Mirrors the existing `aid_delivery.sponsorship` shape (Session 41-v3). Idempotent: re-runnable; skips fields that already exist. No backfill — existing rows stay NULL on the new column. |

Re-running any script is safe.

## Pre-flight

1. **Back up Postgres before running** (local + production). For local:
   ```
   docker exec og-postgres-local pg_dump -U directus directus \
     > "$(date +%Y-%m-%d)-pre-phase-0.sql"
   ```
2. Confirm Directus health:
   ```
   curl -sf $NEXT_PUBLIC_DIRECTUS_URL/server/ping
   ```
3. Source environment (`.env.local` for local, `.env.production` for VPS):
   ```
   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" \
     .env.local | xargs)
   ```

## Running (host has node)

```
node migrations/phase-0/001-add-sponsorship-fks.mjs
```

## Running (host has no node — use a throwaway container)

The Phase 0 production host (per existing convention) does not have
node installed. Run via the same `node:22-alpine` image used elsewhere
in the codebase, with `--network host` so the container can reach the
local Directus at `localhost:8055`:

```
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/migrations/phase-0":/m \
  node:22-alpine \
  node /m/001-add-sponsorship-fks.mjs
```

## Verification (after running 001)

```
# Both should HTTP 200 with `is_nullable: true` and
# `foreign_key_table: "sponsorship"`.
curl -s -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  "$NEXT_PUBLIC_DIRECTUS_URL/fields/task/sponsorship" | jq .data.schema
curl -s -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  "$NEXT_PUBLIC_DIRECTUS_URL/fields/child_update/sponsorship" | jq .data.schema

# Existing FK MUST be untouched (sanity check).
curl -s -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  "$NEXT_PUBLIC_DIRECTUS_URL/fields/aid_delivery/sponsorship" | jq .data.schema
```

## Rollback

The migration adds new nullable columns only. Rollback is a Directus
admin operation (delete the field via the Directus UI or `DELETE
/fields/<coll>/<field>`). No data lost since the columns ship empty.

In practice we leave the columns in place — they are forward-
compatible. To revert the **code** side of Phase 0, git-revert the
relevant commit; the database columns remain harmless.

## Deferred (NOT in 001)

- **Webhook auditing for Piece C** requires either a seeded "system"
  user UUID for `audit_log.actor` (M2O directus_users, NOT NULL today)
  or a schema relaxation to make `actor` nullable. Out of scope for
  Phase 0 ("schema additions only, no alter"). Documented in the
  Phase 0 ship report.
