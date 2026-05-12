# OrphanGive — pre-launch data audit

Read-only inventory of production Directus state, captured by
[scripts/inventory-production-data.mjs](scripts/inventory-production-data.mjs).
Every record was inspected and categorised. The companion script
[scripts/pre-launch-cleanup.mjs](scripts/pre-launch-cleanup.mjs)
enacts the cleanup actions; **it has NOT been run yet**.

**Snapshot captured:** 2026-05-12 (Session 31)

---

## Summary

| Collection | Count | KEEP | CLEANUP_TEST | NEEDS_DECISION | Unreadable |
|---|---|---|---|---|---|
| `child` | 10 | 10 | 0 | 0 | — |
| `sponsorship` | 73 | 0 | 73 | 0 | — |
| `donor` | ? | ? | ? | 4–5 known | **collection access-gated** |
| `sponsorship_payment` | ? | ? | ? | ? | **collection access-gated** |
| `child_moment` | ? | ? | ? | ? | **field access-gated** |
| `child_update` | ? | ? | ? | ? | **field access-gated** |
| `reveal_request` | ? | ? | ? | ? | **field access-gated** |
| `otp_code` | ? | ? | ? | ? | **collection access-gated** |
| `stripe_event` | ? | ? | ? | ? | **collection access-gated** |

