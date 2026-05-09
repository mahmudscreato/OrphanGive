# OrphanGive email architecture

All transactional emails ship via Resend. Trigger model varies by
event type.

## Trigger patterns

### Inline triggers (preferred)

The route that performs an action also sends the email. Synchronous,
fail-loud, fully greppable in `/tmp/og-dev.log`. This is the model
for every email tied to a discrete user-or-system action.

### Directus Flow triggers (legacy, manual-admin only)

Mahmud flips a status in `https://admin.orphangive.org` → Directus
Flow fires a webhook to `/api/internal/email/<name>` → app sends.
Used only for the three emails whose trigger has no corresponding
API route (manual admin actions).

## Inline-triggered emails (post-14.5b)

| Email                          | Triggered from                                      |
|--------------------------------|-----------------------------------------------------|
| `SponsorshipWelcomeEmail`      | `/api/webhooks/stripe` — `activateFromPaidInvoice`, `handlePaymentIntentSucceeded` |
| `MonthlyReceiptEmail`          | `/api/webhooks/stripe` — `activateFromPaidInvoice` (only when `created=true`)      |
| `SponsorshipQueueJoinedEmail`  | `/api/checkout/init` — end of `createFreshCheckout` for queued rows                |
| `SponsorshipActivatedEmail`    | `promoteQueue()` in `src/lib/queue.ts`                                              |
| `SponsorshipQueueShiftEmail`   | `shiftQueueDates()` (extend) + cron auto-accept                                     |
| `SponsorshipCancelledEmail`    | `/api/sponsorship/[id]/cancel` and `/cancel-queued`                                 |
| `SponsorshipPausedEmail`       | `/api/sponsorship/[id]/pause`                                                       |
| `SponsorshipExtendedEmail`     | `/api/sponsorship/[id]/extend`                                                      |
| `SponsorshipModifiedEmail`     | `/api/sponsorship/[id]/modify-amount`                                               |

## Directus Flow-triggered emails (still active)

| Email                  | Trigger                                  | Why kept on Flow                                |
|------------------------|------------------------------------------|--------------------------------------------------|
| `DonorApprovedEmail`   | `directus_users.approval_status='approved'` | Manual flip in Directus admin; no API route to host an inline trigger. Building parallel admin UI was scope-cut at 14.5b. |
| `RevealApprovedEmail`  | `reveal_request.status='approved'`         | Same as above.                                   |
| `RevealDeniedEmail`    | `reveal_request.status='denied'`           | Same as above.                                   |

These three should remain enabled in production Directus admin.

## Dedup model

Each migrated trigger uses the dedup mechanism that already lives
in its `/api/internal/email/<name>` route — the inline migration
self-fetches that route via `INTERNAL_API_TOKEN`, so the route's
existing logic stays the canonical source of truth. Two
mechanisms are in play:

| Mechanism                                            | Used by                       |
|------------------------------------------------------|--------------------------------|
| `donor.welcome_email_sent_at` (6h time window)       | welcome                        |
| Payment row idempotency via `createPaymentIfMissing` | monthly receipt                |
| `donor.approval_email_sent_at` (legacy Flow)         | donor-approved                 |

The 6h window on welcome is generous enough that a donor adding
multiple sponsorships in a single checkout still gets ONE summary
email; a donor returning the next day to sponsor a new child gets
a fresh welcome.

For monthly receipt: `createPaymentIfMissing` returns
`{ created: false }` when the payment row already exists for the
given `(sponsorship_id, payment_intent_id, invoice_id)` triple.
That natural idempotency suppresses duplicate receipts on Stripe
event replays.

## Self-fetch helper

`src/lib/email-triggers.ts` exports two thin wrappers:

```ts
fireWelcomeEmail(sponsorshipIds: string[]): Promise<void>
fireMonthlyReceiptEmail(paymentId: string): Promise<void>
```

Both are best-effort — they log on failure but never throw, so a
mail-server hiccup doesn't unwind the webhook handler's row update.
They self-fetch the existing internal route with the
`INTERNAL_API_TOKEN` bearer; the route handles donor lookup, dedup,
template render, and `sendEmail()`.

## Migration history

- **Pre-14.5b**: every status-transition email was triggered by a
  Directus Flow watching the relevant collection, posting to
  `/api/internal/email/<name>`. This worked in production but was
  unreliable in dev (Directus is at `admin.orphangive.org` which
  cannot reach `localhost:3000`) and added an external dependency
  for production-critical emails.
- **14.5b** (this commit): welcome + monthly-receipt migrated to
  inline triggers in the Stripe webhook handler. The legacy
  Directus Flows for these two emails should be **disabled** in
  production after deployment verification (see "Stage 3 deployment
  sequence" below). Flows for donor-approved + reveal stay active.

## Stage 3 deployment sequence

Once 14.5b is verified in production:

1. Open `https://admin.orphangive.org/admin/settings/flows`.
2. **Disable** the two Flows that fire these inline-replaced emails:
   - the one that watches `sponsorship.status='active'` (welcome)
   - the one that watches `payment` row creation (monthly receipt)
3. Leave the donor-approved + reveal Flows active.
4. Verify in production logs over 7 days that:
   - inline triggers are firing as expected (`[email-triggers]`
     prefix)
   - Resend dashboard shows the right templates being delivered
   - no donor reports missing welcome emails

If anything goes wrong, the Flows can be re-enabled in seconds
without code changes — the `/api/internal/email/<name>` routes
are unchanged and accept the same payloads. Roll-back path is
intact.

## Local dev limitations

Directus Flows can't reach localhost. During local dev:
- inline-triggered emails fire correctly (welcome, receipt, etc.)
- Directus-Flow-triggered ones (donor-approved, reveal) **don't
  deliver locally** unless you set up an ngrok / cloudflared
  tunnel and update the Flow webhook URLs

This is expected. To smoke-test the legacy Flow path locally:

```sh
ngrok http 3000
# In Directus admin, temporarily change the Flow's webhook URL
# to https://<your-ngrok>.ngrok.io/api/internal/email/<name>
```
