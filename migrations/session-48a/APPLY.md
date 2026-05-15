# Session 48a apply order

For local + production. Run in order. Both phases are idempotent.

## 1. Schema migration (Postgres-side)

```bash
docker exec -i og-postgres-local psql -U directus -d directus < migrations/session-48a/001-form-expansion.sql
```

Adds 13 columns to `child` and `child_proposal`, migrates
`areas_of_interest` from `text` to `text[]`, creates the new
`school` collection with FKs from both tables.

Re-runnable (uses `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
EXISTS`, and conditional DO blocks for the FK constraints + array
type migration).

## 2. Directus metadata registration (REST PATCHes)

```bash
bash migrations/session-48a/002-register-fields.sh
```

The script PATCHes Directus's `directus_fields` and
`directus_collections` rows to attach the right interfaces (dropdowns,
M2O templates, conditionals on `priority_notes`) and grants the Data
Inputter policy `read + create` on the new `school` collection.

Reads `NEXT_PUBLIC_DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` from the
environment — same vars the app uses, so running this from the
`public-site/` directory after sourcing `.env.local` works locally.

For production, set those two env vars to the prod values and run.

## Rationale: why not extend the bootstrap script

`bootstrap/src/v3-register-collections.ts` predates Sessions 46-fix-2
and Session 47 and has had repeated registration drift. The brief
asked for a bootstrap-script extension, but Session 47's notification
field registration also went the REST-PATCH route for the same
reason (documented in that ship report). Keeping the same path here
for consistency. The bootstrap script itself remains untouched in
this session.

If you want to consolidate registration into the bootstrap script
later, it's purely additive work — the SQL migration is the source
of truth for column existence, the REST script is the source of
truth for UI metadata + permissions.

## 3. Verify

```bash
# Verify columns
docker exec og-postgres-local psql -U directus -d directus -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='child' AND column_name IN ('permanent_address','educational_organization','school_name_raw','priority_support','priority_notes','parent_loss','guardian_phone','guardian_phone_alt','submission_date','guardian_employment_type','areas_of_interest') ORDER BY column_name;"

# Verify school table
docker exec og-postgres-local psql -U directus -d directus -c "\d school"

# Verify DI permissions on school
curl -sS -g "$NEXT_PUBLIC_DIRECTUS_URL/permissions?filter%5Bcollection%5D%5B_eq%5D=school&filter%5Bpolicy%5D%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=action,fields,permissions" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" | python3 -m json.tool
```