The "unreadable" rows aren't broken — they're a deliberate
Directus permission policy. The `DIRECTUS_SERVER_TOKEN` used by
the diagnostic scripts has a tight scope (correct security
posture). Six collections must be audited manually in Directus
admin by Mahmud. See [§Manual audit checklist](#manual-audit-checklist)
below.

---

## Section 1 — Children (READABLE)

**10 records. All categorised KEEP_PRODUCTION.**

| # | id | display_name | status | division | approved_at | photo |
|---|---|---|---|---|---|---|
| 1 | `f6c4c677-46d…` | Masum Ahmed | active | Khulna | 2026-05-05 | ✓ |
| 2 | `da9a8c24-38d…` | Fahim Khan | active | Dhaka | — | ✓ |
| 3 | `d2778cfe-790…` | Fuad Hasan | active | Mymensingh | — | ✓ |
| 4 | `e7fe331a-cfd…` | Hasib Mia | active | Rangpur | — | ✓ |
| 5 | `16e3dab3-178…` | Imran Ali | active | Chittagong | — | ✓ |
| 6 | `a73ba9af-324…` | Mim Khatun | active | Barisal | — | ✓ |
| 7 | `666b071e-c86…` | Moni. Khatun | active | Chittagong | — | ✓ |
| 8 | `df413757-dfa…` | Nishi Banu | active | Rajshahi | — | ✓ |
| 9 | `d44f51ab-057…` | Salim Hasan | active | Khulna | — | ✓ |
| 10 | `d11fb012-403…` | Tasneem Begum | active | Sylhet | — | ✓ |

Matches the project-state record across Sessions 16, 17, 18 + the
Session 16 metric audit. These are the verified, listed children.

### Action items (NOT cleanup — content prep)
- **Populate `approved_at` for 9 of 10 children.** Only Masum
  Ahmed has it set. The `/children` browse list sorts by
  `approved_at` ascending (longest-waiting first) — without
  values populated, the list falls back to alphabetical. Not a
  cleanup item; a content-prep item for the field team.
- **Verify `Photo` field references on the 10 rows.** All 10
  show `✓` in the table above (Photo column is populated). But
  Session 28 flagged that "Imran Ali photo upload" was still
  outstanding in the pre-launch checklist. Either the audit has
  staled, or the row carries a stale photo reference — verify in
  Directus admin one is a real, consented image and not a
  placeholder.

### Cleanup
**None.** Do not touch any `child` row. The cleanup script
explicitly skips this collection.

---

## Section 2 — Sponsorships (READABLE)

**73 records. ALL categorised CLEANUP_TEST.**

Every row was created between **2026-05-06 and 2026-05-11** — a
6-day internal test window. The donor distribution makes this
unambiguous:

| Donor | Row count | Likely identity |
|---|---|---|
| Muz Khan | 26 | Internal — Mahmud's brother (per Session 16 metric audit context) |
| Suaida Afrin Mim | 41 | Internal — Mahmud's family |
| Hello printAgraphy | 4 | Build credit / partner team test (2026-05-10 → 11) |
| Wafiq Zaeem | 1 | Internal test (2026-05-10) |

**Cleanup confidence: high.** All 73 rows are pre-launch internal
testing. Mix of cancelled, paused, active, and completed states.
Total 73; 5 currently `status='active'` with a `stripe_subscription_id`
set (rows 39, 44, 63, 64, 68 in the original inventory) — those
correspond to LIVE Stripe subscriptions and MUST be cancelled in
Stripe before the Directus row is removed.

### Action items

1. **Cancel 5 live Stripe subscriptions first.** The script
   warns about this loudly. Active subs that don't get cancelled
   in Stripe will keep charging the test card until they hit a
   payment failure. The 5 are listed in the inventory output;
   the cleanup script's `--dry-run` prints them again as a
   pre-flight check.

2. **Refund any captured payments.** Stripe → Payments → filter
   by the test customer email + last-4 → refund any successful
   captures. The Session 26 refund policy timing doesn't apply
   here (these are internal tests, not donor charges) — refunds
   should be processed regardless.

3. **Run the cleanup script.** After Stripe cleanup:
   ```sh
   node scripts/pre-launch-cleanup.mjs --dry-run
   # review output
   node scripts/pre-launch-cleanup.mjs --confirm
   # (defaults to soft archive — sets status='archived'
   # rather than hard delete; preserves Stripe IDs for audit
   # trail)
   ```
   
   For hard delete instead of soft archive:
   ```sh
   node scripts/pre-launch-cleanup.mjs --confirm --hard-delete
   ```

### One important caveat in the script

**`PRODUCTION_CUTOFF_DATE` is currently set to `2099-01-01`** — a
sentinel that flags every existing sponsorship as test. **Before
running `--confirm`, edit the constant in the script to the
moment the public launch goes live.** Anything created after
that timestamp is real and gets skipped.

For the pre-launch run (Mahmud's expected flow): leave the
constant at `2099-01-01` so all 73 rows get cleaned. After
launch, if there's a need to re-run for a smaller scope (e.g.
to clean up another internal-test batch), update the constant.

---

## Section 3 — Donors (PARTIALLY READABLE via sponsorship FKs)

The `donor` collection itself is access-gated by Directus
policy — the service token can't read it directly. But every
sponsorship row exposes its donor via FK expansion, so we know
which donor identities exist in production:

| Donor name | Email visible? | Status | Categorisation |
|---|---|---|---|
| Muz Khan | (visible to sponsorship JOIN but not surfaced here) | Active | **NEEDS_DECISION** — internal/family alias |
| Suaida Afrin Mim | (same) | Active | **NEEDS_DECISION** — internal/family alias |
| Wafiq Zaeem | (same) | Active | **NEEDS_DECISION** — internal/family alias |
| Hello printAgraphy | (same) | Active | **NEEDS_DECISION** — partner team test |

**Plus zero or more donor rows with no sponsorships** — these
exist in the `donor` collection but never created a sponsorship
record. Cannot enumerate them without direct read access. Audit
manually.

### Action items — NEEDS_DECISION

Mahmud must decide, per donor:

1. **Muz Khan / Suaida Afrin Mim / Wafiq Zaeem** — family /
   internal aliases. Options:
   - Keep all three accounts for ongoing internal testing
     post-launch (recommend: keep, but mark with a
     `og_internal_account = true` flag to filter out of metric
     dashboards)
   - Delete after pre-launch cleanup completes
2. **Hello printAgraphy** — partner-team account. Keep for
   partner relationship continuity, or delete?
3. **Any orphan donor rows** (donor exists but has zero
   sponsorships): inspect via Directus admin. Likely safe to
   delete unless one is your own test admin account.

**Until Mahmud decides:** the cleanup script does NOT modify
any donor row.

### Manual cleanup procedure (via Directus admin)

Once the decisions are made, in Directus admin:

```
Directus admin → Content → donor collection
  - Sort by date_created ASC
  - For each test/cleanup-target row:
      Option A (full delete): Delete Item button
      Option B (soft archive): set status='closed' + 
        first_name='Deleted' + last_name='User' + 
        email='deleted+<id>@orphangive.org'
```

The latter (Option B) is the same procedure the
[OPS_RUNBOOK.md](OPS_RUNBOOK.md#donor-data-deletion-request)
documents for real GDPR-style deletion requests post-launch. It
preserves Stripe customer linkage for audit/refund handling.

---

## Section 4 — Other collections (UNREADABLE)

The following collections returned access-denied errors from the
diagnostic script. They need a manual audit via Directus admin.

### `sponsorship_payment`

**Manual audit checklist:**
- Sort by `date_created` ASC
- Every row dated before public launch corresponds to a test
  sponsorship → flag for cleanup alongside the parent sponsorship
- After running the sponsorship cleanup script: payment rows
  may become orphaned (referencing deleted/archived
  sponsorships). Decide whether to:
  - Cascade-delete on the Directus relation (configure in
    schema), or
  - Manually delete the matching payments after running the
    sponsorship cleanup script

### `child_moment` and `child_update`

**Manual audit checklist:**
- These are the moments/updates content rows the donor
  dashboard's `/dashboard/updates` page surfaces
- Any pre-launch test entries → flag for cleanup
- New content should be authored by CH Trust's field team only;
  pre-launch entries from internal testing should be marked
  inactive or deleted

### `reveal_request`

**Manual audit checklist:**
- Donor requests for sensitive child fields (address, guardian,
  school name)
- Any request from a test donor (Muz, Suaida, Wafiq, printAgraphy)
  → cleanup
- Any approved request with a real `expires_at` in the future →
  decide whether to expire early or let it run out

### `otp_code`

**Manual audit:** all rows pre-launch are test OTPs. Safe to
truncate the entire collection if you want a clean baseline.
There's also `/api/cron/cleanup-otp` already wired which expires
old codes automatically — that cron may have already kept this
clean.

### `stripe_event`

**Manual audit:** event records correspond 1:1 with webhook
deliveries. These shouldn't be cleaned — they're the audit
trail. Don't delete. (Mahmud: verify the table isn't growing
unboundedly; if it's >10k rows, consider archiving rows older
than 90 days.)

---

## Cleanup actions summary

What the cleanup script WILL do when run with `--confirm`:

1. Identify every `sponsorship` row with `date_created` before
   `PRODUCTION_CUTOFF_DATE` (currently 2099-01-01 — sentinel
   that catches all 73 known rows)
2. For each, either:
   - **`--confirm` (default soft archive):** update `status`
     field to `'archived'`. Preserves the row for audit trail;
     hides it from the active queries used by `/dashboard/*`
     and `/children` etc.
   - **`--confirm --hard-delete`:** call Directus `deleteItem`
     to remove the row entirely. Cascade behaviour depends on
     the Directus schema — payment rows may become orphaned.
3. Log every action to `/tmp/orphangive-cleanup-<ts>.log` plus
   stdout
4. Explicitly NOT touch:
   - The `child` collection (always)
   - The `donor` collection (access-gated by Directus anyway)
   - Any sponsorship row with `date_created` ≥
     `PRODUCTION_CUTOFF_DATE`

## Expected state after cleanup

Once Mahmud runs the script in production:

- `child`: 10 active rows (unchanged)
- `sponsorship`: 0 active rows (if soft-archive) OR 0 rows
  total (if hard delete). All 73 test rows cleared.
- `donor`: depends on Mahmud's manual decisions per §3
- `sponsorship_payment` etc: depends on Mahmud's manual audit
  per §4

## Manual audit checklist

Mahmud — these are the cleanup actions that require Directus
admin access (the service token can't reach them):

- [ ] Decide on Muz Khan / Suaida Afrin Mim / Wafiq Zaeem
      donor accounts (keep + flag internal, OR delete)
- [ ] Decide on Hello printAgraphy donor account
- [ ] Audit `donor` collection for orphan rows (no sponsorships,
      not a known test account)
- [ ] Audit `sponsorship_payment` — flag pre-launch test rows
- [ ] Audit `child_moment` + `child_update` — flag pre-launch
      test entries
- [ ] Audit `reveal_request` — expire or delete any from test
      donors
- [ ] Decide on `otp_code` — truncate or let the cron clean it
- [ ] Leave `stripe_event` alone (audit trail)

After completing the manual audit:

1. Cancel any live Stripe subscriptions referenced by
   sponsorship rows (see Phase 1 pre-flight warning)
2. Refund any captured Stripe payments for test donors
3. Update `PRODUCTION_CUTOFF_DATE` in
   `scripts/pre-launch-cleanup.mjs` to the public-launch
   moment
4. Run `node scripts/pre-launch-cleanup.mjs --dry-run`, review
5. Run `node scripts/pre-launch-cleanup.mjs --confirm`
   (soft archive) — recommended first pass
6. Optionally re-run with `--confirm --hard-delete` once the
   soft archive has been audited

---

## Self-audit

- [x] Every readable collection inventoried
- [x] Every record in readable collections categorised
- [x] Cleanup script written
- [x] Cleanup script **NOT RUN** (verified — script defaults to
      printing a refusal if no flag passed)
- [x] Audit report committed
- [x] Production data unmodified
- [x] Branch off main; main untouched
