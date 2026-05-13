# Session 41 — `system` Directus user setup

The `audit_log.actor_id` column is `NOT NULL` and references
`directus_users(id)`. The `/api/cron/expire-pending-changes` route
needs an actor to attribute its writes to. Per spec section 4.2, the
recommended pattern is a dedicated `system` Directus user that
non-human writers (crons, webhooks, future automations) reference.

This is a one-time setup step. After this is done, every cron and
internal automation can use the same `SYSTEM_USER_ID`.

## 1 — Create the user in Directus admin

1. Open Directus Admin → **Settings → Users → + Create User**
2. Fill in:
   - **First name:** `System`
   - **Last name:** `Cron`
   - **Email:** `system+cron@orphangive.org` (no real inbox needed —
     Directus uses email as the unique key, not for delivery)
   - **Password:** generate a random 32-char string and **discard it**
     after creation. The system user must never be used for
     interactive login. Add a note in `OPS_RUNBOOK.md` that this
     account has no recovery path — recreate the user if needed.
   - **Role:** create a new role called `system` with:
     - App access: **false**
     - Admin access: **true** (system writes need to bypass
       collection-level permissions; the role itself is gate-kept by
       not handing the password to anyone)
   - **Status:** active
3. Save the user.

## 2 — Capture the UUID

In the Directus admin, open the user you just created. The URL will
contain the UUID:

```
https://admin.orphangive.org/admin/users/<UUID>
                                        ^^^^^^
```


Or pull it via the API:

```bash
curl -s https://admin.orphangive.org/users \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" \
  | jq '.data[] | select(.email == "system+cron@orphangive.org") | .id'
```


## 3 — Add to `.env.local`

Add this line to `.env.local` on the VPS (the deployed Next.js
container reads from the same file via docker-compose env_file):

```
SYSTEM_USER_ID=<the UUID from step 2>
```


And add a comment in `.env.local.example` (if it exists; otherwise
add to `DEV_TOOLS.md` or a new `ENV_VARS.md`) documenting the var:

```
# Session 41 — UUID of the dedicated `system` Directus user used
# by cron routes for audit_log attribution. See migrations/session-
# 41/003-system-user-note.md. Do NOT share this value or hand out
# the system user's password.
SYSTEM_USER_ID=
```


## 4 — Restart the app container

After updating `.env.local`:

```bash
cd /opt/orphangive
docker compose up -d app
```


(Use `up -d` rather than `restart` so the env_file change is
re-applied. `restart` keeps the previously-loaded env.)

## 5 — Verify

Hit the cron route manually with the right secret:

```bash
curl -X POST https://orphangive.org/api/cron/expire-pending-changes \
  -H "Authorization: Bearer $CRON_SECRET"
```


Expected response when there's nothing to expire:

```json
{ "expired_count": 0, "expired_ids": [], "duration_ms": 42 }
```


If you see `"error": "SYSTEM_USER_ID not configured"`, the env var
hasn't propagated to the container — re-do step 4.

## Why a real Directus user, not a NULL or sentinel

Two reasons:

1. **Foreign key honesty.** `audit_log.actor_id` is a real FK. If we
   made it nullable to allow NULL for system writes, we'd lose the
   ability to filter the audit log by actor at the query level
   (`WHERE actor_id IS NULL` is OK but doesn't compose with the rest
   of the audit query patterns the way a real UUID does).

2. **Audit clarity.** When admins look at the audit log in Directus,
   seeing a row attributed to a real user (System Cron, with a clear
   description) reads more naturally than a row with no actor at
   all. The `actor_role` column already says `system`, but the named
   user gives the row a face.
