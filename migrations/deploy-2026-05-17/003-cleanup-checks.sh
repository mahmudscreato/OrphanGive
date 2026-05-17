#!/usr/bin/env bash
# ============================================================
# Deploy 2026-05-17 — Post-migration verification suite
# ============================================================
#
# Runs AFTER 001-schema.sql + Directus restart + 002-directus-
# register.sh. Verifies every expected schema element exists and
# every expected Directus metadata row is registered.
#
# Prints PASS / FAIL per check, total summary at end. Exit 0 if
# all PASS; exit 1 if any FAIL.
#
# Requires env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN
#               and either DOCKER_PG_CONTAINER or psql access to
#               the directus database.
#
# Defaults assume Docker setup (matches localhost). For VPS, set
# DOCKER_PG_CONTAINER=og-database (or whatever the prod container
# is named).

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"
PG_CONTAINER="${DOCKER_PG_CONTAINER:-og-postgres-local}"

PASS=0
FAIL=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }

# psql wrapper — runs read-only query, returns just the value
psql_value() {
  docker exec -i "$PG_CONTAINER" psql -U directus -d directus -t -A -c "$1" 2>/dev/null | head -1 | xargs
}

# Boolean: column exists on table
col_exists() {
  local table="$1" col="$2"
  local v
  v=$(psql_value "SELECT 1 FROM information_schema.columns WHERE table_name='$table' AND column_name='$col'")
  [ "$v" = "1" ]
}

# Boolean: table exists
table_exists() {
  local table="$1"
  local v
  v=$(psql_value "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$table'")
  [ "$v" = "1" ]
}

# Boolean: index exists
index_exists() {
  local idx="$1"
  local v
  v=$(psql_value "SELECT 1 FROM pg_indexes WHERE indexname='$idx'")
  [ "$v" = "1" ]
}

# Boolean: Directus collection registered (meta IS NOT NULL)
directus_collection_registered() {
  local name="$1"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$URL/collections/$name" \
    -H "Authorization: Bearer $ADMIN")
  [ "$code" = "200" ]
}

# Boolean: Directus permission row exists for this policy+collection+action
directus_permission_exists() {
  local policy="$1" collection="$2" action="$3"
  local count
  count=$(curl -sS -g \
    "$URL/permissions?filter%5Bpolicy%5D%5B_eq%5D=$policy&filter%5Bcollection%5D%5B_eq%5D=$collection&filter%5Baction%5D%5B_eq%5D=$action&aggregate%5Bcount%5D=id" \
    -H "Authorization: Bearer $ADMIN" \
    | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d[0]['count']['id'] if d else 0)" 2>/dev/null)
  [ -n "$count" ] && [ "$count" != "0" ]
}

# ─── 1. Row-count survey (data must survive intact) ───────────────
echo "=== 1. Row counts (record for diff against pre-migration) ==="
for T in child child_proposal child_document child_intake_photo child_moment child_update sponsorship donation notification aid_delivery task audit_log school directus_users; do
  n=$(psql_value "SELECT count(*) FROM $T")
  printf "  %-22s %s\n" "$T" "$n"
done
echo ""

# ─── 2. Column existence ──────────────────────────────────────────
echo "=== 2. Expected columns on existing tables ==="

# child — Sessions 41-v3 + 48a
for COL in uploaded_by_di assigned_di district_internal support_type monthly_cost guardian_summary_internal last_visit_date \
           permanent_address school_name_raw priority_support priority_notes parent_loss guardian_phone guardian_phone_alt \
           submission_date guardian_employment_type educational_organization; do
  if col_exists child "$COL"; then ok "child.$COL"; else fail "child.$COL MISSING"; fi
done

# child_document — Sessions 49 + 52a
for COL in document_type notes reviewed_at rejection_reason date_created proposal; do
  if col_exists child_document "$COL"; then ok "child_document.$COL"; else fail "child_document.$COL MISSING"; fi
done

# child_moment — Session 48b
for COL in media_type duration_seconds; do
  if col_exists child_moment "$COL"; then ok "child_moment.$COL"; else fail "child_moment.$COL MISSING"; fi
done

# notification — Session 47
for COL in date_created created_by; do
  if col_exists notification "$COL"; then ok "notification.$COL"; else fail "notification.$COL MISSING"; fi
done

# directus_users — Session 41-v3 + 13.5c
for COL in assigned_divisions og_profile_photo_url; do
  if col_exists directus_users "$COL"; then ok "directus_users.$COL"; else fail "directus_users.$COL MISSING"; fi
done

# sponsorship — May 2026 additions
for COL in cause visibility queue_position queued_starts_at queued_ends_at queue_status \
           shift_decision_required shift_decision_required_at shift_decision shift_decision_at; do
  if col_exists sponsorship "$COL"; then ok "sponsorship.$COL"; else fail "sponsorship.$COL MISSING"; fi
done

echo ""

# ─── 3. New tables exist ──────────────────────────────────────────
echo "=== 3. New tables (from VPS perspective) ==="
for T in child_proposal aid_delivery task audit_log school child_intake_photo; do
  if table_exists "$T"; then ok "table $T"; else fail "table $T MISSING"; fi
done
echo ""

# ─── 4. Indexes ──────────────────────────────────────────────────
echo "=== 4. Critical indexes ==="
for IDX in idx_child_uploaded_by_di idx_child_assigned_di \
           idx_document_child idx_document_proposal idx_document_status idx_document_type \
           uniq_document_child_type_approved \
           notification_recipient_date_created_idx notification_recipient_read_idx \
           school_name_idx school_division_idx \
           idx_intake_photo_child_order idx_intake_photo_status idx_intake_photo_uploader idx_intake_photo_proposal; do
  if index_exists "$IDX"; then ok "index $IDX"; else fail "index $IDX MISSING"; fi
