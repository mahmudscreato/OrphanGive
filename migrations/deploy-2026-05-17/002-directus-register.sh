#!/usr/bin/env bash
# ============================================================
# Deploy 2026-05-17 — Directus metadata registration
# ============================================================
#
# Runs AFTER 001-schema.sql + a Directus container restart. Idempotent:
# every CREATE-style call tolerates "already exists" silently; every
# PATCH is naturally idempotent (write same body → same state).
#
# What this script does:
#   1. Clear Directus's schema cache (so it re-introspects the new
#      Postgres columns / tables that 001-schema.sql created).
#   2. Register the 6 collections that don't have meta yet on VPS:
#      child_proposal, aid_delivery, task, audit_log, school,
#      child_intake_photo.
#   3. PATCH field meta on all new + extended columns: interfaces,
#      dropdown choices, M2O specials, date-created/user-created
#      auto-fills, requiredness.
#   4. POST relations on M2O fields so the admin UI's dropdown picker
#      populates.
#   5. POST permissions on the 6 new collections for the Data
#      Inputter and Admin policies.
#   6. PATCH the `intake-locked` storage preset into
#      directus_settings so non-sponsor intake photo URLs (?key=
#      intake-locked) get server-side blur + 240px downscale.
#
# Requires env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN.
# Source .env.local at the call site OR export them inline.
#
# Failure mode: any failed REST call prints its response body inline
# and the script CONTINUES (so partial application is recoverable
# by re-running). At the end, the script prints a summary. The
# 003-cleanup-checks.sh script is the authoritative verifier.

set -u

URL="${NEXT_PUBLIC_DIRECTUS_URL:?NEXT_PUBLIC_DIRECTUS_URL not set}"
ADMIN="${DIRECTUS_SERVER_TOKEN:?DIRECTUS_SERVER_TOKEN not set}"

# ─── Counters ──────────────────────────────────────────────────────
OK=0
SKIP=0
WARN=0
ERR=0

# ─── Helpers ──────────────────────────────────────────────────────

note() {
  # $1 = label (left col), $2 = status (right col)
  printf "  %-58s %s\n" "$1" "$2"
}

# Patch field meta. PATCH /fields/{collection}/{field}.
# Body should contain `meta` (and optionally `schema` / `type`).
# Idempotent: PATCH-same-body → no-op at Directus level.
patch_field() {
  local table="$1" field="$2" body="$3"
  local resp
  resp=$(curl -sS -X PATCH "$URL/fields/$table/$field" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d "$body")
  if printf '%s' "$resp" | grep -q '"data"'; then
    note "  field $table.$field" "OK"
    OK=$((OK + 1))
  elif printf '%s' "$resp" | grep -qi "doesn't exist\|does not exist"; then
    # Directus hasn't introspected yet (column exists at PG level but
    # cache stale). The cache_clear at the top of this script SHOULD
    # have prevented this; if we hit it anyway, log + continue.
    note "  field $table.$field" "WARN (column not in cache; restart Directus + re-run)"
    WARN=$((WARN + 1))
  else
    note "  field $table.$field" "ERR: $(printf '%s' "$resp" | head -c 150)"
    ERR=$((ERR + 1))
  fi
}

# POST a new collection. Body contains `collection`, `meta`, `schema`,
# `fields` (the id PK). Tolerates "already exists" silently.
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
    OK=$((OK + 1))
  elif printf '%s' "$resp" | grep -qi 'already exist'; then
    note "collection $name" "SKIP (exists)"
    SKIP=$((SKIP + 1))
  else
    note "collection $name" "ERR: $(printf '%s' "$resp" | head -c 150)"
    ERR=$((ERR + 1))
  fi
}

# POST a relation. The FK is already at the Postgres level (set by
# 001-schema.sql); this just tells Directus to wire the M2O picker.
# Body: collection, field, related_collection.
post_relation() {
  local collection="$1" field="$2" related="$3"
  local body
  body=$(printf '{"collection":"%s","field":"%s","related_collection":"%s","meta":{"junction_field":null,"many_collection":"%s","many_field":"%s","one_collection":"%s","sort_field":null},"schema":{"on_delete":"SET NULL"}}' \
    "$collection" "$field" "$related" "$collection" "$field" "$related")
  local resp
  resp=$(curl -sS -X POST "$URL/relations" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d "$body")
  if printf '%s' "$resp" | grep -q '"data"'; then
    note "  rel $collection.$field → $related" "OK"
    OK=$((OK + 1))
  elif printf '%s' "$resp" | grep -qi 'already exist\|already configured\|already has an associated relationship'; then
    note "  rel $collection.$field → $related" "SKIP (exists)"
    SKIP=$((SKIP + 1))
  else
    note "  rel $collection.$field → $related" "ERR: $(printf '%s' "$resp" | head -c 150)"
    ERR=$((ERR + 1))
  fi
}

