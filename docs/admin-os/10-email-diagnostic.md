# 10 — Email delivery diagnostic (production VPS)

**Date:** 2026-05-31
**Environment:** production VPS (`/opt/orphangive`, `og-app` container)
**Test recipient:** mahmud@printagraphy.com
**Code changes shipped:** none — cause is CONFIG-SIDE, not APP-SIDE.

---

## TL;DR

**Every email-sending path in the app is dead in production.**
Resend rejects every send with:

> `The associated domain with your API key is not verified. Please, create a new API key with full access or with a verified domain.`

The app code is correct. The configured `RESEND_API_KEY` is bound to an
unverified sending domain (or to a domain other than `orphangive.org`),
so Resend refuses every `from: hello@orphangive.org` send before it
leaves the system. No emails are being sent — and nothing arrives in the
inbox because nothing was ever dispatched.

**Classification: CONFIG-SIDE.** Mahmud fixes this in the Resend dashboard
+ Hostinger DNS, not in code. Action list at the bottom.

A separate (smaller) issue: `ADMIN_NOTIFY_EMAILS` is not set in production
`/opt/orphangive/app.env`, so admin notifications for new DI submissions
silently no-op even after the Resend fix lands.

---

## STEP 1 — Email-sending path inventory

Two distinct code-level paths to Resend:

| # | Helper | File | Resend call |
|---|---|---|---|
| A | `sendEmail()` | `src/lib/email.ts:46` | `client.emails.send({ from: RESEND_FROM_EMAIL, ... })` |
| B | `sendOtpEmail()` | `src/lib/donor-signup.ts:196` | `new Resend(key).emails.send({ from: RESEND_FROM_EMAIL, ... })` |

Path A is used by 17 call sites; path B only by donor signup OTP /
resend-OTP. Both read `RESEND_FROM_EMAIL` from env — so a single
Resend-side config failure breaks every path simultaneously.

### Path A callers — every email that flows through `sendEmail()`

| Trigger source | File | Recipient | Subject |
|---|---|---|---|
| Contact form (general) | `src/app/api/contact/route.ts:256` | `support@orphangive.org` | `Contact form: …` |
| Contact form (orphan referral) | same | `support@orphangive.org` | `[ORPHAN REFERRAL] …` |
| Contact form (volunteer) | same | `support@orphangive.org` | `[VOLUNTEER APPLICATION] …` |
| DI submission notify (admin) | `src/lib/di-notify.ts:164` | `ADMIN_NOTIFY_EMAILS` (csv) | `[OrphanGive admin] New …` |
| Checkout queue-join | `src/app/api/checkout/init/route.ts:689` | donor | `You're in line to sponsor …` |
| Donor self-pause | `src/app/api/sponsorship/[id]/pause/route.ts:100` | donor | `Your sponsorship of … is paused` |
| Donor self-cancel (active) | `src/app/api/sponsorship/[id]/cancel/route.ts:447` | donor | `Your sponsorship of … has ended` |
| Donor self-cancel (queued) | `src/app/api/sponsorship/[id]/cancel-queued/route.ts:216` | donor | (queued-cancel copy) |
| Donor extend | `src/app/api/sponsorship/[id]/extend/route.ts:689` | donor | `Your sponsorship of … has been extended` |
| Donor amount-modify | `src/app/api/sponsorship/[id]/modify-amount/route.ts:225` | donor | `Your sponsorship amount has been updated` |
| Donor queue-shift notice | `src/app/api/sponsorship/[id]/queue-shift/route.ts:246` | donor | (shift copy) |
| Cron — queue promotion | `src/app/api/cron/promote-queue/route.ts:204` | donor | `Your sponsorship of … is set to begin …` |
| Queue lib — activated | `src/lib/queue.ts:457` | donor | `Your sponsorship of … has begun` |
| Queue lib — new start date | `src/lib/queue.ts:624` | donor | `Your sponsorship of … has a new start date` |
| Admin pause | `src/app/api/admin/sponsorships/[id]/pause/route.ts:129` | donor | `… has been paused` |
| Admin cancel | `src/app/api/admin/sponsorships/[id]/cancel/route.ts:205` | donor | `… has ended` |
| Admin resume | `src/app/api/admin/sponsorships/[id]/resume/route.ts:130` | donor | `… has been resumed` |
| Admin refund | `src/app/api/admin/sponsorships/[id]/refund/route.tsx:217` | donor | `A refund has been issued …` |
| Admin send report | `src/app/api/admin/reports/[id]/send/route.ts:179` | donor | (report-delivery copy) |
| Dev send-test (gated `NEXT_PUBLIC_DEV_TOOLS_ENABLED=true`) | `src/app/api/dev/send-test-email/route.ts:66,144` | hard-coded `mahmud@printagraphy.com` | `[TEST] …` |