done
echo ""

# ─── 5. Directus collection meta registered ──────────────────────
echo "=== 5. Directus collection meta registered ==="
for C in child_proposal aid_delivery task audit_log school child_intake_photo; do
  if directus_collection_registered "$C"; then ok "collection $C meta"; else fail "collection $C meta MISSING"; fi
done
echo ""

# ─── 6. Key permissions ──────────────────────────────────────────
echo "=== 6. Key permissions ==="
DI_POLICY=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=Data%20Inputter&fields=id" \
  -H "Authorization: Bearer $ADMIN" \
  | python3 -c "import sys, json; rows=json.load(sys.stdin)['data']; print(rows[0]['id'] if rows else '')")
ADMIN_POLICY=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=Admin&fields=id" \
  -H "Authorization: Bearer $ADMIN" \
  | python3 -c "import sys, json; rows=json.load(sys.stdin)['data']; print(rows[0]['id'] if rows else '')")

if [ -z "$DI_POLICY" ];    then fail "DI policy not found";    else ok "DI policy: $DI_POLICY"; fi
if [ -z "$ADMIN_POLICY" ]; then fail "Admin policy not found"; else ok "Admin policy: $ADMIN_POLICY"; fi

if [ -n "$DI_POLICY" ]; then
  for spec in \
    "child_proposal:create" "child_proposal:read" "child_proposal:update" \
    "aid_delivery:create"   "aid_delivery:read" \
    "task:read"             "task:update" \
    "school:read"           "school:create" \
    "child_intake_photo:read" "child_intake_photo:create" "child_intake_photo:update" "child_intake_photo:delete" \
    "child_document:read"     "child_document:create"     "child_document:update"     "child_document:delete" \
    "notification:read"       "notification:update"; do
    coll="${spec%%:*}"; act="${spec##*:}"
    if directus_permission_exists "$DI_POLICY" "$coll" "$act"; then
      ok "DI perm $coll/$act"
    else
      fail "DI perm $coll/$act MISSING"
    fi
  done
fi

if [ -n "$ADMIN_POLICY" ]; then
  for spec in \
    "child_proposal:read"     "child_proposal:update"     "child_proposal:delete" \
    "aid_delivery:read"       "aid_delivery:update"       "aid_delivery:delete" \
    "task:create"             "task:read"                 "task:update" "task:delete" \
    "audit_log:read" \
    "school:create"           "school:read"               "school:update" "school:delete" \
    "child_intake_photo:read" "child_intake_photo:create" "child_intake_photo:update" "child_intake_photo:delete" \
    "child_document:read"     "child_document:create"     "child_document:update"     "child_document:delete"; do
    coll="${spec%%:*}"; act="${spec##*:}"
    if directus_permission_exists "$ADMIN_POLICY" "$coll" "$act"; then
      ok "Admin perm $coll/$act"
    else
      fail "Admin perm $coll/$act MISSING"
    fi
  done
fi
echo ""

# ─── 7. Storage preset ──────────────────────────────────────────
echo "=== 7. Storage preset: intake-locked ==="
PRESET_OK=$(curl -sS "$URL/settings?fields=storage_asset_presets" \
  -H "Authorization: Bearer $ADMIN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin).get('data') or {}
presets = d.get('storage_asset_presets') or []
ours = [p for p in presets if p.get('key') == 'intake-locked']
if not ours: print('FAIL'); sys.exit(0)
p = ours[0]
ok = (
  p.get('width') == 240 and
  p.get('height') == 240 and
  p.get('quality') == 60 and
  p.get('format') == 'jpg' and
  p.get('transforms') == [['blur', 25]]
)
print('OK' if ok else 'WRONG_SHAPE')
" 2>/dev/null)
if [ "$PRESET_OK" = "OK" ]; then
  ok "intake-locked preset registered with correct shape"
else
  fail "intake-locked preset MISSING or wrong shape ($PRESET_OK)"
fi
echo ""

# ─── 8. Smoke test: keyed asset URL serves smaller file ─────────
echo "=== 8. Smoke test: asset preset serves smaller variant ==="
# Pick any approved intake photo if one exists
SAMPLE_PHOTO=$(psql_value "SELECT photo FROM child_intake_photo WHERE status='approved' AND photo IS NOT NULL LIMIT 1")
if [ -n "$SAMPLE_PHOTO" ]; then
  RAW=$(curl -sI "$URL/assets/$SAMPLE_PHOTO" -H "Authorization: Bearer $ADMIN" | awk 'tolower($1)=="content-length:"{print $2}' | tr -d '\r')
  KEYED=$(curl -sI "$URL/assets/$SAMPLE_PHOTO?key=intake-locked" -H "Authorization: Bearer $ADMIN" | awk 'tolower($1)=="content-length:"{print $2}' | tr -d '\r')
  if [ -n "$RAW" ] && [ -n "$KEYED" ] && [ "$KEYED" -lt "$RAW" ]; then
    ok "preset serves smaller variant ($SAMPLE_PHOTO: raw=$RAW vs keyed=$KEYED)"
  else
    fail "preset NOT serving smaller variant (raw=$RAW, keyed=$KEYED)"
  fi
else
  echo "  (skipped — no approved intake photo on this DB)"
fi
echo ""

# ─── Summary ────────────────────────────────────────────────────
echo "============================================================"
echo "Summary: PASS=$PASS  FAIL=$FAIL"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