# UPSERT a permission row. $1=policy_id, $2=collection, $3=action,
# $4=fields-JSON, $5=permissions-filter-JSON (default null), $6=presets (default null).
#
# Session 56 — upgraded from pure POST to upsert. Previously this
# helper would SKIP if a (policy, collection, action) row already
# existed, which meant a script-side change to a permission's
# presets / fields / filter would never propagate to installs that
# had already been bootstrapped. The 002-status-preset hotfix on
# production (May 17) needed manual REST PATCHes for exactly that
# reason. Now: GET first to check existence, then POST (create) or
# PATCH (update by id) so the script-side spec is always
# authoritative.
post_permission() {
  local policy="$1" collection="$2" action="$3" fields="$4" perms="${5:-null}" presets="${6:-null}"
  local body
  body="{\"policy\":\"$policy\",\"collection\":\"$collection\",\"action\":\"$action\",\"fields\":$fields,\"permissions\":$perms,\"presets\":$presets}"

  # Look up an existing row by (policy, collection, action). Directus
  # allows multiple permission rows per triple (Access Control v11
  # supports stacked permissions), so we match the FIRST one and
  # accept ambiguity in that edge case — every triple this script
  # writes has been a singleton historically.
  local existing_id
  existing_id=$(curl -sS -g \
    "$URL/permissions?filter%5Bpolicy%5D%5B_eq%5D=$policy&filter%5Bcollection%5D%5B_eq%5D=$collection&filter%5Baction%5D%5B_eq%5D=$action&fields=id&limit=1" \
    -H "Authorization: Bearer $ADMIN" \
    | python3 -c "import sys,json; rows=json.load(sys.stdin).get('data') or []; print(rows[0]['id'] if rows else '')" 2>/dev/null)

  local resp
  if [ -n "$existing_id" ]; then
    # PATCH the existing row so fields/permissions/presets/validation
    # match the script-side spec exactly.
    resp=$(curl -sS -X PATCH "$URL/permissions/$existing_id" \
      -H "Authorization: Bearer $ADMIN" \
      -H "Content-Type: application/json" \
      -d "{\"fields\":$fields,\"permissions\":$perms,\"presets\":$presets}")
    if printf '%s' "$resp" | grep -q '"data"'; then
      note "  perm $collection $action" "UPDATED (id $existing_id)"
      OK=$((OK + 1))
    else
      note "  perm $collection $action" "ERR (PATCH): $(printf '%s' "$resp" | head -c 150)"
      ERR=$((ERR + 1))
    fi
  else
    resp=$(curl -sS -X POST "$URL/permissions" \
      -H "Authorization: Bearer $ADMIN" \
      -H "Content-Type: application/json" \
      -d "$body")
    if printf '%s' "$resp" | grep -q '"data"'; then
      note "  perm $collection $action" "CREATED"
      OK=$((OK + 1))
    else
      note "  perm $collection $action" "ERR (POST): $(printf '%s' "$resp" | head -c 150)"
      ERR=$((ERR + 1))
    fi
  fi
}

# Look up a policy id by name. Fails loud if missing — the DI / Admin
# policies are seeded by the C1 bootstrap script and MUST exist
# already on any environment running this deploy.
lookup_policy_id() {
  local name="$1"
  local id
  id=$(curl -sS -g "$URL/policies?filter%5Bname%5D%5B_eq%5D=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$name")&fields=id" \
    -H "Authorization: Bearer $ADMIN" \
    | python3 -c "import sys, json; rows=json.load(sys.stdin)['data']; print(rows[0]['id'] if rows else '')")
  if [ -z "$id" ]; then
    echo "FATAL: policy '$name' not found in directus_policies — bootstrap step missing?" >&2
    return 1
  fi
  printf '%s' "$id"
}

# ─── 1. Cache clear ────────────────────────────────────────────────
echo "=== 1. Clear Directus schema cache ==="
curl -sS -X POST "$URL/utils/cache/clear" \
  -H "Authorization: Bearer $ADMIN" \
  -w "  cache clear: HTTP %{http_code}\n" -o /dev/null
echo ""

# ─── 2. Register new collections ───────────────────────────────────
echo "=== 2. Register 6 new collections (meta layer) ==="

post_collection '{"collection":"child_proposal","meta":{"icon":"pending_actions","color":"#ED8B3F","note":"DI-originated proposed mutations to child records. Workflow: draft → pending → approved | rejected.","display_template":"{{proposal_type}} · {{display_name}} · {{status}}","sort_field":"date_created","accountability":"all","singleton":false},"schema":null,"fields":[]}'
post_collection '{"collection":"aid_delivery","meta":{"icon":"redeem","color":"#9FBFD9","note":"DI-recorded aid delivery events. Photo + description + optional acknowledgment. Admin verifies.","display_template":"{{delivery_date}} · {{aid_type}} · {{status}}","sort_field":"delivery_date","accountability":"all","singleton":false},"schema":null,"fields":[]}'
post_collection '{"collection":"task","meta":{"icon":"task_alt","color":"#F4B400","note":"Admin-assigned work items for DI. di_status owned by DI; admin_status owned by admin.","display_template":"{{title}} · {{di_status}}","sort_field":"due_date","accountability":"all","singleton":false},"schema":null,"fields":[]}'
post_collection '{"collection":"audit_log","meta":{"icon":"receipt_long","color":"#5C5C5E","note":"Append-only audit trail. DI role has zero access.","display_template":"{{timestamp}} · {{actor_role}} · {{action}}","sort_field":"timestamp","accountability":null,"singleton":false},"schema":null,"fields":[]}'
post_collection '{"collection":"school","meta":{"icon":"school","note":"Bangladesh schools, madrasas, and vocational institutions referenced by child profiles","display_template":"{{name}}","accountability":"all","sort_field":"name","singleton":false},"schema":null,"fields":[]}'
post_collection '{"collection":"child_intake_photo","meta":{"icon":"add_a_photo","note":"Initial field-visit evidence photos for a child profile (3-5 per child). Distinct from child_moment timeline.","display_template":"{{caption}}","accountability":"all","sort_field":"display_order","singleton":false},"schema":null,"fields":[]}'

