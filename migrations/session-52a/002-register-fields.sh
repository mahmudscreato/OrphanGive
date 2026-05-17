#!/usr/bin/env bash
# Session 52a — extend child.status dropdown choices with the new
# `awaiting_intake` value used for stub-child placeholders created
# during a CREATE draft.
#
# Background. To unlock document + intake-photo uploads during the
# initial profile-entry flow (instead of forcing the DI to wait
# until admin approval), Session 52a pre-creates a `child` row at
# draft-save time. That row exists purely to hang documents +
# intake photos off of via the NOT NULL FKs on child_document.child
# and child_intake_photo.child. It must NEVER appear on any donor
# surface — every donor query filters by status='active', so the
# new `awaiting_intake` value auto-hides.
#
# At the schema layer `child.status` is varchar — Directus enum
# choices are presentational only. So this script is purely about
# making the admin Directus UI show "Awaiting intake" as a labeled
# option in the dropdown; the database accepts the value either way.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.

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

echo "=== Cache clear ==="
curl -sS -X POST "$URL/utils/cache/clear" -H "Authorization: Bearer $ADMIN" \
  -w "  cache clear: HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=== Extend child.status dropdown with awaiting_intake ==="
# Choices preserve the original order from bootstrap (Session 41-v3)
# plus the new awaiting_intake. `pending_approval` was the original
# placeholder value but is unused; `awaiting_intake` is the new
# canonical for stub children.
patch_field child status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Awaiting intake","value":"awaiting_intake"},{"text":"Pending approval","value":"pending_approval"},{"text":"Active","value":"active"},{"text":"Sponsored","value":"sponsored"},{"text":"Archived","value":"archived"},{"text":"Withdrawn","value":"withdrawn"}]}}}'

echo ""
echo "Done."
