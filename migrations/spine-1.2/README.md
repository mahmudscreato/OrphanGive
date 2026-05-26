# Spine 1.2 — Report lifecycle migration

Adds 6 nullable columns + new status enum values to `child_update`
so a donor-facing report can flow DI submit → admin review →
approved (ready to send). Sending to donor + notification are Spine
1.3 / 1.4 work; this phase ends at status `'approved'`.

## What gets added

| Column | Type | Purpose |
|---|---|---|
| `task` | uuid M2O → task, nullable, ON DELETE SET NULL | Optional link to the field task that produced this report (Spine 1.1). Organic reports without a task have this null. |
| `report_type` | string nullable (`'progress'|'deployment'`) | Stamped at write time from `sponsorship.payment_mode` — monthly → progress, one_time → deployment. |
| `donor_text` | text nullable | Admin-editable donor-facing copy. Initialized at submit time to the DI's `content`. Donor reader reads `COALESCE(donor_text, content)`. |
| `donor_text_edited_at` | timestamp nullable | Set when admin's edit diverges from the DI's content. |
| `donor_text_edited_by` | uuid M2O → directus_users, nullable, ON DELETE SET NULL | Admin who edited. |
| `correction_reason` | text nullable | Admin's body text when sending the report back to the DI. |

New status enum values (column is varchar; values added to the
Directus dropdown metadata):
- `submitted_by_di` — DI's submission lands here (new lifecycle).
- `under_admin_review` — admin claimed the row from the queue.
- `approved` — admin signed off; ready to send (terminal in 1.2).
- `correction_requested` — admin sent back to DI; DI can resubmit.

Existing values are NOT removed. Legacy `pending` continues to work;
new sponsorship-tied DI submissions write `submitted_by_di`.

## Pre-flight

1. Back up Postgres:
   ```
   docker exec og-postgres-local pg_dump -U directus directus \
     > "$(date +%Y-%m-%d)-pre-spine-1.2.sql"
   ```
2. Confirm Phase 0 has run — `migrations/phase-0/001` adds
   `child_update.sponsorship`, which this phase REQUIRES.
3. Source env:
   ```
   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" \
     .env.local | xargs)
   ```

## Run

```
node migrations/spine-1.2/001-extend-child-update.mjs
```

Or via throwaway container:
```
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/migrations/spine-1.2":/m \
  node:22-alpine \
  node /m/001-extend-child-update.mjs
```

Idempotent: re-run is safe (each column + relation probes for
existence before creating).

## Verification (after running)

```bash
# All 6 new columns + 2 new FKs.
docker exec og-postgres-local psql -U directus -d directus -c "
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'child_update'
  AND column_name IN ('task','report_type','donor_text',
                      'donor_text_edited_at','donor_text_edited_by',
                      'correction_reason')
ORDER BY column_name;

SELECT conname FROM pg_constraint
WHERE conrelid::regclass::text = 'child_update' AND contype = 'f'
ORDER BY conname;
"
```

Expected: 6 columns present + the FK list includes
`child_update_task_foreign` and
`child_update_donor_text_edited_by_foreign`.

## Rollback

Forward-compatible. To remove (rarely needed):
```sql
DELETE FROM directus_relations
WHERE many_collection = 'child_update'
  AND many_field IN ('task','donor_text_edited_by');
ALTER TABLE child_update
  DROP CONSTRAINT child_update_task_foreign,
  DROP CONSTRAINT child_update_donor_text_edited_by_foreign;
ALTER TABLE child_update
  DROP COLUMN task,
  DROP COLUMN report_type,
  DROP COLUMN donor_text,
  DROP COLUMN donor_text_edited_at,
  DROP COLUMN donor_text_edited_by,
  DROP COLUMN correction_reason;
```

In practice: leave columns in place — they're additive and the
non-null defaults are gentle (NULL means "donor sees DI's content").

## Production note

Same script + pre-flight applies on the VPS once this branch merges.
No orphan-row probes needed (the FK columns ship empty).