echo ""

# ─── 3. Patch field meta on new collections ────────────────────────
echo "=== 3a. Register field meta on child_proposal ==="
patch_field child_proposal id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field child_proposal proposal_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Create","value":"create"},{"text":"Update","value":"update"}]},"required":true}}'
patch_field child_proposal target_child '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child_proposal status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Pending","value":"pending"},{"text":"Approved","value":"approved"},{"text":"Rejected","value":"rejected"}]},"required":true}}'
patch_field child_proposal rejection_reason '{"meta":{"interface":"input-multiline"}}'
# Session 56 — DO NOT add `user-created` to `special` here. The
# Directus `user-created` special force-overrides whatever value
# the insert payload contains with the token-owner's UUID. Since
# the lib code (`createDraftProposal` in src/lib/di-proposals.ts)
# uses the admin server token and explicitly writes
# `created_by: userId`, `user-created` would silently re-stamp
# every draft with the admin's UUID — breaking every ownership
# filter downstream (getDraftForUser → null → PATCH 404). Hit on
# production 2026-05-17.
patch_field child_proposal created_by '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"readonly":true,"required":true}}'
patch_field child_proposal approved_by '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child_proposal date_created '{"meta":{"interface":"datetime","special":["date-created"],"readonly":true}}'
patch_field child_proposal published_at '{"meta":{"interface":"datetime"}}'
patch_field child_proposal previous_snapshot '{"meta":{"interface":"input-code","options":{"language":"json"}}}'
patch_field child_proposal display_name '{"meta":{"interface":"input"}}'
patch_field child_proposal first_name '{"meta":{"interface":"input"}}'
patch_field child_proposal date_of_birth '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child_proposal gender '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"male","value":"male"},{"text":"female","value":"female"}]}}}'
patch_field child_proposal bd_division '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"display":"related-values","display_options":{"template":"{{name}}"}}}'
patch_field child_proposal bd_district '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child_proposal district_internal '{"meta":{"interface":"input"}}'
patch_field child_proposal Photo '{"meta":{"interface":"file-image","special":["file"]}}'
patch_field child_proposal photo_consent '{"meta":{"interface":"boolean"}}'
patch_field child_proposal story '{"meta":{"interface":"input-multiline"}}'
patch_field child_proposal education_level '{"meta":{"interface":"input"}}'
patch_field child_proposal class_grade '{"meta":{"interface":"input"}}'
patch_field child_proposal areas_of_interest '{"type":"json","meta":{"interface":"tags","options":{"placeholder":"Add an interest"},"special":["cast-csv"]}}'
patch_field child_proposal support_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Education","value":"education"},{"text":"Food","value":"food"},{"text":"Healthcare","value":"healthcare"},{"text":"Clothing","value":"clothing"},{"text":"General care","value":"general_care"},{"text":"Other","value":"other"}]}}}'
patch_field child_proposal monthly_cost '{"meta":{"interface":"input"}}'
patch_field child_proposal blood_group '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"A+","value":"A+"},{"text":"A-","value":"A-"},{"text":"B+","value":"B+"},{"text":"B-","value":"B-"},{"text":"AB+","value":"AB+"},{"text":"AB-","value":"AB-"},{"text":"O+","value":"O+"},{"text":"O-","value":"O-"},{"text":"unknown","value":"unknown"}]}}}'
patch_field child_proposal vaccination_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"up_to_date","value":"up_to_date"},{"text":"partial","value":"partial"},{"text":"unknown","value":"unknown"},{"text":"not_started","value":"not_started"}]}}}'
patch_field child_proposal last_medical_checkup '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child_proposal disability_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"none","value":"none"},{"text":"physical","value":"physical"},{"text":"visual","value":"visual"},{"text":"hearing","value":"hearing"},{"text":"cognitive","value":"cognitive"},{"text":"multiple","value":"multiple"},{"text":"other","value":"other"}]}}}'
patch_field child_proposal disability_notes '{"meta":{"interface":"input-multiline"}}'
patch_field child_proposal siblings_count '{"meta":{"interface":"input"}}'
patch_field child_proposal sibling_position '{"meta":{"interface":"input"}}'
patch_field child_proposal siblings_notes '{"meta":{"interface":"input-multiline"}}'
patch_field child_proposal household_income_source '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"none","value":"none"},{"text":"day_labor","value":"day_labor"},{"text":"agriculture","value":"agriculture"},{"text":"small_business","value":"small_business"},{"text":"remittance","value":"remittance"},{"text":"mixed","value":"mixed"},{"text":"unknown","value":"unknown"}]}}}'
patch_field child_proposal monthly_household_income_bdt '{"meta":{"interface":"input"}}'
patch_field child_proposal household_size '{"meta":{"interface":"input"}}'
patch_field child_proposal guardian_relationship '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Paternal uncle","value":"paternal_uncle"},{"text":"Maternal uncle","value":"maternal_uncle"},{"text":"Paternal aunt","value":"paternal_aunt"},{"text":"Maternal aunt","value":"maternal_aunt"},{"text":"Paternal grandparent","value":"paternal_grandparent"},{"text":"Maternal grandparent","value":"maternal_grandparent"},{"text":"Older sibling","value":"older_sibling"},{"text":"Extended family","value":"extended_family"},{"text":"Community member","value":"community_member"},{"text":"Orphanage only","value":"orphanage_only"},{"text":"Other","value":"other"}]}}}'
patch_field child_proposal guardian_employment '{"meta":{"interface":"input"}}'
patch_field child_proposal guardian_summary_internal '{"meta":{"interface":"input-multiline"}}'
patch_field child_proposal additional_family_notes '{"meta":{"interface":"input-multiline"}}'
patch_field child_proposal last_visit_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child_proposal permanent_address '{"meta":{"interface":"input-multiline","note":"Internal — full permanent address (Tier 3)"}}'
patch_field child_proposal school_name_raw '{"meta":{"interface":"input","note":"Free-text fallback when no school row matches"}}'
patch_field child_proposal priority_support '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"None","value":"none"},{"text":"Standard","value":"standard"},{"text":"Urgent","value":"urgent"}]}}}'
patch_field child_proposal priority_notes '{"meta":{"interface":"input-multiline","note":"Required when priority_support is not none"}}'
patch_field child_proposal parent_loss '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Both","value":"both"},{"text":"Unknown","value":"unknown"}]}}}'
patch_field child_proposal guardian_phone '{"meta":{"interface":"input","note":"Internal only — never shown to donors (Tier 3)"}}'
patch_field child_proposal guardian_phone_alt '{"meta":{"interface":"input","note":"Internal only (Tier 3)"}}'
patch_field child_proposal submission_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child_proposal guardian_employment_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Day labor","value":"day_labor"},{"text":"Agriculture / farming","value":"agriculture_farming"},{"text":"Small business","value":"small_business"},{"text":"Rickshaw / transport","value":"rickshaw_transport"},{"text":"Garment worker","value":"garment_worker"},{"text":"Domestic worker","value":"domestic_worker"},{"text":"Teacher","value":"teacher"},{"text":"Religious scholar","value":"religious_scholar"},{"text":"Unemployed","value":"unemployed"},{"text":"Retired","value":"retired"},{"text":"Other","value":"other"}]}}}'
patch_field child_proposal educational_organization '{"meta":{"interface":"select-dropdown-m2o","options":{"template":"{{name}} ({{type}})"},"special":["m2o"]}}'

