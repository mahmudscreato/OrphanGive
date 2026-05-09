# OrphanGive cron jobs

## Overview

Cron jobs run as authenticated POSTs from the Hostinger VPS (where
Directus lives) to `/api/cron/*` routes on the production app.
Routes verify a `CRON_SECRET` bearer token and 401 anything else.

Cron tasks live in `src/app/api/cron/*/route.ts`. Each route is
self-contained, idempotent, and logs progress with a stable prefix
(`[cron/<name>]`) so the dev log + production logs stay greppable.

## Active crons

### promote-queue (daily, 02:00 UTC)

Sponsor-queue safety net. Three responsibilities:

1. **Promote missed promotions.** When the Stripe webhook for
   `customer.subscription.deleted` fails to reach the box, the
   queued head doesn't activate via the normal real-time path.
   This sweep finds queued rows whose `queued_starts_at` has
   already passed and calls `promoteQueue(childId)` for each
   affected child. `promoteQueue` is idempotent and no-ops when the
   active row hasn't actually ended.

2. **Auto-accept stale shift decisions.** When an active sponsor
   extends their commitment, every queued donor receives a
   `SponsorshipQueueShiftEmail` with three options
   (Accept / Transfer / Refund). If the donor doesn't respond
   within 14 days, the cron sets `shift_decision='accept'`,
   clears `shift_decision_required`, and stamps `shift_decision_at`.

3. **Cleanup zombie queued rows.** For queued rows whose Stripe
   sub is in a terminal state (`canceled`, `incomplete_expired`,
   or vanished entirely), flip our row to `cancelled` and cascade
   the queue. Mirror of the `f1f2b29` zombie-repair script but
   continuous — catches new drift as it happens.

**Crontab entry on Hostinger VPS:**

```cron
0 2 * * * curl -X POST -H "Authorization: Bearer ${CRON_SECRET}" \
  https://orphangive.org/api/cron/promote-queue
```

**Local dev exercise:**

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/promote-queue
```

Returns JSON: `{ promoted, auto_accepted, cleaned, errors, duration_ms }`.

## Setup on Hostinger VPS

1. SSH to the VPS:

   ```sh
   ssh root@<vps-host>
   ```

2. Set `CRON_SECRET` in the system environment. The recommended
   path is `/etc/cron.d/orphangive` with environment variables
   set inline (cron doesn't read shell login files):

   ```cron
   CRON_SECRET=<random-32-char-string>
   0 2 * * * root curl -X POST -H "Authorization: Bearer ${CRON_SECRET}" https://orphangive.org/api/cron/promote-queue >> /var/log/orphangive-cron.log 2>&1
   ```

   Alternative: edit the root crontab via `crontab -e` and put
   the env var assignment at the top of the file.

3. Verify the next run:

   ```sh
   tail -F /var/log/orphangive-cron.log
   ```

   You should see the cron's HTTP response body each fire.

## Security

- `CRON_SECRET` should be 32+ characters of cryptographic random.
  Generate with `openssl rand -hex 32`.
- The same value lives in the Hostinger VPS env (for the curl
  call) AND in the OrphanGive production env (for route auth).
  Routes return 401 for missing or invalid `Authorization: Bearer`
  headers.
- The route returns 500 if `CRON_SECRET` is unset on the server —
  fail-closed rather than allowing unauthenticated access by
  accident.
- Crons NEVER run on developer machines unless explicitly invoked
  via curl with the local `.env.local` `CRON_SECRET`. There is no
  automatic local-cron daemon.

## Adding a new cron

1. Create `src/app/api/cron/<name>/route.ts` with a POST handler.
2. Verify `Authorization: Bearer ${process.env.CRON_SECRET}` at the
   top; 401 otherwise.
3. Make the handler idempotent — running it twice in close
   succession should produce zero side effects on the second run.
4. Log progress with `[cron/<name>]` prefix on each meaningful
   action. Return a JSON summary (counts + duration_ms).
5. Add a section to this doc with the crontab entry + responsibilities.
6. Add the crontab entry to the Hostinger VPS.