### Path A — internal-route fan-out (called from Stripe webhook via `email-triggers.ts`)

`src/lib/email-triggers.ts` self-fetches these internal routes through
loopback (`http://localhost:${PORT}`) with `INTERNAL_API_TOKEN` auth.
The routes themselves call `sendEmail()` — so they're Path A under the
hood, just routed through a fetch hop.

| Internal route | Subject | Triggered by |
|---|---|---|
| `/api/internal/email/sponsorship-welcome` | `Thank you, … — your sponsorship begins today` | Stripe webhook `invoice.paid` / `payment_intent.succeeded` |
| `/api/internal/email/monthly-receipt` | `Receipt — Month YYYY sponsorship of …` | Stripe webhook (only when `createPaymentIfMissing` returns `created=true`) |
| `/api/internal/email/campaign-thank-you` | (campaign copy) | Stripe webhook for child-less (campaign) sponsorships |
| `/api/internal/email/sponsorship-cancelled` | `Your sponsorship of … has ended` (or refund variant) | Stripe `charge.refunded` (via `fireRefundEmail`) |
| `/api/internal/email/sponsorship-paused` | `Your sponsorship of … is paused` | Directus Flow (legacy — disabled per session 14.5b) |
| `/api/internal/email/sponsorship-modified` | `Your sponsorship amount has been updated` | Directus Flow (legacy) |
| `/api/internal/email/sponsorship-extended` | `Your sponsorship of … has been extended` | Directus Flow (legacy) |
| `/api/internal/email/donor-approved` | `Welcome to OrphanGive, …` | Directus Flow on `directus_users.approval_status='approved'` |
| `/api/internal/email/reveal-approved` | `Your reveal request was approved` | Directus Flow on `reveal_request.status='approved'` |
| `/api/internal/email/reveal-denied` | `Your reveal request — update from our team` | Directus Flow on `reveal_request.status='denied'` |
| `/api/internal/email/preview/[template]` | (per-template — used by dev/email-review + this diagnostic) | manual `Authorization: Bearer INTERNAL_API_TOKEN` |

### Path B callers

| Trigger source | File | Recipient | Subject |
|---|---|---|---|
| Donor signup (first OTP) | `src/app/api/donor/signup/route.ts:164` | new donor | `Your OrphanGive verification code` |
| Donor resend OTP | `src/app/api/donor/resend-otp/route.ts:100` | existing donor | `Your OrphanGive verification code` |

---

## STEP 2 — Production VPS config

Read from `/opt/orphangive/app.env` and confirmed inside the container
via `docker exec og-app printenv`:

| Env var | Set? | Value |
|---|---|---|
| `RESEND_API_KEY` | ✅ | `re_CC6jtVCn_…` (restricted send-only key, prefix `re_`) |
| `RESEND_FROM_EMAIL` | ✅ | `OrphanGive <hello@orphangive.org>` |
| `INTERNAL_API_TOKEN` | ✅ | redacted but present |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://orphangive.org` |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | `3000` |
| `INTERNAL_FETCH_URL` | ❌ | not set — `email-triggers.ts` falls back to `http://localhost:3000` (correct for single-container deploy) |
| `ADMIN_NOTIFY_EMAILS` | ❌ | **NOT SET — admin notifications silently no-op** |
| `NEXT_PUBLIC_DEV_TOOLS_ENABLED` | ❌ | not set — `/api/dev/send-test-email` returns 404 in prod (correct) |

