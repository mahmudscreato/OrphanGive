#!/usr/bin/env bash
# Session 49 — Directus metadata for the child_document additions
# made by 001-documents.sql. Idempotent: PATCHes are no-ops if
# already applied; CREATE-permission attempts surface "already
# exists" which the script tolerates.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.
#
# Note: the `child_document` collection itself was registered by the
# bootstrap script during Session 41-v3, so we DON'T post a fresh
# collection record here. Instead we PATCH the new fields added by
# 001 (document_type, notes, reviewed_at, rejection_reason, proposal,
# date_created) and re-register DI policy permissions to match the
# brief's spec (READ own, CREATE all, UPDATE notes only on own
# pending, DELETE own pending only).

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

note() { printf "  %-36s %s\n" "$1" "$2"; }

patch_field() {
  local table="$1" field="$2" body="$3"
  local resp
  resp=$(curl -sS -X PATCH "$URL/fields/$table/$field" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d "$body")
  if printf '%s' "$resp" | grep -q '"data"'; then
    note "$table.$field" "OK"
  else
    note "$table.$field" "$(printf '%s' "$resp" | head -c 100)"
  fi
}

post_permission() {
  local policy="$1" collection="$2" action="$3" fields="$4" perms="${5:-null}"
  local resp
  resp=$(curl -sS -X POST "$URL/permissions" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d "{\"policy\":\"$policy\",\"collection\":\"$collection\",\"action\":\"$action\",\"fields\":$fields,\"permissions\":$perms}")
  if printf '%s' "$resp" | grep -q '"data"'; then
    note "perm $collection $action" "OK"
  elif printf '%s' "$resp" | grep -qi 'already exist'; then
    note "perm $collection $action" "exists, skipped"
  else
    note "perm $collection $action" "$(printf '%s' "$resp" | head -c 100)"
  fi
}

echo "=== Force Directus to re-introspect post-SQL ==="
curl -sS -X POST "$URL/utils/cache/clear" -H "Authorization: Bearer $ADMIN" \
  -w "  cache clear: HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=== Register field meta for new child_document columns ==="

# document_type — brief enum, distinct from legacy `type` column.
patch_field child_document document_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Parent death certificate","value":"parent_death_certificate"},{"text":"Child birth certificate","value":"child_birth_certificate"},{"text":"Guardian National ID","value":"guardian_nid"},{"text":"School recommendation letter","value":"school_recommendation"}]},"required":true,"hidden":false}}'

# proposal — optional M2O. Set when the document upload is part of a
# CREATE proposal that hasn't been approved yet.
patch_field child_document proposal '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"hidden":false}}'

# notes — replaces legacy review_notes for the new write path. Free text
# that DI fills in to give admin context (e.g., "scan is grainy but
# legible — mother's name visible on line 3").
patch_field child_document notes '{"meta":{"interface":"input-multiline","options":{"placeholder":"Optional context for admin review"},"hidden":false}}'

# reviewed_at — datetime stamped by admin on review. Read-only on
# DI-side, set by admin's review action.
patch_field child_document reviewed_at '{"meta":{"interface":"datetime","readonly":true,"hidden":false}}'

# rejection_reason — set by admin when rejecting. DI sees this on
# their rejected rows so they know what to fix on re-upload.
patch_field child_document rejection_reason '{"meta":{"interface":"input-multiline","readonly":true,"hidden":false}}'

# date_created — default set by Postgres, but Directus needs the
# date-created special so the admin UI doesn't let users edit it.
patch_field child_document date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"],"hidden":false}}'

echo ""
echo "=== DI policy permissions ==="
DI_POLICY=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=id" -H "Authorization: Bearer $ADMIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data'][0]['id'])")

# READ own — uploaded_by = $CURRENT_USER. Documents are Tier 3, so
# this filter ensures DIs only see their own uploads even via the
# admin UI. Cross-DI document peeking is locked.
post_permission "$DI_POLICY" child_document read '["*"]' '{"uploaded_by":{"_eq":"$CURRENT_USER"}}'

# CREATE — all fields. The new columns (document_type, notes, etc.)
# get included via "*". Application validates the document_type value
# against DOCUMENT_TYPES before write; permission is "any allowed
# write" since the policy filter on read scopes the result anyway.
post_permission "$DI_POLICY" child_document create '["*"]'

# UPDATE — only `notes` on own pending rows. Brief explicitly says
# "update notes only" — admin-facing fields (status, reviewed_by,
# rejection_reason, document_type, file) are gated to admin policies
# via the missing fields list here.
post_permission "$DI_POLICY" child_document update '["notes"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

# DELETE — only own pending rows. Once admin reviews (approved /
# rejected / archived), the row becomes immutable from the DI side —
# they have to ask admin to remove it.
post_permission "$DI_POLICY" child_document delete '["*"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

echo ""
echo "Done."
