# Task system — piece #2 migration (task types)

Adds the `type` column to `task` so tasks can be categorised and
quick-created from templates. See `src/lib/task-templates.ts` for the
template definitions that map each type to default title/description/priority.

## What it adds

| Column | Type | Purpose |
|---|---|---|
| `type` | varchar(32), nullable, default `general` | enum: `need_report` \| `delivery_photos` \| `need_moments` \| `health_check` \| `general` \| `custom` |

## What it does NOT touch

- `task.di_status` / `task.admin_status` (the two-axis state machine). Untouched.
- `task.priority`, `task.child`, `task.sponsorship`, `task.assignee`, the verify fields — all untouched.
- No other collection.

## Idempotency

Re-runnable. The field POST is guarded by a `GET /fields/task/type` probe; an existing field is skipped.

## Existing rows stay valid (no breakage)

The column is **nullable** with a default of `general`. Postgres backfills
existing rows to `general` when a non-null default is given on `ADD COLUMN`
(fast metadata-only op on PG 11+). Even if a stack leaves existing rows
`NULL`, the **app coerces null/unknown → `general`** at read time
(`admin-tasks.ts` `rowToAdminTaskRow`, mirroring how it already coerces
`di_status`/`admin_status`). So a pre-existing typeless task reads as
"General" either way — nothing breaks.

## Run

```
# Local (with .env.local present in repo root):
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/task-types-1/001-add-task-type-field.mjs

# Production (via docker since the host has no node):
cd /opt/orphangive
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/app/migrations/task-types-1":/m \
  node:22-alpine \
  node /m/001-add-task-type-field.mjs
```

## Verify (post-run)

```sql
\d task
-- Expect a new column: type (varchar, nullable, default 'general').

SELECT type, COUNT(*) FROM task GROUP BY type;
-- Pre-existing rows read as 'general' (backfilled by the default, or
-- coerced by the app if left NULL). New app-created tasks carry the
-- type the admin picked.
```

## Rollback

```sql
ALTER TABLE task DROP COLUMN type;
```

Then delete the corresponding `directus_fields` row so the Directus admin UI stops referencing it:

```sql
DELETE FROM directus_fields WHERE collection='task' AND field='type';
```

(Or use the Directus REST API `DELETE /fields/task/type`.)
