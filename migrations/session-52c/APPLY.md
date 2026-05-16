# Session 52c apply order

Single script — REST PATCHes only. No SQL this session (the Session
52a Postgres NOT NULL drop is what made the relaxation possible;
this just brings the Directus metadata layer in line + registers the
storage preset).

## 1. Directus metadata + storage preset

```bash
bash migrations/session-52c/001-register-fields.sh
```

Three changes:

1. **`child_document.type` → required: false** — mirrors the
   Session 52a Postgres ALTER. Without this PATCH, Directus
   metadata-layer validation continues to reject inserts that omit
   the legacy `type` column with "Field 'type' is required" (which
   surfaces as "Couldn't save that document" on the DI form).
2. **`child_document.status` → required: false** — defensive; the
   legacy enum's choices list doesn't include the new vocabulary
   values, and `required: true` plus a dropdown that doesn't allow
   the value being set can yield silent rejections.
3. **Storage asset preset `intake-locked`** — registered in
   `directus_settings.storage_asset_presets`. Returns a downscaled
   (240×240) + blur(25) JPEG variant. The donor intake-photo
   gallery's `?key=intake-locked` URL renders this variant for
   non-sponsor views (Session 52c Feature 4).

Reads `NEXT_PUBLIC_DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` from
the environment. Idempotent — re-runs replace the existing
`intake-locked` preset cleanly (the script strips any prior entry
with the same key before appending).

## 2. Verify

```bash
# Confirm child_document.type metadata required=false
curl -sS "$NEXT_PUBLIC_DIRECTUS_URL/fields/child_document/type" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('type required:', d['meta'].get('required'))"

# Same for status
curl -sS "$NEXT_PUBLIC_DIRECTUS_URL/fields/child_document/status" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('status required:', d['meta'].get('required'))"

# Confirm storage preset registered
curl -sS "$NEXT_PUBLIC_DIRECTUS_URL/settings?fields=storage_asset_presets" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; \
      presets = d.get('storage_asset_presets') or []; \
      ours = [p for p in presets if p.get('key') == 'intake-locked']; \
      print('intake-locked preset:', 'OK' if ours else 'MISSING'); \
      print(json.dumps(ours, indent=2)) if ours else None"

# End-to-end: fetch a known intake photo asset with the key + without
# Adjust UUID to a real one in your install
UUID="<intake-photo-file-uuid>"
curl -sI "$NEXT_PUBLIC_DIRECTUS_URL/assets/$UUID?key=intake-locked" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN"
# → Content-Type: image/jpeg (variant served)
```

Expected: `type` and `status` required=false; preset entry present
with `transforms: [['blur', 25]]`; and the variant URL responds
with a smaller JPEG (240×240) vs the original.