echo ""
echo "=== 3b. Register field meta on aid_delivery ==="
patch_field aid_delivery id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field aid_delivery child '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"required":true}}'
patch_field aid_delivery sponsorship '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field aid_delivery aid_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Education","value":"education"},{"text":"Food","value":"food"},{"text":"Healthcare","value":"healthcare"},{"text":"Clothing","value":"clothing"},{"text":"General care","value":"general_care"},{"text":"Other","value":"other"}]},"required":true}}'
patch_field aid_delivery description '{"meta":{"interface":"input-multiline"}}'
patch_field aid_delivery delivery_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field aid_delivery photo '{"meta":{"interface":"file-image","special":["file"]}}'
patch_field aid_delivery recipient_acknowledgment '{"meta":{"interface":"input-multiline"}}'
patch_field aid_delivery status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Pending","value":"pending"},{"text":"Verified","value":"verified"},{"text":"Rejected","value":"rejected"}]},"required":true}}'
patch_field aid_delivery rejection_reason '{"meta":{"interface":"input-multiline"}}'
# Session 56 — same `user-created` removal as child_proposal.created_by.
# `recordDelivery` in src/lib/di-deliveries.ts writes delivered_by
# explicitly with the DI's session userId; the user-created special
# would override that to the admin UUID and break per-DI delivery
# scope.
patch_field aid_delivery delivered_by '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"readonly":true,"required":true}}'
patch_field aid_delivery verified_by '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field aid_delivery date_created '{"meta":{"interface":"datetime","special":["date-created"],"readonly":true}}'
patch_field aid_delivery verified_at '{"meta":{"interface":"datetime"}}'

