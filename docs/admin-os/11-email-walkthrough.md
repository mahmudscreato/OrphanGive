# 11 — Live email walkthrough (production VPS → mahmud@printagraphy.com)

**Date:** 2026-05-31
**Environment:** production (`og-app` container on Hostinger VPS).
**Recipient:** mahmud@printagraphy.com (every send).
**Pre-condition:** session 10 diagnostic done; Resend now accepts sends
(`hello@orphangive.org` domain verified).
**Code changes shipped:** none.
**Permanent prod data created:** none.

---

## TL;DR

**12 live sends fired, all returned `200 OK` from Resend.** One Resend
message id per send — list at the bottom. Expect ~12 emails in
mahmud@printagraphy.com within ~5 min, spaced 12 s apart, all from
`OrphanGive <hello@orphangive.org>`.

**4 templates were NOT sent** in this walkthrough — they would have
required either heavy permanent production data (campaign sponsorship,
queue-promotion flow) or env-var mutation (admin notify list) or code
edits (hard-coded contact-form recipient). They're listed under
"Skipped — manual-test only" with the exact recipe to test each.

If everything below arrived, Resend + DNS + the app are healthy end-to-end.

---

## Inventory — every distinct email path the app sends

| # | Template / path | Helper | Triggered by | Tested here? |
|---|---|---|---|---|
| 1 | `DonorApprovedEmail` | `sendEmail()` | Directus Flow on donor approval | ✅ |
| 2 | `SponsorshipWelcomeEmail` | `sendEmail()` | Stripe webhook → first sponsorship active | ✅ |
| 3 | `RevealApprovedEmail` | `sendEmail()` | Directus Flow on reveal_request approval | ✅ |
| 4 | `RevealDeniedEmail` | `sendEmail()` | Directus Flow on reveal_request denial | ✅ |
| 5 | `MonthlyReceiptEmail` | `sendEmail()` | Stripe webhook on each invoice.paid | ✅ |
| 6 | `SponsorshipPausedEmail` | `sendEmail()` | `/api/sponsorship/[id]/pause` + admin route | ✅ |
| 7 | `SponsorshipModifiedEmail` | `sendEmail()` | `/api/sponsorship/[id]/modify-amount` | ✅ |
| 8 | `SponsorshipCancelledEmail` | `sendEmail()` | cancel routes + Stripe refund + sub deletion | ✅ |
| 9 | `SponsorshipExtendedEmail` | `sendEmail()` | `/api/sponsorship/[id]/extend` | ✅ |
| 10 | `ReportPublishedEmail` (progress variant) | `sendEmail()` | `/api/admin/reports/[id]/send` | ✅ |
| 11 | `ReportPublishedEmail` (deployment variant) | `sendEmail()` | same route, different report kind | ✅ |
| 12 | OTP verification (raw HTML) | `sendOtpEmail()` direct Resend SDK | `/api/donor/signup` + `/api/donor/resend-otp` | ✅ |
| 13 | `SponsorshipQueueJoinedEmail` | `sendEmail()` | `/api/checkout/init` (queued seat) | ❌ skipped |
| 14 | `SponsorshipActivatedEmail` | `sendEmail()` | `promoteQueue()` in `src/lib/queue.ts` | ❌ skipped |
| 15 | `SponsorshipQueueShiftEmail` | `sendEmail()` | extend flow + cron auto-accept | ❌ skipped |
| 16 | `CampaignThankYouEmail` | `sendEmail()` | Stripe webhook for child-less (campaign) gift | ❌ skipped |
| 17 | `OperationalNoticeEmail` (contact form) | `sendEmail()` | `/api/contact` POST | ❌ skipped |
| 18 | `AdminPendingSubmissionEmail` (DI notify) | `sendEmail()` via `di-notify.ts` | DI portal submissions | ❌ skipped |

---

## Test method per send

All 11 React Email templates that the existing internal preview route
supports were sent via:

