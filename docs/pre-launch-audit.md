# Pre-launch audit

Architectural patterns and audit checklists that emerged during
debugging and need to hold true before each production deploy.

## Stripe FK unique-constraint audit

Stripe object IDs (PaymentIntent, Subscription, Invoice) appear
on multiple OrphanGive collections as foreign-key reference
fields. The cardinality is NOT always 1-to-1 — bundle patterns
intentionally make some 1-to-N.

| Stripe ID                | Sponsorship    | Payment           | Cardinality                                |
| ------------------------ | -------------- | ----------------- | ------------------------------------------ |
| `stripe_subscription_id`  | 1 sub → 1      | 1 sub → 1         | 1-to-1: OK to be unique                    |
| `stripe_payment_intent_id` | bundle PI → N  | bundle PI → N     | 1-to-N: MUST NOT be unique                 |
| `stripe_invoice_id`       | TBD per-charge | 1 invoice → 1 payment | review per case                        |

Application-layer dedup (`createPaymentIfMissing` checks
`sponsorship_id` + `payment_intent_id` composite;
`createPendingSponsorship` checks fingerprint) is the correct
enforcement layer. DB-level unique constraints on
`stripe_payment_intent_id` BLOCK valid bundle activation flows.

Before any production deploy: audit every Stripe-FK field across
every collection. Confirm unique constraint matches the actual
cardinality. Drop overly-strict constraints in Directus admin
before they hit real donor flows.

Today's removed constraints:

- `sponsorship.stripe_payment_intent_id` (was unique)
- `payment.stripe_payment_intent_id` (was unique)
