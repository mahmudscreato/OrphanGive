#!/usr/bin/env bash
# Session 52c — Directus metadata patches.
#
# Three changes:
#   1. child_document.type → required: false (mirrors the Session 52a
#      SQL that dropped Postgres NOT NULL — Directus enforces
#      required at the metadata layer independently of Postgres, so
#      without this PATCH inserts that omit `type` still fail with
#      "Field 'type' is required"). Bug 2 from Session 52c brief.
#   2. child_document.status → required: false (same reasoning; the
#      legacy enum's required: true was rejecting the new 'pending'
#      / 'approved' / etc. values that aren't in the legacy choices
#      list, even though we DO set status explicitly. Defensive.).
#   3. Storage asset preset `intake-locked` registered in
#      directus_settings so non-sponsor intake photo URLs can use
#      `?key=intake-locked` to fetch a server-blurred + downscaled
#      variant. Feature 4 from Session 52c brief.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

note() { printf "  %-44s %s\n" "$1" "$2"; }

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
echo "=== Relax legacy child_document required fields ==="
patch_field child_document type '{"meta":{"required":false}}'
patch_field child_document status '{"meta":{"required":false}}'

echo ""
echo "=== Register storage asset preset: intake-locked ==="
# Directus exposes storage presets via PATCH /settings (singleton).
# We GET the existing presets, append/replace ours, PATCH back.
# Each preset is { key, fit, width, height, quality, ..., transforms }.
# `transforms` is an array of sharp-style ops; here a blur(25) plus
# a small resize keeps the variant low-res so even if scraped it
# offers no useful detail beyond confirming the image exists.

EXISTING_PRESETS=$(curl -sS "$URL/settings?fields=storage_asset_presets" \
  -H "Authorization: Bearer $ADMIN" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin).get('data') or {}
presets = d.get('storage_asset_presets') or []
# Drop any prior intake-locked entry so re-runs replace cleanly.
presets = [p for p in presets if p.get('key') != 'intake-locked']
presets.append({
  'key': 'intake-locked',
  'fit': 'contain',
  'width': 240,
  'height': 240,
  'quality': 60,
  'withoutEnlargement': True,
  'format': 'jpg',
  'transforms': [['blur', 25]],
})
print(json.dumps(presets))
")

PATCH_BODY=$(python3 -c "
import json, sys
presets = json.loads('''$EXISTING_PRESETS''')
print(json.dumps({'storage_asset_presets': presets}))
")

RESP=$(curl -sS -X PATCH "$URL/settings" \
  -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d "$PATCH_BODY")

if printf '%s' "$RESP" | grep -q '"storage_asset_presets"'; then
  note "preset intake-locked" "OK"
else
  note "preset intake-locked" "$(printf '%s' "$RESP" | head -c 200)"
fi

echo ""
echo "Done."