```sh
GET http://localhost:3000/api/internal/email/preview/<template>?send=1&to=mahmud@printagraphy.com&firstName=Mahmud
  Authorization: Bearer <INTERNAL_API_TOKEN>
```

This is the **same** `sendEmail()` helper production routes use — the
preview route just provides canned data and lets us specify the
recipient. The Resend HTTP call, the `from` header, the React Email
render path — all identical to production.

The OTP path uses a different helper (`sendOtpEmail()` in
`src/lib/donor-signup.ts`), which constructs its own Resend SDK
instance and bypasses `sendEmail()`. Tested via:

```sh
POST http://localhost:3000/api/donor/resend-otp
  Content-Type: application/json
  { "email": "mahmud@printagraphy.com" }
```

This hits the **real** resend-OTP endpoint with **no test
instrumentation** — the same code path a returning donor who clicks
"Resend OTP" on the signup page would hit. (Mahmud's existing donor
row, `id=ddb326f5-…`, already in production: the endpoint rotated its
`og_otp_hash` and `og_otp_expires_at` — that mutation expires
naturally in 10 minutes and is the only side-effect.)

Sends were spaced **12 s apart** to stay comfortably under Resend's
free-tier 2 req/s rate limit.

---

## Per-send results

All from `OrphanGive <hello@orphangive.org>` → `mahmud@printagraphy.com`.

| # | Sent at (UTC) | Template | Subject | Resend message id | Status |
|---|---|---|---|---|---|
| 1 | 04:24:13 | `donor-approved` | `Welcome to OrphanGive, Mahmud` | `b9d35fde-0b5f-4378-bc74-67194b91c3c3` | 200 ✅ |
| 2 | 04:24:24 | `sponsorship-welcome` | `Thank you, Mahmud — your sponsorship begins today` | `de167bd0-10e6-4fc5-974f-281078ce6fe5` | 200 ✅ |
| 3 | 04:24:36 | `reveal-approved` | `Your reveal request was approved` | `39228ebb-b6aa-47ba-903f-482d2e164541` | 200 ✅ |
| 4 | 04:24:49 | `reveal-denied` | `Your reveal request — update from our team` | `3d975516-87b6-4313-a5b4-ecf173a0e3a6` | 200 ✅ |
| 5 | 04:25:01 | `monthly-receipt` | `Receipt — May 2026 sponsorship of Mim Khatun` | `db1276ac-2faa-4522-a249-e371722ee1ab` | 200 ✅ |
| 6 | 04:25:14 | `sponsorship-paused` | `Your sponsorship of Mim Khatun is paused` | `cf9564dc-7132-457c-8139-18cc2443281d` | 200 ✅ |
| 7 | 04:25:26 | `sponsorship-modified` | `Your sponsorship amount has been updated` | `fb3bfa93-ffa1-46ad-88d2-f2f9836d5b94` | 200 ✅ |
| 8 | 04:25:39 | `sponsorship-cancelled` | `Your sponsorship of Mim Khatun has ended` | `40e44ce2-d9e3-49a7-a160-ee8c5838d9b2` | 200 ✅ |
| 9 | 04:25:51 | `sponsorship-extended` | `Your sponsorship of Mim Khatun has been extended` | `357ab227-0657-4ba6-adeb-c6fc16620b3e` | 200 ✅ |
| 10 | 04:26:03 | `report-published-progress` | `A new update on Mim Khatun` | `d2f390ae-09f4-4b99-ae97-cf060175314f` | 200 ✅ |
| 11 | 04:26:16 | `report-published-deployment` | `Your gift to Mim Khatun has been delivered` | `afd5e6f9-3e4c-484b-a2f4-8a5eeeff6a38` | 200 ✅ |
| 12 | 04:26:29 | `otp` (signup verification) | `Your OrphanGive verification code` | (Resend id not surfaced by `resend-otp` route — endpoint returns `{success:true}` only) | 200 ✅ |

