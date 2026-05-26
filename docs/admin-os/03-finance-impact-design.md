# Admin OS — Phase 2 Finance (money-out) + Impact: build-ready design

**Branch:** `design/phase-2-finance-impact`
**Base:** `main` @ `c99af86`
**Status:** design only. No source changed. No migration written.
**Ground truth:**
- `docs/admin-os/00-discovery.md` §S6 — Finance + Impact + Safeguarding
  classified `[DOES-NOT-EXIST]` for money-out, FX reconciliation,
  impact aggregation, platform-fee schema.
- `docs/admin-os/01-phase0-diagnostic.md` §B — Super Admin gate
  established in Phase 0 (`requireSuperAdminUser` in `src/lib/admin-auth.ts`).
- Phase 0 also added the `task.sponsorship` + `child_update.sponsorship`
  FKs that the Phase 1 spine relies on.

## What we're closing

| Gap | Today | After Phase 2 |
|---|---|---|
| **Money OUT** (disbursement, expense, FX reconciliation) | `[DOES-NOT-EXIST]` per `00-discovery.md` §S6. Money IN is fully captured (`sponsorship.amount_usd`, `payment.amount_usd`, donor-currency snapshot in `bdt_per_unit_at_checkout`). | New `expense` collection records every BDT spent in-country, with FX snapshot to USD common unit. Optional links to `aid_delivery` (which evidence row this paid for) and `sponsorship` (which funder, when traceable). |
| **Funds pending vs deployed** | No way to derive — money out isn't recorded. | Derived: `SUM(payment.amount_usd WHERE succeeded AND NOT refunded) − SUM(expense.amount_usd_at_disbursement) − platform_fees_collected_usd`. Always USD common unit; never sum mixed donor currencies. |
| **Platform fee** | No schema, no setting, no super-admin lever. Stripe processor fee is implicit in payout but not modelled. | Super-admin-only `org_setting` row (single-row collection): `platform_fee_pct`. Applied at finance-dashboard READ time; never mutates `sponsorship`/`payment`. |
| **Impact metrics** | No `impact_metric` table. `aid_delivery.aid_type` enum (`education|food|healthcare|clothing|general_care|other`) exists but is never aggregated in code. | Impact = DERIVED from counts of existing rows wherever possible (children supported, deliveries by type, reports sent). One small `impact_metric` collection ONLY for things that aren't row-countable (e.g. meals served when a single delivery represents 30 meals). |

---

## 1. Money-out data model — recommendation: NEW `expense` collection

### The shape