echo ""
echo "=== 3c. Register field meta on task ==="
patch_field task id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field task title '{"meta":{"interface":"input","required":true}}'
patch_field task description '{"meta":{"interface":"input-multiline"}}'
patch_field task child '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field task assignee '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"required":true}}'
patch_field task created_by '{"meta":{"interface":"select-dropdown-m2o","special":["user-created","m2o"],"readonly":true,"required":true}}'
patch_field task date_created '{"meta":{"interface":"datetime","special":["date-created"],"readonly":true}}'
patch_field task due_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field task priority '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Low","value":"low"},{"text":"Normal","value":"normal"},{"text":"High","value":"high"},{"text":"Urgent","value":"urgent"}]}}}'
patch_field task di_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Open","value":"open"},{"text":"In progress","value":"in_progress"},{"text":"Completed (pending verification)","value":"completed_pending_verification"}]}}}'
patch_field task admin_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Open","value":"open"},{"text":"Verified complete","value":"verified_complete"},{"text":"Rejected / redo","value":"rejected_redo"}]}}}'
patch_field task completed_at '{"meta":{"interface":"datetime"}}'
patch_field task verified_at '{"meta":{"interface":"datetime"}}'
patch_field task verified_by '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'

echo ""
echo "=== 3d. Register field meta on audit_log ==="
patch_field audit_log id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field audit_log timestamp '{"meta":{"interface":"datetime","readonly":true}}'
patch_field audit_log actor '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"required":true,"readonly":true}}'
patch_field audit_log actor_role '{"meta":{"interface":"input","required":true,"readonly":true}}'
patch_field audit_log action '{"meta":{"interface":"input","required":true,"readonly":true}}'
patch_field audit_log collection '{"meta":{"interface":"input","readonly":true}}'
patch_field audit_log record_id '{"meta":{"interface":"input","readonly":true}}'
patch_field audit_log diff '{"meta":{"interface":"input-code","options":{"language":"json"},"readonly":true}}'
patch_field audit_log ip '{"meta":{"interface":"input","readonly":true}}'
patch_field audit_log user_agent '{"meta":{"interface":"input-multiline","readonly":true}}'
patch_field audit_log metadata '{"meta":{"interface":"input-code","options":{"language":"json"},"readonly":true}}'

echo ""
echo "=== 3e. Register field meta on school ==="
patch_field school id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field school name '{"meta":{"interface":"input","required":true}}'
patch_field school type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"School","value":"school"},{"text":"Madrasa","value":"madrasa"},{"text":"Vocational","value":"vocational"},{"text":"Other","value":"other"}]}}}'
patch_field school bd_division '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field school bd_district '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field school notes '{"meta":{"interface":"input-multiline"}}'
patch_field school created_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["user-created","m2o"]}}'
patch_field school date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"]}}'

echo ""
echo "=== 3f. Register field meta on child_intake_photo ==="
patch_field child_intake_photo id '{"meta":{"hidden":true,"readonly":true,"interface":"input","special":["uuid"]}}'
patch_field child_intake_photo child '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"],"required":true}}'
patch_field child_intake_photo proposal '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child_intake_photo photo '{"meta":{"interface":"file-image","special":["file"],"required":true}}'
patch_field child_intake_photo caption '{"meta":{"interface":"input","options":{"placeholder":"Short caption (optional)"}}}'
patch_field child_intake_photo display_order '{"meta":{"interface":"input","note":"Lower numbers sort first"}}'
# Session 56 — same `user-created` removal as child_proposal.created_by.
# `createIntakePhoto` in src/lib/di-intake-photos.ts writes
# uploaded_by explicitly via `withToken(session.accessToken, ...)`
# so it carries the DI user's identity; `user-created` here would
# override that on admin-token paths (`uploadDirectIntakePhoto`)
# and silently mis-stamp DI uploads on others. Required:false
# preserved — admin direct uploads write the field explicitly too.
patch_field child_intake_photo uploaded_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["m2o"]}}'
patch_field child_intake_photo status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Pending","value":"pending"},{"text":"Approved","value":"approved"},{"text":"Rejected","value":"rejected"},{"text":"Archived","value":"archived"}]}}}'
patch_field child_intake_photo reviewed_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["m2o"]}}'
patch_field child_intake_photo reviewed_at '{"meta":{"interface":"datetime","readonly":true}}'
patch_field child_intake_photo rejection_reason '{"meta":{"interface":"input-multiline"}}'
patch_field child_intake_photo date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"]}}'

