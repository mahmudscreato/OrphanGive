#!/usr/bin/env bash
# Session 48b — Directus metadata for the child_intake_photo
# collection added by 001.sql. Idempotent: PATCHes are no-ops if
# already applied; CREATE-permission attempts surface "already
# exists" which the script tolerates.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

note() { printf "  %-32s %s\n" "$1" "$2"; }

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

post_collection() {
  local body="$1" name
  name=$(printf '%s' "$body" | sed -nE 's/.*"collection":"([^"]+)".*/\1/p')
  local resp
  resp=$(curl -sS -X POST "$URL/collections" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d "$body")
  if printf '%s' "$resp" | grep -q '"data"'; then
    note "collection $name" "OK"
  elif printf '%s' "$resp" | grep -qi 'already exist'; then
    note "collection $name" "exists, skipped"
  else
    note "collection $name" "$(printf '%s' "$resp" | head -c 100)"
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
echo "=== Register child_intake_photo collection ==="
post_collection '{"collection":"child_intake_photo","meta":{"icon":"add_a_photo","note":"Initial field-visit evidence photos for a child profile (3-5 per child). Distinct from child_moment timeline.","display_template":"{{caption}}","accountability":"all","sort_field":"display_order","singleton":false},"schema":null,"fields":[]}'

echo ""
echo "=== Register field meta ==="
patch_field child_intake_photo child '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"required":true,"hidden":false}}'
patch_field child_intake_photo proposal '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"hidden":false}}'
patch_field child_intake_photo photo '{"meta":{"interface":"file-image","special":["file"],"required":true,"hidden":false}}'
patch_field child_intake_photo caption '{"meta":{"interface":"input","options":{"placeholder":"Short caption (optional)"},"hidden":false}}'
patch_field child_intake_photo display_order '{"meta":{"interface":"input","note":"Lower numbers sort first","hidden":false}}'
patch_field child_intake_photo uploaded_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["user-created","m2o"],"hidden":false}}'
patch_field child_intake_photo status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Pending","value":"pending"},{"text":"Approved","value":"approved"},{"text":"Rejected","value":"rejected"},{"text":"Archived","value":"archived"}]},"hidden":false}}'
patch_field child_intake_photo reviewed_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["m2o"],"hidden":false}}'
patch_field child_intake_photo reviewed_at '{"meta":{"interface":"datetime","readonly":true,"hidden":false}}'
patch_field child_intake_photo rejection_reason '{"meta":{"interface":"input-multiline","hidden":false}}'
patch_field child_intake_photo date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"],"hidden":false}}'

echo ""
echo "=== DI policy permissions ==="
DI_POLICY=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=id" -H "Authorization: Bearer $ADMIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data'][0]['id'])")

# READ own — uploaded_by = $CURRENT_USER. The child-scoping (only
# children in the DI's care) is enforced server-side in the API
# route via getDiChildById; the Directus policy filter just narrows
# to "rows I uploaded" so direct admin-UI peeking is also clean.
post_permission "$DI_POLICY" child_intake_photo read '["*"]' '{"uploaded_by":{"_eq":"$CURRENT_USER"}}'

# CREATE — uploaded_by auto-fills via the user-created special when
# called via the DI's session token. We use admin token in the API
# route but the route validates ownership before write.
post_permission "$DI_POLICY" child_intake_photo create '["*"]'

# UPDATE — only `caption` and `display_order` on own pending rows.
# Admin's review (status, reviewed_by, etc.) is gated to admin
# policies via the missing fields list here.
post_permission "$DI_POLICY" child_intake_photo update '["caption","display_order"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

# DELETE — only own pending rows (per brief: cannot delete after admin review).
post_permission "$DI_POLICY" child_intake_photo delete '["*"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

echo ""
echo "Done."
