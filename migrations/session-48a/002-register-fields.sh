#!/usr/bin/env bash
# Session 48a — Directus metadata registration for the new fields,
# enums, school collection, and DI permissions added by 001.sql.
#
# Idempotent: PATCHes are no-ops if already applied; collection +
# permission CREATEs surface "already exists" errors which the script
# tolerates.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

note() { printf "  %-32s %s\n" "$1" "$2"; }

# Skip stderr noise on already-exists; exit code from curl is fine.
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

echo "=== Force Directus to re-introspect post-SQL-migration ==="
curl -sS -X POST "$URL/utils/cache/clear" -H "Authorization: Bearer $ADMIN" \
  -w "  cache clear: HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=== Register school collection ==="
post_collection '{"collection":"school","meta":{"icon":"school","note":"Bangladesh schools, madrasas, and vocational institutions referenced by child profiles","display_template":"{{name}}","accountability":"all","sort_field":"name","singleton":false},"schema":null,"fields":[]}'

echo ""
echo "=== Register school field meta ==="
patch_field school name '{"meta":{"interface":"input","required":true,"hidden":false}}'
patch_field school type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"School","value":"school"},{"text":"Madrasa","value":"madrasa"},{"text":"Vocational","value":"vocational"},{"text":"Other","value":"other"}]},"hidden":false}}'
patch_field school bd_division '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"hidden":false}}'
patch_field school bd_district '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"hidden":false}}'
patch_field school notes '{"meta":{"interface":"input-multiline","hidden":false}}'
patch_field school created_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["user-created","m2o"],"hidden":false}}'
patch_field school date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"],"hidden":false}}'

echo ""
echo "=== Register the 11 new fields on child + child_proposal ==="
for tbl in child child_proposal; do
  echo "  -- $tbl --"
  patch_field "$tbl" permanent_address '{"meta":{"interface":"input-multiline","note":"Internal — full permanent address (Tier 3)","hidden":false}}'
  patch_field "$tbl" educational_organization '{"meta":{"interface":"select-dropdown-m2o","options":{"template":"{{name}} ({{type}})"},"special":["m2o"],"hidden":false}}'
  patch_field "$tbl" school_name_raw '{"meta":{"interface":"input","options":{"placeholder":"Type school name if not in the dropdown"},"note":"Free-text fallback when no school row matches","hidden":false}}'
  patch_field "$tbl" priority_support '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"None","value":"none"},{"text":"Standard","value":"standard"},{"text":"Urgent","value":"urgent"}]},"hidden":false}}'
  patch_field "$tbl" priority_notes '{"meta":{"interface":"input-multiline","note":"Required when priority_support is not none","hidden":false,"conditions":[{"name":"hide-when-none","rule":{"_and":[{"priority_support":{"_eq":"none"}}]},"hidden":true}]}}'
  patch_field "$tbl" parent_loss '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Both","value":"both"},{"text":"Unknown","value":"unknown"}]},"hidden":false}}'
  patch_field "$tbl" guardian_phone '{"meta":{"interface":"input","options":{"placeholder":"+8801XXXXXXXXX"},"note":"Internal only — never shown to donors (Tier 3)","hidden":false}}'
  patch_field "$tbl" guardian_phone_alt '{"meta":{"interface":"input","options":{"placeholder":"Optional secondary contact"},"note":"Internal only (Tier 3)","hidden":false}}'
  patch_field "$tbl" submission_date '{"meta":{"interface":"datetime","options":{"includeTime":false},"note":"Date this profile was submitted by the DI","hidden":false}}'
  patch_field "$tbl" guardian_employment_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Day labor","value":"day_labor"},{"text":"Agriculture / farming","value":"agriculture_farming"},{"text":"Small business","value":"small_business"},{"text":"Rickshaw / transport","value":"rickshaw_transport"},{"text":"Garment worker","value":"garment_worker"},{"text":"Domestic worker","value":"domestic_worker"},{"text":"Teacher","value":"teacher"},{"text":"Religious scholar","value":"religious_scholar"},{"text":"Unemployed","value":"unemployed"},{"text":"Retired","value":"retired"},{"text":"Other","value":"other"}]},"hidden":false}}'
  patch_field "$tbl" areas_of_interest '{"type":"json","meta":{"interface":"tags","options":{"placeholder":"Add an interest"},"special":["cast-csv"],"hidden":false}}'
done

echo ""
echo "=== Extend guardian_relationship enum (front-load father/mother) ==="
for tbl in child child_proposal; do
  patch_field "$tbl" guardian_relationship '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Paternal uncle","value":"paternal_uncle"},{"text":"Maternal uncle","value":"maternal_uncle"},{"text":"Paternal aunt","value":"paternal_aunt"},{"text":"Maternal aunt","value":"maternal_aunt"},{"text":"Paternal grandparent","value":"paternal_grandparent"},{"text":"Maternal grandparent","value":"maternal_grandparent"},{"text":"Older sibling","value":"older_sibling"},{"text":"Extended family","value":"extended_family"},{"text":"Community member","value":"community_member"},{"text":"Orphanage only","value":"orphanage_only"},{"text":"Other","value":"other"}]}}}'
done

echo ""
echo "=== DI policy permissions on school: READ + CREATE ==="
DI_POLICY=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=id" -H "Authorization: Bearer $ADMIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data'][0]['id'])")
post_permission "$DI_POLICY" school read '["*"]'
post_permission "$DI_POLICY" school create '["*"]'

echo ""
echo "Done."