echo ""
echo "=== 4. Register field meta on EXTENDED existing collections ==="
echo "  -- child (Sessions 41-v3 + 48a) --"
patch_field child uploaded_by_di '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child assigned_di '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child district_internal '{"meta":{"interface":"input"}}'
patch_field child support_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Education","value":"education"},{"text":"Food","value":"food"},{"text":"Healthcare","value":"healthcare"},{"text":"Clothing","value":"clothing"},{"text":"General care","value":"general_care"},{"text":"Other","value":"other"}]}}}'
patch_field child monthly_cost '{"meta":{"interface":"input"}}'
patch_field child guardian_summary_internal '{"meta":{"interface":"input-multiline"}}'
patch_field child last_visit_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child permanent_address '{"meta":{"interface":"input-multiline","note":"Internal — full permanent address (Tier 3)"}}'
patch_field child educational_organization '{"meta":{"interface":"select-dropdown-m2o","options":{"template":"{{name}} ({{type}})"},"special":["m2o"]}}'
patch_field child school_name_raw '{"meta":{"interface":"input","note":"Free-text fallback when no school row matches"}}'
patch_field child priority_support '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"None","value":"none"},{"text":"Standard","value":"standard"},{"text":"Urgent","value":"urgent"}]}}}'
patch_field child priority_notes '{"meta":{"interface":"input-multiline","note":"Required when priority_support is not none"}}'
patch_field child parent_loss '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Both","value":"both"},{"text":"Unknown","value":"unknown"}]}}}'
patch_field child guardian_phone '{"meta":{"interface":"input","note":"Internal only — never shown to donors (Tier 3)"}}'
patch_field child guardian_phone_alt '{"meta":{"interface":"input","note":"Internal only (Tier 3)"}}'
patch_field child submission_date '{"meta":{"interface":"datetime","options":{"includeTime":false}}}'
patch_field child guardian_employment_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Day labor","value":"day_labor"},{"text":"Agriculture / farming","value":"agriculture_farming"},{"text":"Small business","value":"small_business"},{"text":"Rickshaw / transport","value":"rickshaw_transport"},{"text":"Garment worker","value":"garment_worker"},{"text":"Domestic worker","value":"domestic_worker"},{"text":"Teacher","value":"teacher"},{"text":"Religious scholar","value":"religious_scholar"},{"text":"Unemployed","value":"unemployed"},{"text":"Retired","value":"retired"},{"text":"Other","value":"other"}]}}}'
patch_field child areas_of_interest '{"type":"json","meta":{"interface":"tags","options":{"placeholder":"Add an interest"},"special":["cast-csv"]}}'
patch_field child guardian_relationship '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father","value":"father"},{"text":"Mother","value":"mother"},{"text":"Paternal uncle","value":"paternal_uncle"},{"text":"Maternal uncle","value":"maternal_uncle"},{"text":"Paternal aunt","value":"paternal_aunt"},{"text":"Maternal aunt","value":"maternal_aunt"},{"text":"Paternal grandparent","value":"paternal_grandparent"},{"text":"Maternal grandparent","value":"maternal_grandparent"},{"text":"Older sibling","value":"older_sibling"},{"text":"Extended family","value":"extended_family"},{"text":"Community member","value":"community_member"},{"text":"Orphanage only","value":"orphanage_only"},{"text":"Other","value":"other"}]}}}'
# Session 52a — extend child.status dropdown with awaiting_intake (for
# stub-child rows created during a CREATE draft). Schema is varchar so
# no PG constraint; this is purely Directus admin UI labeling.
patch_field child status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Awaiting intake","value":"awaiting_intake"},{"text":"Pending approval","value":"pending_approval"},{"text":"Active","value":"active"},{"text":"Sponsored","value":"sponsored"},{"text":"Archived","value":"archived"},{"text":"Withdrawn","value":"withdrawn"}]}}}'

