# Migrations

This directory holds schema-change SQL files. The **apply path differs by
collection type** — there are two flavours of table in our stack:

1. **Directus-managed collections** — anything Directus owns and exposes
   in its Admin UI (`directus_users`, plus any custom collection you
   created through the Data Model UI).
2. **Custom application tables** — everything our app writes to
   directly via the Postgres connection (e.g. `og_otp_request`,
   `og_payment`, `stripe_event_processed`).

The SQL files in this directory are the schema source of truth. How
you apply them depends on which flavour the table is.

## Directus-managed collections — primary path: Directus Admin UI

For any change that touches a Directus-owned collection, the canonical
apply mechanism is **the Directus Admin UI**, not psql. Reason: Directus
keeps its own metadata (`directus_fields`, `directus_collections`,
`directus_relations`) describing every column. A bare-DB `ALTER TABLE`
adds a Postgres column but Directus won't know about it — the SDK
won't accept patches against the field, the API won't expose it, and
the Admin UI won't show it.

Steps:

1. Open Directus Admin (`https://admin.orphangive.org`).
2. **Settings → Data Model → \[collection\]**.
3. Click **+ Create Field**.
4. Use the key, type, and nullability specified in the migration `.sql`
   file in this directory as the spec.
5. Save. Directus creates the underlying Postgres column AND registers
   the field in metadata in one step.
6. Hit `POST /utils/cache/clear` (or restart the Directus container) if
   you need other instances to re-introspect immediately.

The `.sql` file in this directory is **kept as schema reference**, not
as the apply mechanism. Files that touch a Directus collection carry a
warning header pointing here.

## Custom tables — primary path: psql

For tables Directus does not manage (look at the file's header — if it
does NOT have the warning, it's a custom table), apply the SQL directly:

```sh
# Prerequisites:
#  • libpq installed locally (brew install libpq && brew link --force libpq)
#  • DATABASE_URL pointing at production Postgres in your shell

psql "$DATABASE_URL" -f migrations/<filename>.sql
```

Custom-table migrations are idempotent (`IF NOT EXISTS`, `ON CONFLICT
DO NOTHING`, etc.) — safe to re-run.

## File naming

`YYYY-MM-DD-<short-description>.sql` — date prefix for chronological
ordering, dash-separated description. Example:

```
2026-05-08-add-og-profile-photo-url.sql
```

## Existing files

| File | Collection | Apply path |
|---|---|---|
| `2026-05-08-add-og-profile-photo-url.sql` | `directus_users` | Directus Admin UI |
