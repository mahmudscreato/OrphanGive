# Donation Lifecycle — sub-phase 1 migration

Adds the fulfillment exception columns to `sponsorship`. See
`docs/admin-os/04-donation-lifecycle-design.md` for full design rationale.

## What it adds

| Column | Type | Purpose |
|---|---|---|
| `fulfillment_exception` | varchar(32), nullable | enum: `on_hold` \| `disputed` \| `refund_requested` \| `refunded` \| null |
| `fulfillment_exception_at` | timestamptz, nullable | when the exception was set |
| `fulfillment_reason` | text, nullable | PRIVATE — admin's full reason. Never reaches donor surface |
| `fulfillment_donor_visible_reason` | text, nullable | curated donor-facing copy |

## What it does NOT touch

- `sponsorship.status` (payment lifecycle — Stripe-owned). Untouched on purpose.
- Any spine table (`task`, `child_update`, `aid_delivery`). Their lifecycles are read-only inputs to the resolver.

## Idempotency

Re-runnable. Each field's POST is guarded by a `GET /fields/<coll>/<field>` probe; existing fields are skipped.

## No backfill

All four columns default null on every existing sponsorship row. Resolver treats null as "no exception" (happy path derives from spine).

## Run

```
# Local (with .env.local present in repo root):
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/donation-lifecycle-1/001-add-fulfillment-exception-fields.mjs

# Production (via docker since the host has no node):
cd /opt/orphangive
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/app/migrations/donation-lifecycle-1":/m \
  node:22-alpine \
  node /m/001-add-fulfillment-exception-fields.mjs
```

## Verify (post-run)

```sql
\d sponsorship
-- Expect four new columns: fulfillment_exception (varchar),
-- fulfillment_exception_at (timestamptz), fulfillment_reason (text),
-- fulfillment_donor_visible_reason (text). All nullable.

SELECT COUNT(*) FROM sponsorship WHERE fulfillment_exception IS NOT NULL;
-- Expect 0 (no backfill; nothing should be set yet).
```

## Rollback

```sql
ALTER TABLE sponsorship
  DROP COLUMN fulfillment_exception,
  DROP COLUMN fulfillment_exception_at,
  DROP COLUMN fulfillment_reason,
  DROP COLUMN fulfillment_donor_visible_reason;
```

Then delete the corresponding `directus_fields` rows so the Directus admin UI stops referencing them:

```sql
DELETE FROM directus_fields
WHERE collection='sponsorship'
  AND field IN (
    'fulfillment_exception',
    'fulfillment_exception_at',
    'fulfillment_reason',
    'fulfillment_donor_visible_reason'
  );
```

(Or use the Directus REST API `DELETE /fields/sponsorship/<field>` for each.)