echo "  -- child_document (Session 49 + 52a + 52c + 52d) --"
patch_field child_document type     '{"meta":{"required":false}}'
patch_field child_document status   '{"meta":{"required":false}}'
patch_field child_document document_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Father'"'"'s death certificate","value":"father_death_certificate"},{"text":"Mother'"'"'s death certificate","value":"mother_death_certificate"},{"text":"Parent death certificate (unknown / both)","value":"parent_death_certificate"},{"text":"Child birth certificate","value":"child_birth_certificate"},{"text":"Guardian National ID","value":"guardian_nid"},{"text":"School recommendation letter","value":"school_recommendation"}]}}}'
patch_field child_document proposal '{"meta":{"interface":"select-dropdown-m2o","special":["m2o"]}}'
patch_field child_document notes '{"meta":{"interface":"input-multiline","options":{"placeholder":"Optional context for admin review"}}}'
patch_field child_document reviewed_at '{"meta":{"interface":"datetime","readonly":true}}'
patch_field child_document rejection_reason '{"meta":{"interface":"input-multiline","readonly":true}}'
patch_field child_document date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"]}}'

echo "  -- child_moment (Session 48b) --"
patch_field child_moment media_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Image","value":"image"},{"text":"Video","value":"video"}]}}}'
patch_field child_moment duration_seconds '{"meta":{"interface":"input","note":"Required when media_type=video; null when image"}}'

echo "  -- notification (Session 47) --"
patch_field notification date_created '{"meta":{"interface":"datetime","readonly":true,"special":["date-created"]}}'
patch_field notification created_by '{"meta":{"interface":"select-dropdown-m2o","readonly":true,"special":["user-created","m2o"]}}'

echo "  -- directus_users (Session 41-v3) --"
patch_field directus_users assigned_divisions '{"type":"json","meta":{"interface":"input-code","options":{"language":"json"},"note":"Array of bd_division.code slugs the DI may work in"}}'
patch_field directus_users og_profile_photo_url '{"meta":{"interface":"input","note":"Cloudinary secure_url for the user'"'"'s profile photo"}}'

echo "  -- sponsorship (Sessions 14.5–14.7) --"
patch_field sponsorship cause '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Where most needed","value":"general_care"},{"text":"Education","value":"education"},{"text":"Healthcare","value":"healthcare"},{"text":"Food","value":"food"},{"text":"Eid blessing","value":"eid_gift"}]}}}'
patch_field sponsorship visibility '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Anonymous","value":"anonymous"},{"text":"Show name","value":"named"}]}}}'
patch_field sponsorship queue_position '{"meta":{"interface":"input","note":"0 = active sponsor; >0 = waiting in queue at that slot"}}'
patch_field sponsorship queued_starts_at '{"meta":{"interface":"datetime"}}'
patch_field sponsorship queued_ends_at '{"meta":{"interface":"datetime"}}'
patch_field sponsorship queue_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Queued","value":"queued"}]}}}'
patch_field sponsorship shift_decision_required '{"meta":{"interface":"boolean"}}'
patch_field sponsorship shift_decision_required_at '{"meta":{"interface":"datetime"}}'
patch_field sponsorship shift_decision '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Accept","value":"accept"},{"text":"Transfer","value":"transfer"},{"text":"Refund","value":"refund"}]}}}'
patch_field sponsorship shift_decision_at '{"meta":{"interface":"datetime"}}'

echo ""

# ─── 5. Relations on new collections ───────────────────────────────
echo "=== 5. Register relations on new collections ==="

# child_proposal
post_relation child_proposal target_child  child
post_relation child_proposal bd_division   bd_division
post_relation child_proposal bd_district   bd_district
post_relation child_proposal Photo         directus_files
post_relation child_proposal created_by    directus_users
post_relation child_proposal approved_by   directus_users
post_relation child_proposal educational_organization school

# aid_delivery
post_relation aid_delivery child         child
post_relation aid_delivery sponsorship   sponsorship
post_relation aid_delivery photo         directus_files
post_relation aid_delivery delivered_by  directus_users
post_relation aid_delivery verified_by   directus_users

# task
post_relation task child       child
post_relation task assignee    directus_users
post_relation task created_by  directus_users
post_relation task verified_by directus_users

# audit_log
post_relation audit_log actor directus_users

# school
post_relation school bd_division bd_division
post_relation school bd_district bd_district
post_relation school created_by  directus_users

# child_intake_photo
post_relation child_intake_photo child       child
post_relation child_intake_photo proposal    child_proposal
post_relation child_intake_photo photo       directus_files
post_relation child_intake_photo uploaded_by directus_users
post_relation child_intake_photo reviewed_by directus_users

# child_document (the new `proposal` FK from Session 49)
post_relation child_document proposal child_proposal

# child existing-extensions
post_relation child uploaded_by_di          directus_users
post_relation child assigned_di             directus_users
post_relation child educational_organization school

# notification.created_by (Session 47)
post_relation notification created_by directus_users

echo ""

# ─── 6. Permissions ────────────────────────────────────────────────
echo "=== 6. Register permissions ==="

DI_POLICY=$(lookup_policy_id "Data Inputter") || exit 1
ADMIN_POLICY=$(lookup_policy_id "Admin") || exit 1
echo "  DI policy:    $DI_POLICY"
echo "  Admin policy: $ADMIN_POLICY"
echo ""

echo "  -- DI: child_proposal (full CRUD on own drafts) --"
# Session 56 — removed the `status: "draft"` preset. The original
# intent was "DI inserts default to draft", but Directus presets
# *force-override* values from the payload — so when the form
# submitted with status='pending_review' to advance the workflow,
# Directus silently rewrote it back to 'draft' and the row never
# entered admin's review queue. Hit on production 2026-05-17.
# The Postgres column already has `DEFAULT 'draft'` so omitted
# inserts still get the right default. `created_by: $CURRENT_USER`
# is preserved — that's the actual security boundary preventing
# DI users from spoofing ownership.
post_permission "$DI_POLICY" child_proposal create '"*"' 'null' '{"created_by":"$CURRENT_USER"}'
post_permission "$DI_POLICY" child_proposal read   '"*"' '{"created_by":{"_eq":"$CURRENT_USER"}}'
post_permission "$DI_POLICY" child_proposal update '"*"' '{"_and":[{"created_by":{"_eq":"$CURRENT_USER"}},{"status":{"_in":["draft","pending"]}}]}'

echo "  -- DI: aid_delivery --"
post_permission "$DI_POLICY" aid_delivery create '"*"' 'null' '{"status":"pending","delivered_by":"$CURRENT_USER"}'
post_permission "$DI_POLICY" aid_delivery read   '"*"' '{"delivered_by":{"_eq":"$CURRENT_USER"}}'

echo "  -- DI: task --"
post_permission "$DI_POLICY" task read '"*"' '{"assignee":{"_eq":"$CURRENT_USER"}}'
post_permission "$DI_POLICY" task update '["di_status"]' '{"assignee":{"_eq":"$CURRENT_USER"}}'

echo "  -- DI: school (Session 48a) --"
post_permission "$DI_POLICY" school read   '"*"'
post_permission "$DI_POLICY" school create '"*"'

echo "  -- DI: child_intake_photo (Session 48b) --"
post_permission "$DI_POLICY" child_intake_photo read   '"*"' '{"uploaded_by":{"_eq":"$CURRENT_USER"}}'
post_permission "$DI_POLICY" child_intake_photo create '"*"'
post_permission "$DI_POLICY" child_intake_photo update '["caption","display_order"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'
post_permission "$DI_POLICY" child_intake_photo delete '"*"' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

echo "  -- DI: child_document (Session 49) --"
post_permission "$DI_POLICY" child_document read   '"*"' '{"uploaded_by":{"_eq":"$CURRENT_USER"}}'
post_permission "$DI_POLICY" child_document create '"*"'
post_permission "$DI_POLICY" child_document update '["notes"]' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'
post_permission "$DI_POLICY" child_document delete '"*"' '{"_and":[{"uploaded_by":{"_eq":"$CURRENT_USER"}},{"status":{"_eq":"pending"}}]}'

echo "  -- DI: notification (read own + mark own read) --"
post_permission "$DI_POLICY" notification read   '"*"' '{"recipient":{"_eq":"$CURRENT_USER"}}'
post_permission "$DI_POLICY" notification update '["read","read_at"]' '{"recipient":{"_eq":"$CURRENT_USER"}}'

echo ""
echo "  -- Admin: child_proposal --"
post_permission "$ADMIN_POLICY" child_proposal read   '"*"'
post_permission "$ADMIN_POLICY" child_proposal update '"*"'
post_permission "$ADMIN_POLICY" child_proposal delete '"*"'

echo "  -- Admin: aid_delivery --"
post_permission "$ADMIN_POLICY" aid_delivery read   '"*"'
post_permission "$ADMIN_POLICY" aid_delivery update '"*"'
post_permission "$ADMIN_POLICY" aid_delivery delete '"*"'

echo "  -- Admin: task --"
post_permission "$ADMIN_POLICY" task create '"*"'
post_permission "$ADMIN_POLICY" task read   '"*"'
post_permission "$ADMIN_POLICY" task update '"*"'
post_permission "$ADMIN_POLICY" task delete '"*"'

echo "  -- Admin: audit_log (read-only — system writes only) --"
post_permission "$ADMIN_POLICY" audit_log read '"*"'

echo "  -- Admin: school --"
post_permission "$ADMIN_POLICY" school read   '"*"'
post_permission "$ADMIN_POLICY" school create '"*"'
post_permission "$ADMIN_POLICY" school update '"*"'
post_permission "$ADMIN_POLICY" school delete '"*"'

echo "  -- Admin: child_intake_photo --"
post_permission "$ADMIN_POLICY" child_intake_photo read   '"*"'
post_permission "$ADMIN_POLICY" child_intake_photo update '"*"'
post_permission "$ADMIN_POLICY" child_intake_photo delete '"*"'
post_permission "$ADMIN_POLICY" child_intake_photo create '"*"'

echo "  -- Admin: child_document --"
post_permission "$ADMIN_POLICY" child_document read   '"*"'
post_permission "$ADMIN_POLICY" child_document update '"*"'
post_permission "$ADMIN_POLICY" child_document delete '"*"'
post_permission "$ADMIN_POLICY" child_document create '"*"'

echo ""

# ─── 7. Storage preset: intake-locked (Session 52c + 52d) ──────────
echo "=== 7. Register storage preset: intake-locked ==="

URL="$URL" ADMIN="$ADMIN" python3 << 'PYEOF'
import json, os, sys, urllib.request, urllib.error
URL = os.environ["URL"].rstrip("/")
ADMIN = os.environ["ADMIN"]

def req(method, path, body=None):
    r = urllib.request.Request(
        f"{URL}{path}",
        method=method,
        headers={"Authorization": f"Bearer {ADMIN}", "Content-Type": "application/json"},
        data=(json.dumps(body).encode() if body is not None else None),
    )
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode("utf-8")
            return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")

# 1. GET current presets
status, body = req("GET", "/settings?fields=storage_asset_presets")
if status != 200 or not isinstance(body, dict):
    print(f"  ERR: GET /settings returned {status}: {body}")
    sys.exit(1)
existing = (body.get("data") or {}).get("storage_asset_presets") or []
print(f"  existing presets: {len(existing)} (keys: {[p.get('key') for p in existing]})")

# 2. Replace any prior intake-locked entry
filtered = [p for p in existing if p.get("key") != "intake-locked"]
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

# 3. PATCH
status, body = req("PATCH", "/settings", {"storage_asset_presets": updated})
if status != 200:
    print(f"  ERR: PATCH /settings returned {status}: {body}")
    sys.exit(1)
print(f"  PATCH /settings: OK ({status})")

# 4. VERIFY
status, body = req("GET", "/settings?fields=storage_asset_presets")
ours = [p for p in (body.get("data") or {}).get("storage_asset_presets", []) if p.get("key") == "intake-locked"]
if not ours:
    print("  ERR: preset NOT in settings after PATCH")
    sys.exit(1)
print("  verified: intake-locked preset registered")
PYEOF

echo ""

# ─── Summary ───────────────────────────────────────────────────────
echo "============================================================"
echo "Summary:"
echo "  OK:    $OK"
echo "  SKIP:  $SKIP  (already exists)"
echo "  WARN:  $WARN  (column not in cache — restart Directus + re-run)"
echo "  ERR:   $ERR"
echo "============================================================"
echo ""
echo "Next: bash migrations/deploy-2026-05-17/003-cleanup-checks.sh"

if [ $ERR -gt 0 ]; then
  exit 1
fi
exit 0
