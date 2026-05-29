# P4 — partnership_inquiry collection

## What

A new Directus collection backing the partnership reach-out form on
`/for-charities`. Adult partner-org contacts only — not donor or
child data.

## Schema

See header of `001-create-partnership-inquiry.mjs` for the full
column list. Highlights:

- `organisation_name`, `contact_name`, `role`, `email` — required at
  the API layer (zod). Nullable in DB so the migration is forgiving
  on apply order.
- `inquiry_type` — enum `offer_help | need_help | partner | other`.
- `message` — text, max 2000 chars at API.
- `source` — origin page slug (e.g. `for-charities`).
- `status` — workflow enum `new | reviewed | contacted | closed`.
  Defaults to `new` on insert.
- `reviewed_by` — FK to `directus_users` (admin who last touched
  status). `ON DELETE SET NULL`.
- `created_at` / `reviewed_at` — timestamps.
- `admin_notes` — free-form admin-only notes.

## Apply

```
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/p4-partnership-inquiry/001-create-partnership-inquiry.mjs
```

Idempotent. Skips the collection + fields that already exist.

## Rollback

```
curl -X DELETE -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  $NEXT_PUBLIC_DIRECTUS_URL/collections/partnership_inquiry
```

This drops the collection AND every row. Pair with `git revert <commit>`
to undo the API + form + admin page.

## After applying

The form lives at the end of `/for-charities`. Submissions land in
`partnership_inquiry` and surface at `/admin/partnerships` (admin-only).