Container `og-app` is `Up 44 hours (healthy)`. Next.js binds
`0.0.0.0:3000` and responds 200 on `/api/health` via loopback — so
inline triggers' `http://localhost:3000` self-fetch path is reachable.

---

## STEP 3 — Live test sends (one per distinct path)

### TEST A — Path A (`sendEmail()` helper)

Executed inside `og-app` container:

```sh
docker exec og-app node -e "
fetch('http://localhost:3000/api/internal/email/preview/sponsorship-welcome?send=1&to=mahmud@printagraphy.com',
  { headers: { Authorization: 'Bearer <INTERNAL_API_TOKEN>' }})
  .then(r => r.text().then(b => console.log(r.status, b)))"
```

**Result:**

```
STATUS: 502
MSG_ID: null
SENT_TO:  null
BODY:    {"error":"The associated domain with your API key is not
          verified. Please, create a new API key with full access or
          with a verified domain."}
```

→ **Resend rejected the send.** Nothing was dispatched to
mahmud@printagraphy.com. No spam risk.

### TEST B — Path B (`sendOtpEmail` direct SDK)

Not separately runnable from a one-shot CLI (the `resend` module is
bundled into the standalone Next build, not exposed at
`/app/node_modules`), but the failure is **structurally identical**:
both paths read `RESEND_FROM_EMAIL` and hand it to the same Resend
account's API. The Resend rejection in Test A is at the account/domain
level — it applies to any send from this `RESEND_API_KEY` with a
non-verified-domain `from` address, regardless of which SDK
incantation produces the request.

In other words: if Test A fails this way, Test B fails this way too.
Per the brief's "do NOT spam" rule, I'm not generating a real donor row
just to fire OTP and re-confirm the same error.

### TEST — Resend domain / sender state via API

```sh
curl -s https://api.resend.com/domains \
  -H 'Authorization: Bearer <RESEND_API_KEY>'
```

→ `{ "statusCode": 401, "message": "This API key is restricted to only
send emails", "name": "restricted_api_key" }`

The key is a **restricted send-only key**, so we can't list domains
or emails server-side with it. That's good security hygiene — but it
also means the only way to inspect Resend account state is via the
Resend dashboard. Mahmud needs to log into resend.com to confirm
which domain (if any) the key is scoped to and what its DNS state is.

### App-log evidence

```
docker logs og-app --since 168h | grep -iE '\[email|resend'
→ (empty)
```

Zero email-related log lines in the past 7 days. Consistent with
"nobody has tried to sign up / sponsor on the live site recently" —
this is a quiet site, the broken email path hasn't been exercised
much yet. The diagnostic test above is the first thing that's
exercised it in a week.

---

## STEP 4 — Diagnosis

### Cause

**CONFIG-SIDE — Resend account state.**

The `RESEND_API_KEY` is bound to an **unverified sending domain**.
Resend's error message is explicit:

> "The associated domain with your API key is not verified. Please,
> create a new API key with full access or with a verified domain."

Two possible underlying states (need dashboard access to disambiguate):

1. **`orphangive.org` is registered in Resend but DNS verification
   never completed** — DKIM / SPF / MX records missing or wrong on
   Hostinger DNS, so Resend's verification check is red.
2. **The API key was created scoped to a different domain** (e.g. an
   old / test domain) than the one in `RESEND_FROM_EMAIL`. The key
   refuses `from: hello@orphangive.org` because it doesn't have
   permission for that sender.

Either way, the fix lives in the Resend dashboard + Hostinger DNS,
not in our code.

### What is NOT the cause

