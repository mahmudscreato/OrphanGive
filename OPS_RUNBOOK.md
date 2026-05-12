# OrphanGive — operations runbook

Reference card for common operational tasks. Written so that
someone non-technical can follow the steps with copy-paste, but
detailed enough that the engineer on-call also uses it.

If you're hitting a production incident right now, jump to
[BetterStack incident response](#betterstack-incident-response).

---

## Table of contents

- [Deploy procedure](#deploy-procedure)
- [Rollback procedure](#rollback-procedure)
- [BetterStack incident response](#betterstack-incident-response)
- [Maintenance mode](#maintenance-mode)
- [Database operations](#database-operations)
- [Stripe operations](#stripe-operations)
- [Email operations](#email-operations)
- [Privacy / safeguarding incident response](#privacy--safeguarding-incident-response)
- [Common Directus tasks](#common-directus-tasks)
- [Run the legacy sponsorship cleanup](#run-the-legacy-sponsorship-cleanup)

---

## Deploy procedure

### Standard deploy (no schema changes, no env-var changes)

SSH into the VPS, pull, rebuild, restart, verify.

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive
git pull origin main
docker compose build app
docker compose up -d app
```

Verify in this order:

```sh
# 1. Container is healthy
docker compose ps app
# STATUS column should show "healthy" within 60s (HEALTHCHECK
# in the Dockerfile probes /api/health every 30s).

# 2. The app responds at the application port
curl -fsSL http://localhost:3000/api/health
# Expect: HTTP 200 + a JSON body. Anything else = abort, see
# rollback below.

# 3. The reverse proxy is forwarding correctly (do this from
#    outside the VPS, e.g. your laptop)
curl -fsSL https://orphangive.org/api/health
```

### Deploy with env-var changes

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive

# Edit env vars
vim app.env
# Add / change / remove variables. Save.

# Rebuild + restart picks up the changes
docker compose build app
docker compose up -d app

# Health check as above
docker compose ps app
curl -fsSL http://localhost:3000/api/health
```

**NEXT_PUBLIC_* values bake into the build at compile time.** If
you add or change a `NEXT_PUBLIC_*` variable, you must rebuild
(not just restart). Plain server-side env vars (no
`NEXT_PUBLIC_` prefix) only need a restart.

### Deploy with new dependencies

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive
git pull origin main

# `--no-cache` forces re-running `npm ci` inside the Docker
# build (otherwise Docker reuses the cached deps layer)
docker compose build --no-cache app
docker compose up -d app
```

Use `--no-cache` whenever `package.json` or `package-lock.json`
changed in the pull.

---

## Rollback procedure

### Soft rollback (revert the merge, redeploy)

```sh
# On your local machine
git log --oneline main -10   # find the merge commit to revert
git revert -m 1 <merge-commit-hash>
git push origin main

# Then on the VPS, deploy as normal
ssh deploy@<orphangive-vps>
cd /opt/orphangive
git pull origin main
docker compose build app
docker compose up -d app
```

`-m 1` tells git to revert to the merge's first parent (the
previous state of main).

### Hard rollback (force-reset main to a previous commit)

**Use only in the first few minutes after a bad deploy, before
anyone else has pulled.**

```sh
# Locally
git log --oneline main -10
git reset --hard <last-good-commit>
git push --force-with-lease origin main

# Then deploy on the VPS as normal
```

### Emergency rollback at the container level

If `git pull` was clean but the container itself won't start:

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive

# Each previous build is tagged in Docker's local registry
docker images orphangive
# Find a previous tag from a known-good deploy

# Restart with that tag
docker compose up -d app --no-recreate   # or specify the image
```

---

## BetterStack incident response

### 502 Bad Gateway

The reverse proxy can't reach the app container.

```sh
ssh deploy@<orphangive-vps>
docker compose ps app
```

- **Container shows `Exited`:** the app crashed. Check logs:
  ```sh
  docker compose logs --tail=200 app
  ```
  Common causes: Directus is unreachable on startup (env var
  wrong), or an unhandled exception during the `app-mounted`
  phase. Restart: `docker compose up -d app`.
- **Container shows `Restarting`:** repeated crash loop. Logs
  will tell you why. Don't keep restarting blindly — fix the
  cause first.
- **Container is `Healthy` but proxy still returns 502:** the
  proxy config drifted. Check the Caddy / NGINX / Cloudflare
  config for the upstream port and restart the proxy service.

### 503 Service Unavailable

The app responded but with an error status, OR the upstream
proxy returned 503 because it judged the upstream unhealthy.

```sh
ssh deploy@<orphangive-vps>
docker compose logs --tail=200 app | grep -i error
```

Common causes: Directus is down (most of the app's data layer
hangs); rate-limit on a third-party API (Stripe, Resend) is
returning 5xx. Check the dependency dashboards.

### Sustained high latency without errors

The container is healthy, the proxy is forwarding, but pages
load slowly. Most likely:
- Directus is slow (large query without index)
- The VPS is CPU-pegged (check `top` / `htop`)
- Cold-start cost on a dynamic route after a long idle period

```sh
# Quick latency probe from the VPS itself
curl -w "\n@time_total=%{time_total}s\n" -fsSL http://localhost:3000/api/health -o /dev/null

# If the local probe is fast but external is slow, the
# reverse proxy or DNS is the bottleneck, not the app.
```

---

## Maintenance mode

### Activate maintenance via the in-app route

When `session-25-error-pages` is merged into main, the
`/maintenance` route renders a self-contained "we're making
improvements" page. It does NOT depend on Directus or DB —
designed to render even if the rest of the data layer is down.

To route all traffic there during planned maintenance, configure
your reverse proxy (NGINX, Caddy, or Cloudflare worker) to
rewrite all non-`/maintenance` / non-`/api/health` requests to
`/maintenance`. Example Cloudflare worker:

```js
addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname === "/maintenance" || url.pathname === "/api/health") {
    return; // pass through
  }
  event.respondWith(Response.redirect(`${url.origin}/maintenance`, 302));
});
```

### Set an expected return time

Edit `/opt/orphangive/app.env`:

```sh
NEXT_PUBLIC_MAINTENANCE_RETURN_AT="11:00 PM Asia/Dhaka"
```

Then **rebuild + restart** (NEXT_PUBLIC_ values bake in at build):

```sh
docker compose build app
docker compose up -d app
```

The `/maintenance` page renders the chip "Expected back by 11:00
PM Asia/Dhaka" when this env var is set. Unset (or empty) → the
chip is omitted.

### Hard-down scenario (everything is broken)

If the Next.js app itself is dead and you can't render
`/maintenance` from inside it, serve a static HTML at the edge:

- **Cloudflare:** worker route returning a hard-coded HTML
  string for every URL. Keep the HTML simple — inline CSS,
  no external assets.
- **NGINX on the VPS, if Cloudflare isn't routing:** add a
  `location /` block that returns a static HTML file from disk.

---

## Database operations

The OrphanGive database is Postgres, running as a separate
container on the same VPS. Directus is the application layer
on top.

### Backup procedure

The repo includes `scripts/backup-postgres.sh` (legacy from
Session 12). Standard procedure:

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive
bash scripts/backup-postgres.sh
# Output: /opt/orphangive/backups/orphangive-YYYY-MM-DD.sql.gz
```

The script uses `pg_dump` with custom format and gzip. **Verify
the backup before assuming success:**

```sh
ls -lah /opt/orphangive/backups/ | tail -5
# Recent file should be non-zero, ~MBs in size depending on
# data volume.
```

**Off-host backup:** copy the latest backup off the VPS
regularly (cron + rsync to S3 / Backblaze / a separate VPS).
On-host backups are useless if the VPS disk dies.

### Restore procedure

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive

# Find the backup to restore
ls -lah /opt/orphangive/backups/

# Stop the app so Directus can't write during restore
docker compose stop app directus

# Restore (gunzip + psql)
gunzip -c backups/orphangive-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres \
  psql -U postgres -d orphangive

# Restart
docker compose up -d directus
docker compose up -d app

# Verify
curl -fsSL http://localhost:3000/api/health
```

**Restore is destructive.** It replaces the current DB state
with the backup. Take a fresh backup of the current state first
in case you need to roll back the restore.

### Directus admin access

The Directus admin panel runs on a separate subdomain (or port,
depending on the deploy). Access via:

```
https://admin.orphangive.org      (production)
http://localhost:8055            (dev — Directus default port)
```

Credentials live in the Directus admin user table — set by
Mahmud during initial deploy. Reset via:

```sh
docker compose exec directus npx directus users passwd \
  --email admin@orphangive.org --password <new-password>
```

---

## Stripe operations

### Where to monitor webhook events

Stripe dashboard → **Developers → Webhooks** → click your
endpoint (`https://orphangive.org/api/webhooks/stripe`). The
event log shows every event Stripe attempted to deliver and
your endpoint's response.

Look for:
- **Failed deliveries** — endpoint returned 4xx or 5xx
- **Retried events** — Stripe retries with exponential backoff
- **Idempotency violations** — same event delivered multiple
  times (your endpoint should idempotent-no-op the second time)

### How to refund a donation

Refunds happen in Stripe, not in OrphanGive's admin. Per
Session 26 refund policy:

1. Verify the donor's eligibility (within 48h, fraud, etc.)
2. In Stripe dashboard → **Payments** → find the charge by date
   + amount + last 4 of card
3. Click **Refund** → choose full or partial → submit
4. Stripe will email the donor automatically with the refund
   confirmation; you don't need to also send a separate email
5. Record the refund in your tracker — there's no automatic
   OrphanGive-side record yet (`sponsorship.status` does NOT
   auto-update on a refund)

**If the refunded donation was a monthly sponsorship:** also
cancel the subscription in Stripe so future months don't get
charged. Use **Customers → find the customer → Subscriptions →
Cancel** in the Stripe dashboard. The webhook handler will
update OrphanGive's `sponsorship` row to status='cancelled'.

### How to handle a chargeback

A chargeback is a donor disputing the charge with their bank.
Stripe will email you when one is filed.

1. **Don't refund** — that's separate. A chargeback IS the
   refund mechanism the bank uses.
2. Stripe gives you a window (typically 7 business days) to
   respond with evidence
3. Evidence to gather:
   - The donor's account creation date + IP
   - The verification email confirming their email address
   - The original charge confirmation email
   - The donor's dashboard activity (did they sign in after the
     charge?)
4. Submit evidence via the Stripe dashboard's dispute interface
5. If you lose the chargeback, the donor's account should be
   reviewed for fraud markers and possibly suspended

### Webhook idempotency (same event multiple times)

Stripe retries webhook deliveries until your endpoint returns
2xx. If your endpoint returned 5xx once, Stripe will deliver
the same event again later. Your handler must be idempotent.

The current implementation uses `stripe_event` records keyed by
event ID — see `markStripeEventProcessed` in
`src/lib/stripe-events.ts`. The webhook route checks for an
existing row before processing and short-circuits if found.

If you see duplicate state changes (e.g. a sponsorship marked
cancelled twice), check the `stripe_event` collection in
Directus — there should be one row per event ID. If multiple
rows exist for the same ID, the dedup logic is failing.

---

## Email operations

OrphanGive uses [Resend](https://resend.com) for transactional
email. All email send happens through `src/lib/email.ts` →
`sendEmail()`.

### Verify a transactional email actually sent

Resend dashboard → **Logs** → filter by recipient. Each send
shows:
- Delivered, Bounced, Failed, or Complained
- Open / click tracking (if enabled per-message)
- The exact HTML body that was sent

### Bounce handling

A bounce means the recipient's mail server rejected the email.
Categories:
- **Hard bounce:** address doesn't exist. Resend marks the
  address as undeliverable and won't send to it again. Action:
  contact the donor by another channel (phone, social) to
  update.
- **Soft bounce:** temporary issue (mailbox full, server down).
  Resend retries. If it bounces 3 days running, treat as hard.

To check whether an address is on Resend's suppression list:
Resend dashboard → **Audiences → Suppressions**.

### DKIM / SPF / DMARC verification

Once a year, verify these DNS records still match what Resend
expects. Resend dashboard → **Domains → orphangive.org**
shows the required DNS records and whether each is currently
valid.

```sh
# From any machine with dig
dig +short TXT orphangive.org             # SPF
dig +short TXT _dmarc.orphangive.org      # DMARC
dig +short CNAME resend._domainkey.orphangive.org  # DKIM
```

A missing or mis-pointed DKIM record is the most common reason
emails start landing in spam.

---

## Privacy / safeguarding incident response

### Photo consent withdrawal request

Per the Session 26 safeguarding draft: **honoured within 24
hours.**

1. Receive the request via email at `support@orphangive.org`
   (or directly to the safeguarding lead)
2. Identify the affected child + the specific photo(s)
3. In Directus admin → `child` collection → find the child →
   set the `Photo` field to null OR update the
   `photo_consent` boolean to false
4. The public surface re-renders within seconds (force-dynamic
   on `/children` + `/children/[id]`)
5. Send a confirmation reply to the requester within 24h of the
   request
6. Log the incident internally for the annual safeguarding
   review

### Urgent safeguarding concern

Per the Session 26 safeguarding draft: **action within 48
hours for urgent matters.**

1. Receive concern at `support@orphangive.org` with subject
   beginning "Safeguarding:" — these inbox-route to the
   designated safeguarding lead
2. Acknowledge receipt within one business day
3. The safeguarding lead at OrphanGive coordinates with the
   designated safeguarding officer at Children's Heaven Trust
4. Urgent cases (immediate risk): **suspend the child's
   profile from the public surface immediately** by setting
   `status = 'inactive'` in Directus on the `child` row.
   Investigate after the child is protected.
5. Document the investigation, the action taken, and the
   outcome
6. Where Bangladesh law requires reporting to authorities
   (Department of Social Services, police, etc.), report

### Donor data deletion request

Per the Session 26 privacy draft: **deleted within 30 days.**

1. Verify the request originates from the email address on
   the donor's account
2. Confirm with the donor that they understand: donation
   history is retained in aggregate form for 7 years (tax/audit
   obligation) but personal-identifying details will be removed
3. In Directus admin → `donor` collection → set:
   - `first_name = "Deleted"`
   - `last_name = "Donor"`
   - `email = "deleted+<donor-id>@orphangive.org"` (so the row
     stays unique without leaking the real address)
   - `og_phone = null`, `og_profile_photo_url = null`,
     `og_country = null`
   - `status = 'closed'`
4. In Stripe → cancel any active subscriptions for the
   customer → delete the customer object after a cooling-off
   period (Stripe retains some metadata indefinitely for
   regulatory reasons)
5. Send confirmation to the donor when complete

---

## Common Directus tasks

Directus admin URL: `https://admin.orphangive.org` (or whatever
your prod admin domain is). Log in with admin credentials.

### Approve a new child profile

Children come in via Children's Heaven Trust's field team. New
rows land with `status='pending_review'` (or whatever the
intake state is).

1. Directus → `child` collection → filter by `status =
   pending_review`
2. Click the row → review every field, especially:
   - `display_name` (correct spelling, appropriate for public)
   - `Photo` (consent documented? per-photo consent for the
     specific image being published?)
   - `bd_division` + `bd_district` (set; district stays
     protected, division is public)
   - `story` (dignified, no identifying details, no school
     name, no address)
   - Encrypted sensitive fields populated (
     `full_address_encrypted`,
     `guardian_full_name_encrypted`,
     `school_name_encrypted`,
     `guardian_contact_encrypted`)
3. If all good: set `status = 'active'` and `approved_at` to
   the current timestamp
4. Save
5. The child appears on `/children` immediately (the route is
   `force-dynamic`)

### Mark a child profile inactive

```
Directus → child → find row → status = 'inactive' → save
```

The child disappears from `/children` immediately. Active
sponsorships remain in the donor's dashboard but no new
sponsors can be added.

### Approve a donor reveal request

A donor requested access to identifying details for a child
they sponsor.

1. Directus → `reveal_request` collection → filter by
   `status = 'pending'`
2. Click the row → verify:
   - The requesting donor has at least one active sponsorship
     for the named child
   - The reason given is reasonable
   - No safeguarding flag on either the donor or the child
3. If approving: set `status = 'approved'`, set `decided_at`
   to now, and `expires_at` to now + 90 days
4. Save
5. The donor receives an email automatically via the existing
   `reveal-approved` template

### Create a donor account manually

For internal testing or to onboard a partner organisation:

```
Directus → donor collection → New Item
  - email: their-email@example.com
  - first_name, last_name
  - status: 'active' (or 'pending_verification' if you want
    them to go through the OTP flow)
  - og_admin_approval_status: 'approved'
  - og_admin_approved_at: now
  - og_agreed_to_terms_at: now (only if they have actually
    agreed)
Save.
```

Then send them the sign-in link manually — they can use the
magic-link flow without needing to remember a password.

---

## Run the legacy sponsorship cleanup

Session 22 shipped a one-time cleanup script for 30 rows from
the May 6–7 pre-fix window where `payment_schedule` is NULL
but `stripe_subscription_id` is set.

```sh
ssh deploy@<orphangive-vps>
cd /opt/orphangive

# 1. Dry run first — prints a markdown table of every row that
#    would be updated, but writes nothing
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" \
  /opt/orphangive/app.env | xargs)

node scripts/cleanup-legacy-null-schedule.mjs --dry-run

# 2. Review the table. Verify:
#    - Total rows = 30 (or close — may have changed since the audit)
#    - All rows show status = 'cancelled' or 'paused'
#    - No row shows status = 'active'
#    - created_at column = May 6-7 dates

# 3. If happy, run with --confirm
node scripts/cleanup-legacy-null-schedule.mjs --confirm

# 4. Verify after:
node scripts/cleanup-legacy-null-schedule.mjs --dry-run
#    Should now report "Nothing to do — exiting."
```

The script is **single-execution by design** — `--confirm`
writes the change, then subsequent dry-runs find nothing
because the criteria no longer match. Safe to leave in the repo
indefinitely.

---

## Where to find more detail

- **Per-page brand-pass intent:** the session ship reports in
  this conversation (Sessions 16–28)
- **Merge order if multiple WIP branches are pending:**
  [MERGE_PLAYBOOK.md](MERGE_PLAYBOOK.md) (Session 29)
- **Legal page drafts:** branch `session-26-legal-pages`
  (DEFERRED pending counsel review)
- **Pre-launch checklist:** [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)
  (Session 30 — this same commit)

When in doubt: ask in the engineering chat, or roll back. A
slow, careful operation is always better than a fast, broken
one on a charity site for vulnerable children.
