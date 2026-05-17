# Session 48b apply order

For local + production. Same hybrid pattern as Sessions 47 + 48a.

## 1. Schema migration (Postgres-side)

```bash
docker exec -i og-postgres-local psql -U directus -d directus < migrations/session-48b/001-intake-photos.sql
```

Creates `child_intake_photo` table with FKs to `child` (CASCADE),
`child_proposal` (SET NULL), `directus_files` (RESTRICT), and
`directus_users` for `uploaded_by` / `reviewed_by`. Adds 4 indexes
covering the per-child list path, status review queue, per-uploader
filter, and per-proposal lookup.

Idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).

## 2. Directus metadata (REST PATCHes)

```bash
bash migrations/session-48b/002-register-fields.sh
```

Registers the new collection, attaches field interfaces (file-image
picker for `photo`, dropdown for `status`, etc.), and grants the
Data Inputter policy:

- READ where `uploaded_by = $CURRENT_USER` (DI sees only own
  uploads via the admin UI)
- CREATE on all fields
- UPDATE only `caption` + `display_order` on own pending rows
- DELETE only own pending rows (cannot delete after admin review)

Reads `NEXT_PUBLIC_DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` from
the environment.

## 3. Verify

```bash
# Schema
docker exec og-postgres-local psql -U directus -d directus -c "\d child_intake_photo"

# DI permissions
curl -sS -g "$NEXT_PUBLIC_DIRECTUS_URL/permissions?filter%5Bcollection%5D%5B_eq%5D=child_intake_photo&filter%5Bpolicy%5D%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=action,fields,permissions" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" | python3 -m json.tool
```

## Why we don't extend the bootstrap script

Same rationale as Sessions 47 + 48a. The bootstrap script remains
the source of truth for fresh-environment setup; per-session field
additions go via REST PATCHes from now on.
