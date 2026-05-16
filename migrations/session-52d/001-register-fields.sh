#!/usr/bin/env bash
# Session 52d — robust re-registration of the `intake-locked` storage
# preset + schema additions for the split parent death certificates.
#
# Background on why this re-runs the 52c preset registration:
#
#   The 52c script used a fragile shell→Python→shell→Python dance to
#   read the existing presets, modify them, and PATCH them back.
#   Under any one of several failure modes (auth error in the GET
#   step, JSON escaping of single quotes, Python triple-quote
#   interpolation when EXISTING_PRESETS contained certain characters),
#   the PATCH silently sent an empty body or skipped entirely — the
#   preset never landed in directus_settings, so the
#   `?key=intake-locked` URL served the original full-resolution
#   image (the Session 52d smoke-test Bug 1 finding).
#
# This rewrite uses a SINGLE Python invocation that does GET, modify,
# PATCH, VERIFY in one process — no shell variable juggling. Failures
# in any step are loud + halt the script.
#
# Also extends the `child_document.document_type` Directus dropdown
# with the two new Session 52d enum values
# (`father_death_certificate`, `mother_death_certificate`) so admin's
# Directus UI surfaces them. The Postgres column is varchar — no SQL
# change needed; the DI form + admin review pages drive the new
# vocabulary directly.
#
# Required env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.

set -euo pipefail

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

echo "=== Cache clear ==="
curl -sS -X POST "$URL/utils/cache/clear" -H "Authorization: Bearer $ADMIN" \
  -w "  cache clear: HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=== Extend child_document.document_type dropdown ==="
curl -sS -X PATCH "$URL/fields/child_document/document_type" \
  -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father'"'"'s death certificate","value":"father_death_certificate"},{"text":"Mother'"'"'s death certificate","value":"mother_death_certificate"},{"text":"Parent death certificate (unknown / both)","value":"parent_death_certificate"},{"text":"Child birth certificate","value":"child_birth_certificate"},{"text":"Guardian National ID","value":"guardian_nid"},{"text":"School recommendation letter","value":"school_recommendation"}]},"hidden":false}}' \
  -w "  HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=== Register intake-locked storage preset (robust single-pass) ==="

# All-in-one Python: GET current settings, replace any prior
# intake-locked entry, PATCH, VERIFY. Single process; no fragile
# shell-string interpolation between steps. URL + token come in via
# environment so they don't have to be re-quoted in the script body.
URL="$URL" ADMIN="$ADMIN" python3 << 'PYEOF'
import json
import os
import sys
import urllib.request
import urllib.error

URL = os.environ["URL"].rstrip("/")
ADMIN = os.environ["ADMIN"]

def directus_request(method, path, body=None):
    req = urllib.request.Request(
        f"{URL}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {ADMIN}",
            "Content-Type": "application/json",
        },
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
    )
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode("utf-8")
            return resp.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        return e.code, body_text

# --- 1. GET current settings ---
status, body = directus_request("GET", "/settings?fields=storage_asset_presets")
if status != 200 or not isinstance(body, dict):
    print(f"  FAIL: GET /settings returned {status}: {body}")
    sys.exit(1)
existing = (body.get("data") or {}).get("storage_asset_presets") or []
print(f"  existing presets: {len(existing)} (keys: {[p.get('key') for p in existing]})")

# --- 2. Replace any prior intake-locked entry ---
filtered = [p for p in existing if p.get("key") != "intake-locked"]
# Directus 11 storage_asset_presets shape:
#   { key, fit, width, height, quality, withoutEnlargement, format,
#     transforms: [[method, ...args]] }
# `transforms[0] = ['blur', 25]` → sharp.blur(25) on the image.
new_preset = {
    "key": "intake-locked",
    "fit": "contain",
    "width": 240,
    "height": 240,
    "quality": 60,
    "withoutEnlargement": True,
    "format": "jpg",
    "transforms": [["blur", 25]],
}
updated = filtered + [new_preset]

# --- 3. PATCH ---
status, body = directus_request("PATCH", "/settings", {
    "storage_asset_presets": updated,
})
if status != 200:
    print(f"  FAIL: PATCH /settings returned {status}: {body}")
    sys.exit(1)
print(f"  PATCH /settings: OK ({status})")

# --- 4. VERIFY by re-fetching ---
status, body = directus_request("GET", "/settings?fields=storage_asset_presets")
if status != 200 or not isinstance(body, dict):
    print(f"  FAIL: verify GET returned {status}")
    sys.exit(1)
verified = (body.get("data") or {}).get("storage_asset_presets") or []
ours = [p for p in verified if p.get("key") == "intake-locked"]
if not ours:
    print(f"  FAIL: intake-locked preset NOT in settings after PATCH")
    sys.exit(1)
print(f"  verified: intake-locked preset registered")
print(f"  preset body: {json.dumps(ours[0], indent=2)}")
PYEOF

echo ""
echo "=== Done ==="
echo "Smoke test (replace UUID with a real intake-photo file id):"
echo "  curl -sI \"\$NEXT_PUBLIC_DIRECTUS_URL/assets/<uuid>?key=intake-locked\" \\"
echo "    -H \"Authorization: Bearer \$DIRECTUS_SERVER_TOKEN\""
echo "Should show Content-Length much smaller than the bare /assets/<uuid> URL."
