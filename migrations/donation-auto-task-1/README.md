# Task system — piece #3 migration (donation auto-tasks)

Schema for the donation → auto fulfilment-task trigger
(`src/lib/donation-task.ts`, wired into the Stripe webhook). The app
code is **inert until this migration runs** — it probes the `task`
columns and no-ops if they're absent, so deploying the code before the
migration is safe (payments are never affected).

## What it changes

| Change | Detail |
|---|---|
| **ADD** `task.source_payment_id` | varchar(64), **nullable**, **UNIQUE**. The idempotency dedupe key — stores the payment ROW id the task was auto-created from. |
| **RELAX** `task.assignee` | `NOT NULL` → **nullable**. Lets a system auto-task be left UNASSIGNED when no responsible DI is found. FK to `directus_users` preserved. |

### Why `source_payment_id` is the idempotency guarantee

The trigger keys "exactly one task per payment" on the **payment row id**
(not the Stripe id — a one-time bundle shares one PaymentIntent across N
sponsorships but produces N payment rows → N tasks, one per child). The
**UNIQUE** constraint is the DB-level backstop: even a concurrent
webhook double-fire that slips past the upstream guards
(`isStripeEventProcessed` + the `created` flag from
`createPaymentIfMissing`) cannot insert a second task — the second
insert violates UNIQUE and is swallowed best-effort. `NULL` is allowed
for admin-created tasks (Postgres treats NULLs as distinct under UNIQUE).

### Why `assignee` becomes nullable

Auto-tasks are assigned to `child.assigned_di` (the responsible DI). When
that's unset, or the donation has no child, the task is left UNASSIGNED
for an admin to pick up — which requires the column to allow NULL.
Admin-created tasks still always set an assignee (the create API
requires it); this only enables the system fallback.

## What it does NOT touch

- `task.di_status` / `task.admin_status` / `task.priority` / `task.type` / the verify fields — untouched.
- No other collection. No backfill — existing rows keep `source_payment_id = NULL` and their current assignee.

## Idempotency

Re-runnable. The field add is guarded by a `GET /fields/task/source_payment_id` probe; the assignee relax reads the current `is_nullable` and skips if already nullable.

## Run

```
# Local (with .env.local present in repo root):
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/donation-auto-task-1/001-add-source-payment-and-nullable-assignee.mjs

# Production (via docker since the host has no node):
cd /opt/orphangive
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/app/migrations/donation-auto-task-1":/m \
  node:22-alpine \
  node /m/001-add-source-payment-and-nullable-assignee.mjs
```

## Verify (post-run)

```sql
\d task
-- Expect: source_payment_id varchar UNIQUE, nullable.
--         assignee now nullable (NOT NULL dropped).

SELECT COUNT(*) FROM task WHERE source_payment_id IS NOT NULL;
-- 0 before any donation auto-task fires.
```

A live end-to-end check: make a Stripe **test-mode** donation and
confirm exactly one task appears with a `delivery_photos` type and a
`source_payment_id`; re-deliver the webhook event from the Stripe
dashboard and confirm NO second task is created.

## Rollback

```sql
ALTER TABLE task DROP COLUMN source_payment_id;
ALTER TABLE task ALTER COLUMN assignee SET NOT NULL; -- only if no NULL rows exist
```

Then remove the `directus_fields` row for the dropped column:

```sql
DELETE FROM directus_fields WHERE collection='task' AND field='source_payment_id';
```

(Restoring `assignee` NOT NULL requires that no unassigned system tasks exist yet.)
