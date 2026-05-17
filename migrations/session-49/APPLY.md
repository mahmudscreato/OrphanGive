# Session 49 apply order

For local + production. Same hybrid pattern as Sessions 47 + 48a + 48b.

## 1. Schema migration (Postgres-side)

```bash
docker exec -i og-postgres-local psql -U directus -d directus < migrations/session-49/001-documents.sql
```

Adds the brief-spec columns to `child_document` (or creates the table
fresh if it doesn't exist yet — bootstrap-defined installs have it).
New columns:

- `proposal` (uuid, FK to child_proposal, ON DELETE SET NULL)
- `document_type` (varchar 32) — new canonical column distinct from
  the legacy `type` column
- `notes` (text) — replaces legacy `review_notes` for new writes
- `reviewed_at` (timestamptz)
- `rejection_reason` (text) — replaces legacy `waiver_justification`
- `date_created` (timestamptz, default now()) — defensive add

Plus the unique partial index `uniq_document_child_type_approved` —
"one approved document of each type per child".

Idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT
EXISTS, CREATE INDEX IF NOT EXISTS).

**Important:** the migration is intentionally additive — it does NOT
modify or drop the legacy `type` / legacy-status / `review_notes` /
`waiver_justification` columns. The donor-side `DocumentsBanner`
component still reads the legacy columns (status='verified'). Session
50 is the right place to consolidate; the audit doc proposes the
reconciliation plan.

## 2. Directus metadata (REST PATCHes)

```bash
bash migrations/session-49/002-register-fields.sh
```

PATCHes the Directus `directus_fields` rows for the new columns
(dropdown + interfaces) and re-registers DI policy permissions:

- READ where `uploaded_by = $CURRENT_USER`
- CREATE on all fields
- UPDATE only `notes` on own pending rows
- DELETE only own pending rows

Reads `NEXT_PUBLIC_DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` from the
environment.

## 3. Verify

```bash
# Schema (look for the new columns + the unique partial index)
docker exec og-postgres-local psql -U directus -d directus -c "\d child_document"

# DI permissions
curl -sS -g "$NEXT_PUBLIC_DIRECTUS_URL/permissions?filter%5Bcollection%5D%5B_eq%5D=child_document&filter%5Bpolicy%5D%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=action,fields,permissions" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" | python3 -m json.tool

# Document type dropdown choices
curl -sS "$NEXT_PUBLIC_DIRECTUS_URL/fields/child_document/document_type" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" | python3 -m json.tool
```

## Why we don't extend the bootstrap script

Same rationale as Sessions 47 + 48a + 48b. The bootstrap script
remains the source of truth for fresh-environment setup; per-session
field additions go via REST PATCHes from now on.

The bootstrap script's `child_document` definition (with the legacy
`type` enum) remains intact — fresh installs will get the legacy
columns first, then this migration adds the brief-spec columns
alongside. Future Session 50 reconciliation will likely update both
the bootstrap script and add a data migration to populate the new
columns from the legacy ones.