- **Not an APP-SIDE bug.** Both code paths construct the Resend
  request correctly. Header, `from`, `to`, `subject`, HTML/text body
  all look fine.
- **Not an auth / network issue.** The HTTP request reaches Resend
  and gets back a structured 422-class JSON response, not a timeout
  / DNS / TLS error.
- **Not a `RESEND_FROM_EMAIL` formatting issue.** The displayed
  `OrphanGive <hello@orphangive.org>` format is exactly what Resend
  accepts.
- **Not an inline-trigger / loopback issue.** `email-triggers.ts`
  self-fetches `http://localhost:3000` — verified reachable in
  Test A (the request hit the internal route, the route rendered
  HTML, the route called `sendEmail`, `sendEmail` reached Resend).

---

## STEP 5 — Required actions (for Mahmud — NOT for the agent)

### Primary — restore email delivery (Resend dashboard + DNS)

1. Open https://resend.com/domains while logged into the Resend
   account that owns `re_CC6jtVCn_…`.
2. Confirm `orphangive.org` is listed. If missing, click **Add Domain**
   and add `orphangive.org`.
3. Resend shows DNS records to add (typically: 1× MX, 2-3× TXT for
   SPF + DKIM, optional 1× CNAME for tracking). Open Hostinger DNS
   for `orphangive.org` and add each one exactly as shown.
4. Wait 5-30 min for DNS propagation, then click **Verify** in
   Resend. All records should turn green.
5. Open https://resend.com/api-keys. The current key is a "restricted"
   key — confirm it's scoped to the now-verified `orphangive.org`
   domain. If the existing key is scoped to a different domain, either:
   - Re-create it with the correct scope, OR
   - Generate a new **Full access** key (faster, less granular —
     fine for v1).
6. Update `/opt/orphangive/app.env` with the new key (if rotated):
   `RESEND_API_KEY=re_…`. Then:

   ```sh
   cd /opt/orphangive
   docker compose up -d --force-recreate app
   ```

7. Re-run the smoke test (same command as Test A above) — expect
   `STATUS: 200` and a `X-Email-Message-Id` header. Check Resend's
   "Emails" tab in the dashboard for the delivery record.

### Secondary — turn on admin notifications

`ADMIN_NOTIFY_EMAILS` is unset, so every DI submission silently fails
to notify reviewers. Add to `/opt/orphangive/app.env`:

```
ADMIN_NOTIFY_EMAILS=mahmud@printagraphy.com,<second-admin@…>
```

Then `docker compose up -d --force-recreate app`. (Comma-separated
list; the di-notify code already supports multiple recipients.)

### Tertiary — re-enable Directus Flows after Resend is fixed

Three emails still come from Directus Flows (donor-approved,
reveal-approved, reveal-denied — see `docs/email-architecture.md` §
"Directus Flow-triggered emails"). Confirm they're enabled in
https://admin.orphangive.org → Settings → Flows. They'll start working
the moment Resend is healthy — no code change needed.

### Verification checklist (after the fixes above)

Hit each path once with a smoke send and confirm receipt:

- [ ] **Path A**: `curl -H "Authorization: Bearer $INTERNAL_API_TOKEN"
  "http://localhost:3000/api/internal/email/preview/sponsorship-welcome?send=1&to=mahmud@printagraphy.com"`
  → expect 200 + email in inbox within 2 min.
- [ ] **Path B**: trigger donor signup flow from
  https://orphangive.org/signup with a throwaway address you control
  → expect OTP email within 2 min.
- [ ] **Admin notify**: submit a test DI report from the DI portal
  → expect `[OrphanGive admin]` email to addresses in
  `ADMIN_NOTIFY_EMAILS` within 2 min.

---

## Branch / code status

No branch. **No code changes shipped.** All app-side code paths are
correct; the failure is entirely in Resend's view of the sending
domain.

If after the Resend fix the test send still fails with a different
error, that's the point to open `test/email-diagnostic` and dig
further. Until then the app side has no bugs that this diagnostic
surfaced.
