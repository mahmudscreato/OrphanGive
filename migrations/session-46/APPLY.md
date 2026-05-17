# Session 46-fix-2 — apply steps

Two architectural gaps from Session 41-v3 / 44 are closed by this commit:

1. **`child_proposal` was missing 17 fields** that exist on `child` —
   so DI could only edit ~30% of a child profile. This migration adds
   them.
2. **Admin "approving" a proposal didn't copy proposal fields onto the
   child** — the status flag flipped but no data moved. The new
   `/api/admin/proposals/[id]/approve` endpoint performs the copy.

Apply order matters: schema first, then Directus restart so the new
columns are visible to the SDK, then the bootstrap registration so the
columns get nice metadata in Directus admin UI, then a Next.js dev
server restart to pick up the new TypeScript types.

---

## 1. Apply the SQL migration

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
docker exec -i og-postgres-local psql -U directus -d directus < \
  migrations/session-46/001-child-proposal-extend.sql
```

Idempotent (`ADD COLUMN IF NOT EXISTS`). Safe to re-apply.

Expected output: `BEGIN ... ALTER TABLE × 17 ... COMMIT`.

---

## 2. Restart Directus

So it re-introspects the schema and exposes the new columns via REST.

```bash
docker restart og-directus-local
sleep 5
curl -s -o /dev/null -w "Directus health: HTTP %{http_code}\n" \
  http://localhost:8055/server/info
```

Expect `HTTP 200`.

---

## 3. Register the new fields in Directus admin metadata

This makes the new fields appear with proper enum dropdowns, types,
and notes inside the Directus admin UI. Without this step the columns
work via REST but show up as plain text inputs in admin.

```bash
cd ~/Desktop/Claude/OrphanGive/public-site/bootstrap
npm run v3-register-collections
```

The script is idempotent — existing fields are skipped, only the new
ones get registered. Watch for the `child_proposal` block in the
output: `bd_district`, `photo_consent`, `blood_group`, etc. should all
register as new fields (or "exists, skipped" if you've run this before).

If the script complains about missing env, confirm `bootstrap/.env`
points at `http://localhost:8055` and uses an admin user (e.g.
`mahmuds.creato@gmail.com`).

---

## 4. Restart Next.js dev server

So it picks up the new TypeScript types and the regenerated form
schema.

```bash
cd ~/Desktop/Claude/OrphanGive/public-site
# Ctrl+C the running `npm run dev`, then:
npm run dev
```

---

## 5. Smoke test the DI form

1. Sign in at `http://localhost:3000/di/login` as
   `data_in@input.com`.
2. Open Fahim Khan → **Edit profile**.
3. Confirm the form now shows **10 sections**: Identity, Location,
   Education, Story, Support plan, Health, Family, Socioeconomic,
   Guardian, Field visit.
4. Confirm the **photo consent checkbox** in section 1 starts
   **unticked** every time you load the form (even on edit). Tick it.
5. In section 2, change the **division** dropdown — confirm the
   **district dropdown** below resets and re-populates with districts
   for the new division. Helper text "District reset because division
   changed" appears.
6. In section 6, change **disability status** from "None" to
   "Physical" — confirm the **disability notes** textarea appears.
   Change back to "None" — it disappears.
7. Fill in some new fields (blood group, household size, guardian
   relationship). Submit.
8. Open Directus admin → child_proposal → newest row. Confirm all the
   new columns are populated.

---

## 6. Smoke test the admin approval endpoint

The brief explicitly defers admin UI to Sessions 47+. For V1, Mahmud
uses curl. There are two auth paths:

### 6a. Get an admin session cookie

```bash
# Replace email/password with your real admin credentials.
curl -i -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mahmuds.creato@gmail.com","password":"<your password>"}'
```

Look for the `set-cookie: admin_access_token=...` header in the
response. Save the cookie value:

```bash
COOKIE='admin_access_token=<paste from response>'
```

### 6b. Find a pending proposal id

```bash
URL=$(grep '^NEXT_PUBLIC_DIRECTUS_URL=' .env.local | cut -d= -f2-)
ADMIN=$(grep '^DIRECTUS_SERVER_TOKEN=' .env.local | cut -d= -f2-)
curl -s "$URL/items/child_proposal?fields=id,proposal_type,target_child,display_name,status&filter%5Bstatus%5D%5B_eq%5D=pending&limit=5" \
  -H "Authorization: Bearer $ADMIN" | python3 -m json.tool
```

Pick a `pending` proposal id.

### 6c. Approve it

```bash
PROP_ID="<proposal id from above>"
curl -i -X POST "http://localhost:3000/api/admin/proposals/$PROP_ID/approve" \
  -H "Cookie: $COOKIE"
```

Expected response: `200` with body
`{"proposalId":"...","targetChildId":"...","appliedFields":[...],"operation":"update"}`.

Then confirm the copy actually happened:

```bash
TARGET_ID="<target_child id from response>"
curl -s "$URL/items/child/$TARGET_ID?fields=display_name,blood_group,household_size,guardian_relationship,photo_consent" \
  -H "Authorization: Bearer $ADMIN" | python3 -m json.tool
```

The values should match what the proposal had.

### 6d. (Optional) Reject a proposal

```bash
curl -i -X POST "http://localhost:3000/api/admin/proposals/$PROP_ID/reject" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Needs clearer photo of the child."}'
```

Expected: `200` with `{"proposalId":"..."}`. The proposal row's
`rejection_reason` is populated; no child mutation happens.

### 6e. Confirm DI sees the result

Refresh `http://localhost:3000/di/submissions` while signed in as
`data_in@input.com`. The previously-pending row should now show:
- Approved: green Approved pill, "Reviewed by admin on …" line
- Rejected: slate Rejected pill + reason line

---

## 7. Production deploy notes (later)

When the branch lands on the VPS:

1. Apply `001-child-proposal-extend.sql` on production Postgres
   (same `ADD COLUMN IF NOT EXISTS` shape — safe).
2. Restart production Directus container.
3. Run `npm run v3-register-collections` on the bootstrap container
   pointed at the production Directus URL (using a production admin
   credential).
4. Deploy the public-site code via the existing CI flow.
5. Smoke-test the admin approval endpoint against a production
   proposal before announcing the surface to staff.