→ **12/12 returned 200.** No 4xx, no 5xx, no bounces / blocks at send
time. Zero Resend-side rejections.

### Resend delivery state verification

The production `RESEND_API_KEY` is a restricted **send-only key** — it
returns `401 restricted_api_key` against `GET /domains` and
`GET /emails`. I cannot programmatically query delivery state.

To check delivery state, Mahmud should:

1. Log into https://resend.com/emails.
2. Filter by recipient = `mahmud@printagraphy.com`, sent on 2026-05-31.
3. The 12 sends above should appear with delivery state (`delivered`,
   `opened`, `bounced`, `complained`). Each row's id matches the
   `Resend message id` column above.

If any show `bounced` or `blocked`, that's the row to investigate.
Given the send-time 200s, the most likely outcome is all 12 delivered.

---

## What Mahmud should look for in his inbox

**Expected: 12 emails arriving between 04:24 and 04:27 UTC** (~ish —
mail can lag a minute or two), all from `OrphanGive <hello@orphangive.org>`.

Subject lines to look for, in send order:

1. Welcome to OrphanGive, Mahmud
2. Thank you, Mahmud — your sponsorship begins today
3. Your reveal request was approved
4. Your reveal request — update from our team
5. Receipt — May 2026 sponsorship of Mim Khatun
6. Your sponsorship of Mim Khatun is paused
7. Your sponsorship amount has been updated
8. Your sponsorship of Mim Khatun has ended
9. Your sponsorship of Mim Khatun has been extended
10. A new update on Mim Khatun
11. Your gift to Mim Khatun has been delivered
12. Your OrphanGive verification code

If any of these are **missing**, that's the path to flag — either
Resend rejected delivery (check the dashboard) or Mahmud's inbox
provider blocked it (check spam folder; if there add to whitelist).

The OTP email contains a real 6-digit code — it's valid for 10
minutes from 04:26 UTC; ignore it after that or use it to sign in if
Mahmud wants. Either way the code expires automatically.

---

## Skipped — manual-test only

These 6 paths weren't fired in this walkthrough. Each row explains
why + how to test it cleanly when needed.

### `SponsorshipQueueJoinedEmail`

- **Why skipped:** requires a real checkout that lands on a queued
  (rather than active) seat — the child must already have an active
  sponsor. Manufacturing that means a real Stripe checkout for a
  child with an active sponsor, paying real money (or
  using a Stripe test card on a test-mode key, which prod doesn't
  use). Too much overhead for one preview email.
- **How to test:** wait for a real donor to join a queue, OR in
  staging trigger `/api/checkout/init` for a child whose
  `active_sponsor_count > 0`. The send fires at
  `src/app/api/checkout/init/route.ts:689`.

### `SponsorshipActivatedEmail`

- **Why skipped:** fires when `promoteQueue()` runs — i.e. when an
  active sponsor's sub gets deleted/refunded and the queued
  donor inherits the seat. No clean way to trigger without affecting
  a real sponsor.
- **How to test:** when Mahmud has an active sponsor + queued sponsor
  for the same child, run the existing cron manually:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET"
   https://orphangive.org/api/cron/promote-queue`. The queued donor
  gets the email. The send fires at `src/lib/queue.ts:457`.

### `SponsorshipQueueShiftEmail`

- **Why skipped:** fires only when an active sponsor extends their
  commitment AND there's at least one queued downstream sponsor whose
  start date now shifts. Requires the full chain of real rows.
- **How to test:** same as above — needs at least 2 sponsors (1 active
  + 1 queued) on the same child, then the active sponsor uses
  `/api/sponsorship/[id]/extend`. Send fires at
  `src/app/api/sponsorship/[id]/queue-shift/route.ts:246` and the
  cron-driven follow-up at `src/lib/queue.ts:624`.

### `CampaignThankYouEmail`

