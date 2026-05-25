# Session-58 cleanup migrations

Schema-additions-only fixes for the missing Postgres FK constraint(s)
session-58 created columns-only.

## Background

Session-58's migration scripts created fields via `POST /fields/<coll>`
with `schema.foreign_key_table` declared in the body. Directus REST
accepts that nested field and creates the uuid column — but it does
NOT create a Postgres FK constraint. The actual FK requires a
separate `POST /relations` call. Phase 0 hit and fixed this for the
new task / child_update FKs; this directory retroactively fixes the
session-58 columns that suffer the same bug.

## Audited findings (run before authoring 001)

Of every field session-58 declared with `foreign_key_table`, exactly
ONE column is affected:

| Column                         | Column exists? | FK constraint? | Orphan rows |
|---|---|---|---|
| `sponsorship.donation_package` | YES (uuid)     | **MISSING**    | 0 (of 27 non-null) |

No other session-58 field declares a FK target. 001 + 003 added only
scalar fields (string/integer/boolean/text/json/decimal/timestamp).

## Scripts

| # | Script | What it does |
|---|--------|--------------|
| 001 | `001-add-donation-package-fk.mjs` | Adds the Postgres FK constraint for `sponsorship.donation_package → donation_package(id)` via `POST /relations`. ON DELETE SET NULL (matches the existing `sponsorship.child` + `sponsorship.donor` choice; preserves payment + donor data if a package row is ever hard-deleted). Idempotent: probes `GET /relations/sponsorship/donation_package` and skips when the relation is already wired. Safe to re-run. |

## Pre-flight

1. Back up Postgres before running:
   ```
   docker exec og-postgres-local pg_dump -U directus directus \
     > "$(date +%Y-%m-%d)-pre-session58-fk-cleanup.sql"
   ```
2. Confirm zero orphan rows (verify against fresh data on the target
   DB — done already on local at audit time):
   ```
   docker exec og-postgres-local psql -U directus -d directus -c "
     SELECT COUNT(*) AS orphans
     FROM sponsorship s
     WHERE s.donation_package IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM donation_package dp WHERE dp.id = s.donation_package
       );
   "
   ```
   Result must be `0`. If non-zero, **STOP** — the script will hard-fail
   the constraint creation. Decide manually whether to clear the
   orphan refs to NULL or to restore the missing package rows.
3. Source environment:
   ```
   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" \
     .env.local | xargs)
   ```

## Running (host has node)

```
node migrations/cleanup-session58/001-add-donation-package-fk.mjs
```

## Running (host has no node — throwaway container)

```
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/migrations/cleanup-session58":/m \
  node:22-alpine \
  node /m/001-add-donation-package-fk.mjs
```

## Verification (after running 001)

```
docker exec og-postgres-local psql -U directus -d directus -c "
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid::regclass::text = 'sponsorship'
    AND contype = 'f'
    AND conname LIKE '%donation_package%';
"
```

Expected:
```
sponsorship_donation_package_foreign | FOREIGN KEY (donation_package)
                                       REFERENCES donation_package(id)
                                       ON DELETE SET NULL
```

## Rollback

Idempotent FK addition. To remove (rarely needed):
```
DELETE FROM directus_relations
WHERE many_collection = 'sponsorship' AND many_field = 'donation_package';
ALTER TABLE sponsorship DROP CONSTRAINT sponsorship_donation_package_foreign;
```

In practice we leave the constraint in place — it's forward-compatible
and consistent with how the column was always intended to behave.

## Production note

This same migration must be run against the production Directus once
this branch merges. Production must have **zero orphan rows** before
the FK can be added; run the orphan-row probe in step 2 above against
prod first. If non-zero, halt and triage.