Single new collection `expense`. Every row = one record of money leaving
the OrphanGive bank/cash position into the field. Granularity: one row
per discrete spend event (e.g. "paid 1,500 BDT for Imran's school
uniform on 2026-05-20"). Higher-level admin batches can be modelled as
multiple expense rows tagged to the same `batch_id` if needed —
deferred, see §8 OQ4.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | Standard. |
| `date` | date (not null) | Spend date (NOT row-creation time). The field officer / admin can backdate when entering historical expenses. |
| `amount_bdt` | decimal(12,2) (not null) | The **truth amount** — what was actually paid out in Bangladesh, in BDT. This is the canonical source-of-truth for money-out. |
| `bdt_per_usd_at_disbursement` | decimal(10,4) (not null) | FX snapshot — how many BDT = 1 USD at the moment this expense is recorded. Mirrors the existing `sponsorship.bdt_per_unit_at_checkout` pattern. Looked up from `currency_rate` where `currency_code = 'USD'`; defensively copied here so a future rate change doesn't drift historic accounting. |
| `amount_usd_at_disbursement` | decimal(12,2) (not null) | Derived at write time = `amount_bdt / bdt_per_usd_at_disbursement`. Stored (not pure-derived) so the common-unit USD ledger is queryable without joining `currency_rate` per row. Same pattern Session 58.10 followed with `donor_currency_amount` + `amount_usd`. |
| `category` | enum (not null) | Reuse the existing `aid_delivery.aid_type` enum verbatim: `education|food|healthcare|clothing|general_care|other`. Add one more value `platform_operations` for non-aid expenses (admin/operations spending tracked separately from direct aid). |
| `description` | text (nullable) | Free-text narrative. "Imran's school uniform (size 12)." |
| `aid_delivery` | uuid M2O `aid_delivery` (nullable, ON DELETE SET NULL) | Optional link to the evidence row this expense paid for. NULL when (a) the spend isn't tied to a per-child delivery (operational/platform), or (b) the delivery row hasn't been written yet. |
| `sponsorship` | uuid M2O `sponsorship` (nullable, ON DELETE SET NULL) | Optional link to the funding sponsorship. Same nullability semantics as `aid_delivery.sponsorship` — many expenses are paid from the general pool and aren't attributable to a single sponsor's row. |
| `child` | uuid M2O `child` (nullable, ON DELETE SET NULL) | Optional convenience denormalisation when the expense is for a specific child but no aid_delivery row exists yet. Most rows derive child via `aid_delivery.child`. |
| `recorded_by` | uuid M2O `directus_users` (not null) | Admin who entered the row. |
| `receipt_photo` | uuid M2O `directus_files` (nullable) | Optional receipt/proof. |
| `date_created` | timestamp (auto via `date-created` special) | Row-write time, separate from `date`. |
| `status` | enum (not null, default `recorded`) | `recorded | reconciled | disputed`. `recorded` = admin entered. `reconciled` = matched against bank statement. `disputed` = audit flagged. V1 ships only `recorded` in active use; `reconciled` is an admin gesture; `disputed` is a future safeguarding hook. |

### Why this shape, not alternatives

| Considered | Rejected because… |
|---|---|
| **Add an `amount_bdt` column to `aid_delivery`** instead of a new collection | `aid_delivery` is evidence of care (photo + acknowledgment + delivery_date), not money-out. Conflating the two would make "money the field officer carried but hadn't yet delivered" or "operational spending (rent, transport)" unrepresentable. Separation gives a clean finance ledger. |
| **Net-new `disbursement` collection per batch** | A batch concept implies aggregation. Cleaner to ship per-spend granularity and let admin batch-tag rows post-hoc if needed (deferred — see §8 OQ4). |
| **Re-activate the dormant bootstrap `report` or `donation` collection** | Both have wrong semantics (`report` ≈ "donor-facing monthly PDF"; `donation` ≈ "the inbound gift" — overlaps `sponsorship` + `payment`). Discovery doc §S9 observation #1 explicitly flagged dormant-vs-live duality as a smell to stop adding to. |
| **Multi-currency `amount` field with currency code (matching `payment.currency`)** | Disbursements are BDT in 99% of cases. Allowing `amount` + `currency_code` invites mixed-currency summing bugs. Lock to BDT in the truth column + USD derived for cross-currency display. If multi-country disbursement ever ships, extend with `amount_local_currency_code` + `amount_local` later — additive, no rewrite. |

### Currency-handling rules (locked)

1. **Truth in BDT.** Field officers spend BDT; that's the only currency the truth column accepts.
2. **USD common unit for aggregation.** Every report / dashboard sums `amount_usd_at_disbursement`. Never sum a mix of donor currencies on the in-side; never sum mixed currencies on the out-side.
3. **FX snapshot at write time.** `bdt_per_usd_at_disbursement` is copied from `currency_rate` at the moment of recording, frozen on the row. Identical pattern to `sponsorship.bdt_per_unit_at_checkout` (`src/lib/donation-checkout.ts:335`).
4. **No re-derivation.** A future rate change in `currency_rate` does NOT mutate any historic `expense.amount_usd_at_disbursement`. The ledger is deterministic.

### Postgres FK ON DELETE choices

| FK | ON DELETE | Reasoning |
|---|---|---|
| `expense.aid_delivery` | SET NULL | Deleting a delivery shouldn't void the money-out record. The expense happened; only the evidence link is gone. |
| `expense.sponsorship` | SET NULL | Same logic as `aid_delivery.sponsorship` (existing — Session 41-v3). |
| `expense.child` | SET NULL | Same logic as `aid_delivery.child` (existing). |
| `expense.recorded_by` | SET NULL | Same logic as the existing `*_by` columns on every collection. |
| `expense.receipt_photo` | SET NULL | A deleted file shouldn't void the expense row. |

All five FKs ship via the **two-step migration** pattern from Phase 0
(POST /fields then POST /relations), with the orphan-row guard from
`migrations/cleanup-session58/001-add-donation-package-fk.mjs`.

---

## 2. Funds pending vs deployed — calculation

### Common-unit ledger (USD)

```
funds_received_usd      = SUM(payment.amount_usd
                              WHERE status = 'succeeded'
                                AND refunded_at IS NULL)
                          + (refunded payments are subtracted at the
                             dashboard level — see "refunded" below)

funds_refunded_usd      = SUM(payment.amount_usd
                              WHERE status IN ('succeeded','refunded')
                                AND refunded_at IS NOT NULL)

funds_disbursed_usd     = SUM(expense.amount_usd_at_disbursement
                              WHERE status IN ('recorded','reconciled')
                                AND category != 'platform_operations')

funds_operations_usd    = SUM(expense.amount_usd_at_disbursement
                              WHERE status IN ('recorded','reconciled')
                                AND category = 'platform_operations')

platform_fee_taken_usd  = (funds_received_usd - funds_refunded_usd)
                          × org_setting.platform_fee_pct   (see §3)

funds_net_collected_usd = funds_received_usd
                          - funds_refunded_usd
                          - platform_fee_taken_usd

funds_pending_usd       = funds_net_collected_usd
                          - funds_disbursed_usd
                          - funds_operations_usd

funds_deployed_usd      = funds_disbursed_usd      (alias for clarity)
funds_deployed_pct      = funds_deployed_usd
                          / funds_net_collected_usd  × 100
```

### Implementation

A new server-only module `src/lib/admin-finance.ts` (mirror of
`src/lib/admin-home-stats.ts` Session 51 pattern) computes the six
totals via parallel `safeSum` calls. `safeSum` is a Sum variant of
`safeCount` in `src/lib/admin-home-stats.ts:26-46` — fetches `id +
amount_usd` only with `limit: -1`, sums in JS. At expected scale
(< 10k rows over 1 year) this is fine; if it grows, the natural
next step is a Postgres view that aggregates per month, queried by
the dashboard reader.

**Critical rule encoded in the module's header:** `safeSum` rejects
any column that isn't pre-validated as a single-currency common-unit
field. We list the allowed columns explicitly:
- `payment.amount_usd` (always USD per `sponsorship-data.ts:259`)
- `expense.amount_usd_at_disbursement` (always USD by design)

Anything else (a future contributor adding `payment.amount_local`)
must be summed by currency code first — pattern documented inline.

---

## 3. Platform fee — minimal model

### Storage

Single-row collection `org_setting`:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | Always one row. Enforced via `directus_collections.singleton = true`. |
| `platform_fee_pct` | decimal(5,4) | E.g. `0.0500` = 5%. Default `0.0000` (no fee until super-admin sets one). |
| `platform_fee_effective_from` | date | When the current rate took effect. Lets historic dashboards apply the right rate to historic intake (V2 polish — V1 ignores and applies the current rate to all intake). |
| `updated_by` | uuid M2O `directus_users` (not null) | Audit anchor — only super-admin can write. |
| `updated_at` | timestamp (auto) | Same. |

### Mutation

- New admin route `POST /api/admin/super/org-setting/platform-fee` gated by `requireSuperAdminUser()` (Phase 0).
- Audit action `super_admin_set_platform_fee` (extend `AuditAction` union + `AUDIT_LABELS`).
- The route validates `0 ≤ pct ≤ 0.5` (50% cap) — a tripwire against fat-finger typos.

### Read

- The finance dashboard's `getFinanceTotals()` function reads the singleton row and applies `platform_fee_pct` at calculation time (per §2). No mutation of `sponsorship` or `payment`.
- Stripe processing fees are **NOT modelled here** — they're outside OrphanGive's accounting (Stripe deducts before payout). If org wants to surface "what Stripe took" on a transparency page, that's a separate feature reading from Stripe's API (deferred to a future phase).

**Open question (Q1 below):** does OrphanGive actually take a
platform fee? If no, this collection ships with `platform_fee_pct =
0` and the read path is a literal multiply-by-zero no-op until
someone sets it. Cheap insurance.

---

## 4. Impact metrics — recommendation: DERIVE where possible

### Derived counts (no new schema)

For everything that's already a row in an existing collection,
**don't store the aggregate.** Compute it at read time. Pattern
matches the existing `getAdminHomeStats` (`src/lib/admin-home-stats.ts`).

| Metric | Derived from |
|---|---|
| Children supported (lifetime) | `SELECT COUNT(DISTINCT child) FROM sponsorship WHERE status IN ('active','completed','paused')` |
| Children currently sponsored | `SELECT COUNT(DISTINCT child) FROM sponsorship WHERE status = 'active' AND (queue_position IS NULL OR queue_position = 0)` |
| Total deliveries by type | `SELECT aid_type, COUNT(*) FROM aid_delivery WHERE status = 'verified' GROUP BY aid_type` |
| Reports sent to donors | `SELECT COUNT(*) FROM child_update WHERE status = 'published' AND sponsorship IS NOT NULL` (the Phase 1 spine populates the FK) |
| Active monthly recurring giving (USD) | `SELECT SUM(amount_usd) FROM sponsorship WHERE status = 'active' AND payment_mode = 'monthly' AND (queue_position IS NULL OR queue_position = 0)` |
| Average sponsorship duration | `SELECT AVG(ended_at - started_at) FROM sponsorship WHERE ended_at IS NOT NULL` |
| Funds deployed by aid_type | `SELECT category, SUM(amount_usd_at_disbursement) FROM expense WHERE status IN ('recorded','reconciled') AND category != 'platform_operations' GROUP BY category` |

### New `impact_metric` collection — ONLY for non-derivable counts

A metric is non-derivable when one row in an existing collection
represents N units of impact (e.g. one `aid_delivery` of `aid_type=
'food'` might represent "30 meals served, fed 4 family members for
3 days"). The collection lets admin/DI declare that multiplier.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `aid_delivery` | uuid M2O `aid_delivery` (not null) | The evidence row this metric describes. |
| `metric_key` | enum (not null) | `meals_served | school_days_funded | medical_visits | clothing_items | nights_sheltered | other`. Extend as new categories emerge. |
| `quantity` | integer (not null) | E.g. `30` for "30 meals served". |
| `notes` | text (nullable) | Free-text qualifier. |
| `recorded_by` | uuid M2O `directus_users` (not null) | DI or admin. |
| `date_created` | timestamp (auto) | |

The collection ships with **zero rows on day 1**. Admin/DI start
filling it only for deliveries where the row-count alone undersells
the impact. The Impact dashboard reads it as a SECONDARY layer
("delivered 142 food packages → 4,260 meals served"); the row count
of `aid_delivery` is always the primary number.

---

## 5. Dashboard reads

Two new dashboards. Both gated by `requireAdminUser`. The Finance
dashboard ADDITIONALLY surfaces a "Set platform fee" widget gated
by `requireSuperAdminUser`.

### Super Admin Finance dashboard (`/admin/finance`)

V1 stat tiles (mirrors the existing 4-tile pattern at `/admin/`):

| Tile | Calc |
|---|---|
| Funds received (USD, lifetime) | `funds_received_usd` |
| Funds refunded (USD, lifetime) | `funds_refunded_usd` |
| Platform fees taken (USD) | `platform_fee_taken_usd` |
| Funds deployed (USD) | `funds_deployed_usd` |
| Funds pending deployment (USD) | `funds_pending_usd` |
| % deployed | `funds_deployed_pct` |

Below the tiles:
- **Expense ledger** — paginated list of `expense` rows, filterable by date range / category / status. Mirrors the existing `/admin/sponsorships` list (`src/app/admin/(authed)/sponsorships/page.tsx`).
- **Recent disbursements** — last 10 expense rows with date / amount BDT + USD / category / linked aid_delivery thumbnail.

### Impact dashboard (`/admin/impact`)

| Section | Source |
|---|---|
| Children supported (lifetime, currently active) | Derived (§4 table) |
| Deliveries by aid_type (lifetime, last 30d) | Derived |
| Reports sent (lifetime, last 30d) | Derived |
| Active monthly recurring (USD MRR) | Derived |
| Custom impact metrics by `metric_key` | `impact_metric` collection sum |

Both dashboards read via new server modules:
- `src/lib/admin-finance.ts` — returns `getFinanceTotals(opts?)` and `listExpenses(opts)`.
- `src/lib/admin-impact.ts` — returns `getImpactStats()` and `listCustomMetrics(opts)`.

Per the Phase 0 RBAC: `requireSuperAdminUser` gates the platform-fee
edit + (recommended) the entire `/admin/finance` route since money
disbursement is a sensitive admin surface; plain admin sees
`/admin/impact` only. Settable in the layout's role-aware nav
filter — single existing site at `src/components/admin/AdminSidebar.tsx`.

---

## 6. Privacy + accuracy guarantees

| Risk | Guard |
|---|---|
| Mixed-currency sum producing nonsense totals | `safeSum` in `admin-finance.ts` accepts ONLY pre-validated USD columns (`payment.amount_usd`, `expense.amount_usd_at_disbursement`). Header comment documents the rule; a future contributor adding a non-USD column has to extend the allow-list explicitly. |
| Historic FX drift affecting old totals | `expense.bdt_per_usd_at_disbursement` is frozen on the row. Re-running yesterday's finance dashboard tomorrow returns the same USD numbers even after a rate change. Same pattern as `sponsorship.bdt_per_unit_at_checkout`. |
| Tier-3 child fields leaking into finance/impact views | Both dashboards query `aid_delivery` / `expense` / `child_update` / `sponsorship` / `child` with Tier-1 child fields only (`id`, `display_name`, `Photo`). The donor-side Tier model from `src/lib/child-profile-data.ts:114-165` is the reference — `admin-finance.ts` + `admin-impact.ts` must NOT add `bd_district.*`, `date_of_birth`, `guardian_*`, `*_encrypted` to their SELECT lists. Reviewer-checklist comment in each module header. |
| Audit gap on platform-fee changes | The new super-admin route writes `super_admin_set_platform_fee` audit via `recordAuditEvent({ actorRole: "admin", ... })`. Metadata captures old + new pct + effective_from date. |
| Donor donor PII in expense rows | Expense rows reference donors only via `sponsorship` FK indirection. Direct `recorded_by`/etc. fields point at admin/DI users, not donors. |
| Receipt photos exposing PII | `receipt_photo` is admin-scoped; the existing `/api/assets/[id]` proxy needs no change because admin tier already has Tier-3 access. NEVER include the receipt URL in any donor-facing surface. |

---

## 7. Build plan — three sub-phases

Each is independently testable + shippable behind its own test gate.

### Phase 2.1 — Money-out ledger (no platform fee, no dashboard yet)

**Scope**
- Migration `migrations/phase-2/001-create-expense-collection.mjs`. Creates `expense` collection + 12 fields + 5 FK relations (two-step pattern). Idempotent.
- DI/admin data layer `src/lib/admin-expenses.ts` — `createExpense`, `listExpenses`, `getExpenseById`, `updateExpenseStatus`.
- Minimal admin UI: "Record expense" form on `/admin/expenses/new` + read-only list `/admin/expenses`. No dashboard yet.
- Audit actions: `admin_recorded_expense`, `admin_reconciled_expense`, `admin_disputed_expense`.
- Privacy: tier-1-only joins.

**Test gate:** admin records a BDT 1,500 expense linked to a real aid_delivery + sponsorship → row appears in `/admin/expenses` with derived USD value. Re-running the migration is a no-op.

### Phase 2.2 — Finance dashboard + platform fee setting

**Scope**
- Migration `migrations/phase-2/002-create-org-setting.mjs`. Single-row collection.
- `src/lib/admin-finance.ts` — `getFinanceTotals()` + `safeSum` helper.
- New page `/admin/finance` with 6 stat tiles + expense ledger panel.
- Super-admin-only "Set platform fee" widget (gated via `requireSuperAdminUser`).
- New endpoint `POST /api/admin/super/org-setting/platform-fee`.
- Audit action `super_admin_set_platform_fee`.
- Sidebar nav addition: `/admin/finance` link, gated to admin (whole link) + super-admin (fee-edit affordance only).

**Test gate:** with sample sponsorships + 1-2 expenses in DB, the 6 tiles produce numerically correct USD totals. Plain admin can read `/admin/finance` but cannot edit the platform fee (403 on the endpoint). Super admin can.

### Phase 2.3 — Impact dashboard + custom metrics

**Scope**
- Migration `migrations/phase-2/003-create-impact-metric.mjs`. Creates `impact_metric` collection + 7 fields + 2 FK relations.
- `src/lib/admin-impact.ts` — derived counts + `listCustomMetrics`.
- New page `/admin/impact` with the derived-counts panel + custom-metrics breakdown.
- DI surface affordance on `/di/children/[id]/deliveries/new` — optional "Record impact" sub-form (add 1 `impact_metric` row alongside the delivery).
- Audit action `di_recorded_impact_metric`.

**Test gate:** counts on the Impact dashboard match the raw row counts in `aid_delivery`, `sponsorship`, `child_update`. Custom metric entry persists + sums correctly per `metric_key`.

### Sequencing recommendation

**2.1 → 2.2 → 2.3.** Each builds on its predecessor's data + module
patterns. 2.2 can ship without 2.3 (Impact is a separate dashboard);
2.3 can ship without 2.2 (it uses no expense data); but 2.1 is a
hard prerequisite for 2.2 (no expenses = nothing for the finance
dashboard to display). 2.1 alone is releasable as "admin can now
record expenses but the dashboards aren't built yet" — useful for
collecting baseline data while the dashboard ships.

---

## 8. Open questions — need Mahmud's product call before build

### Q1. Does OrphanGive actually take a platform fee?

The design ships the platform-fee model regardless (cheap insurance:
`platform_fee_pct = 0` means it's a no-op multiply). But knowing the
answer changes the build emphasis:
- **If yes**, document the fee on the donor-facing transparency page (separate work) and likely deduct it visibly on the donor's monthly receipt.
- **If no**, the entire `org_setting` collection + super-admin widget can be deferred to Phase 2.x.

**Default recommendation:** ship the schema empty so Q1 doesn't block the dashboard; surface the fee elsewhere only when product decides it's real.

### Q2. What currency are on-the-ground disbursements recorded in?

Design assumes **BDT only** (single field office in Bangladesh; field officers spend BDT). If the org ever pays for anything in USD (e.g. an international wire to procure equipment) or in another currency (a partner organisation in a third country), the `amount_bdt` field is wrong as named.

Two-option fallback:
- **(a)** Rename `amount_bdt` → `amount_local` + add `local_currency_code` (ISO 4217). Default to "BDT". Lets any single-currency expense be recorded; multi-currency mixed batches still summed via the USD common unit.
- **(b)** Add a separate `usd_direct_expense` row shape with `amount_usd` direct. Sidesteps FX entirely for USD-denominated spends.

**Default recommendation:** confirm BDT-only for V1. Q2 is the most likely "scope creep" question; locking BDT-only ships fastest. (a) is the right migration if/when needed and is additive.

### Q3. **THE HARD ONE — FX reconciliation between donor-currency IN and BDT OUT.**

Two halves of the FX reality:

**(a) Time-of-charge FX (already done).** A donor in GBP charged £14 at a `bdt_per_unit = 100` rate generates `donor_currency_amount = 14`, `bdt_per_unit_at_checkout = 100`, implied BDT-equivalent = 1,400 BDT, and `sponsorship.amount_usd ≈ 18`. The £14 hits Stripe at a slightly-different real FX rate (Stripe's `exchange_rate` field on the balance transaction). The locked `bdt_per_unit_at_checkout` is the rate OrphanGive ADVERTISED, not the rate Stripe USED to settle.

**(b) Time-of-payout FX.** Stripe payouts to the org's GBP / USD / BDT bank account use Stripe's prevailing wholesale rate at payout time, which differs from both (i) the rate at charge and (ii) the `currency_rate` table that Mahmud edits.

**The gap:** the difference between what OrphanGive advertised (rate at checkout), what Stripe actually moved (rate at settlement), and what's in the bank account today (after Stripe payout FX) is **not modelled**. Three sub-questions:

- **Q3a.** Should the finance dashboard surface Stripe's settled FX delta as an "FX gain/loss" line? (Pulled from Stripe's `balance_transaction.exchange_rate` per charge.)
- **Q3b.** When admin records an `expense.amount_bdt = 1,500`, the corresponding USD figure depends on the rate USED. We propose using `currency_rate WHERE currency_code = 'USD'.bdt_per_unit` at record time. But that's the **advertised** rate, not the rate the cash was actually withdrawn at from the bank. Should we capture an additional `actual_bdt_per_usd_at_withdrawal` field (admin enters when reconciling against the bank statement)?
- **Q3c.** What's the reconciliation policy? Tolerated FX delta % before alerting (1%? 5%?)? Who's responsible for clearing flagged rows?

**Default recommendation for V1:** ignore the Stripe-settlement FX delta entirely (it nets out to small percentages and admin can eyeball Stripe's dashboard for the real numbers). For Q3b, lock the rate to the `currency_rate` table value (the advertised rate) at expense-record time; capture-only, no reconcile workflow. Q3c stays a manual admin process — Phase 2 surfaces the data, doesn't enforce policy.

This is the question that most needs Mahmud's input. A wrong call here means the finance dashboard tells a confidently-wrong story to leadership / regulators / board.

### Q4. Disbursement granularity: per-row, per-batch, or both?

Design ships per-row (one expense = one spend). Admin may want to batch ("I withdrew 50,000 BDT in cash this morning; here are the 30 individual spends from it"). Options:
- **(a)** Per-row only (current design). Admin enters 30 rows. The batch concept lives in their head / a spreadsheet.
- **(b)** Add `expense_batch` collection + `expense.batch` FK. Lets admin enter a cash withdrawal as one batch + 30 rows that sum to it; finance dashboard can show "batch withdrawn vs spent" reconciliation.

**Default recommendation:** (a) for V1. Re-evaluate after admin uses it for a month.

### Q5. Donor-restricted funds (regulatory)

If a donor sponsors a child in the "education" cause (`sponsorship.cause = 'education'`), can OrphanGive spend that donor's money on a "food" expense for the same child? Or must `expense.category` match `sponsorship.cause` when both are populated?

- **Permissive (current implicit policy):** money is pooled; admin allocates per need. The cause is donor intent, not a contractual constraint.
- **Strict:** the finance dashboard flags any expense whose `sponsorship.cause` doesn't match its `category`. Cause becomes a regulatory constraint.

**Default recommendation:** permissive for V1. If a regulator or donor-promise audit ever needs strict, the flag is a one-query addition to the dashboard.

### Q6. Existing `getApprovedChildUpdates` filter bug (carried over from Phase 1 spine design Q5)

The reader at `src/lib/sponsorship-data.ts:912` filters `status = 'approved'` but the writer path uses `status = 'published'`. This affects the Impact dashboard's "Reports sent to donors" count — which value to filter on. Phase 1 spine design recommended standardising on `'published'`; Phase 2 inherits the same recommendation. **Mahmud should confirm** so the Impact reader doesn't ship with the wrong filter.