- **Why skipped:** fires only on a Stripe payment_intent.succeeded
  webhook where `sponsorship.child === null` (the campaign one-time
  gift case). Manufacturing it cleanly requires a real campaign
  donation through Stripe.
- **How to test:** on launch day, do a real $5 campaign donation with
  Mahmud's own card to validate. Stripe's full receipt + OrphanGive's
  thank-you should both arrive. Send fires at
  `src/app/api/webhooks/stripe/route.ts:516` via
  `fireCampaignThankYouEmail()`.

### `OperationalNoticeEmail` (contact form)

- **Why skipped:** recipient is hard-coded to `support@orphangive.org`
  in `src/app/api/contact/route.ts:65`. Sending this template to
  mahmud@printagraphy.com would require a code change — out of scope
  for this task ("Do NOT modify app code").
- **How to test:** submit any form at https://orphangive.org/contact
  (general/orphan-referral/volunteer). The email goes to
  `support@orphangive.org` — confirm that mailbox is monitored
  (separate config concern, not Resend's problem).

### `AdminPendingSubmissionEmail` (DI submission notify)

- **Why skipped:** `di-notify.ts` reads `ADMIN_NOTIFY_EMAILS` env
  var; that env is **not set** in production (see session 10 doc).
  Even firing a real DI submission would silently no-op. The task
  said "DO NOT mutate the env var permanently."
- **How to test:** Mahmud should set
  `ADMIN_NOTIFY_EMAILS=mahmud@printagraphy.com` in
  `/opt/orphangive/app.env`, `docker compose up -d --force-recreate
  app`, then submit one DI report from
  https://orphangive.org/di. The admin notify email arrives. After
  he's seen it once, switch the env to the real admin list (csv) and
  restart again.

---

## Cleanup confirmation

| Item | State |
|---|---|
| New donor rows created | 0 — used existing `mahmud@printagraphy.com` row (id `ddb326f5-…`) |
| New sponsorship rows created | 0 — preview-route sends use rendered sample data, never touch the DB |
| New payment rows created | 0 |
| New di_submission / report rows | 0 |
| `EMAIL-TEST` data prefix anywhere | 0 — verified via `SELECT count(*) FROM directus_users WHERE email LIKE '%EMAIL-TEST%' OR email LIKE '%email-test%'` → `0` |
| `og_otp_hash` mutation on Mahmud's row | yes — auto-expires at 2026-05-31 04:36 UTC (10 min TTL) |
| Temp script `/tmp/sendall.mjs` on VPS | removed |
| Temp script in container `/tmp/sendall.mjs` | removed |
| Env var changes | none |
| Code changes | none |
| Container restarts | none |

Production DB state matches pre-test state exactly, except for the
one auto-expiring OTP hash field on Mahmud's own donor row.

---

## What this confirms about the Resend fix

The session 10 diagnostic ended on "domain unverified — Mahmud must
fix at the dashboard." Today's 12/12 successful sends confirm:

- Domain `orphangive.org` is verified in Resend.
- The current `RESEND_API_KEY` is scoped to the verified domain and
  permitted to send `from: hello@orphangive.org`.
- Both code paths (`sendEmail()` helper + `sendOtpEmail()` direct
  SDK) reach Resend and get accepted.
- The inline-trigger loopback (`http://localhost:3000` from inside
  the container) works — the preview route was hit via that path.
- The internal-route auth (`INTERNAL_API_TOKEN` bearer) works.

What this does NOT confirm:

- Actual inbox delivery — need to check Mahmud's mailbox + the
  Resend dashboard's "delivered" state on each of the 12 message ids.
- The 6 skipped templates' rendering — they're built from the same
  React Email primitives as the 11 sent here, so they almost
  certainly work, but each one needs at least one real production
  send eventually.
- `ADMIN_NOTIFY_EMAILS` being correctly populated — it's still
  empty. Address before launch (see session 10 §"Secondary").
