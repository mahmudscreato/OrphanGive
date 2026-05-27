# Admin OS — Donation Fulfillment Lifecycle: build-ready design

**Branch:** `design/donation-lifecycle`
**Base:** `main` (post Phase 0 — sponsorship FKs landed; pre Spine 1.2 merge)
**Status:** design only. No source changed. No migration written.
**Ground truth:**
- `docs/admin-os/00-discovery.md` (broad audit; sponsorship status enum + readers/writers)
- `docs/admin-os/01-phase0-diagnostic.md` §A, §C (FK additions + audit-write paths)
- `docs/admin-os/02-spine-design.md` v2 (Phase 1 task + report lifecycle — partly merged on `feature/spine-1.2-report-lifecycle`)
- Live schema probe: `og-postgres-local` `sponsorship.status DISTINCT → pending_payment | active | paused | cancelled | completed | failed` (probed in design pass)

---

## 0. What we're closing

Today a donor confirms a donation, payment captures, and **nothing visible
happens to the donor between charge-success and (eventually, maybe) a
"sponsorship-welcome" email** (`src/lib/email.ts` + Session 14.5b
inline triggers). There is no visible **fulfillment journey**:
"we received your gift → we're working on it → we delivered it." The
data exists in pieces (`task`, `child_update`, `aid_delivery` — all
spine-1.2 collections) but never composes into a single
donor-comprehensible status.

Mahmud's ask, restated: every donation, from the donor's POV and
admin's POV, has a fulfillment status that:
1. Starts at **Pending** when payment confirms.
2. Advances through **Processing → In Delivery → Delivered** as the
   field workflow proceeds.
3. Supports exception states: **On Hold / Disputed / Refund Requested /
   Refunded / Cancelled**.
4. Is visible (with the right slice) to Donor, DI, Admin, and Super
   Admin.

And — critically — **does NOT collide with the existing
`sponsorship.status` payment lifecycle**, which is Stripe-driven and
must keep doing its job.

---

## 1. The collision risk (why we design first)

### 1.1 Existing `sponsorship.status` is payment lifecycle

Verified on `main`:

| File | What it does |
|---|---|
| `src/lib/sponsorship-data.ts:9-15` | declares `type SponsorshipStatus = 'pending_payment' \| 'active' \| 'paused' \| 'cancelled' \| 'completed' \| 'failed'` |
| `src/app/api/admin/sponsorships/[id]/{cancel,pause,resume,refund}/route.ts` | Admin payment-lifecycle writers. Each writes audit rows (Phase 0 diagnostic §C.2) |
| `src/app/api/sponsorship/[id]/{cancel,pause,resume,extend,modify-amount,visibility,cancel-queued,queue-shift}/route.ts` | Donor self-service payment writers (no audit writes — Phase 0 §C.4) |
| `src/app/api/webhooks/stripe/route.ts` | Stripe-driven status mutator (active on first charge, completed on prepaid exhaust, failed on charge-failed). Phase 0 added per-event audit. |
| `src/app/api/cron/decrement-prepaid/route.ts` | Auto-cancel when prepaid months exhaust |
| `src/lib/sponsorship-data.ts` (`updateItem` write paths) | Multiple touch points |

Plus `sponsorship.queue_status: 'queued' | null` (lines 89-99) for the
waitlist concept.

**This is one of the load-bearing tables in the app.** Any new
fulfillment status MUST live somewhere this set of writers will not
touch.

### 1.2 The spine (1.1 + 1.2) already covers most of the journey

Per `02-spine-design.md` v2, on the spine branch we have:

| Concept | Where lives | Status enum |
|---|---|---|
| Field task | `task` collection (Session 41-v3) + `task.sponsorship` FK (Phase 0) | `di_status: open \| in_progress \| completed_pending_verification`; `admin_status: open \| verified_complete \| rejected_redo` |
| DI evidence | `aid_delivery` collection + `aid_delivery.sponsorship` FK (Phase 0) | `pending \| verified \| rejected` |
| Donor-facing report | `child_update` collection + `child_update.sponsorship` + `child_update.task` FKs (Phase 0 + spine 1.2) | `draft \| submitted_by_di \| under_admin_review \| approved \| correction_requested \| published \| rejected` (spine 1.2's "published" === "sent to donor") |

Mapping these onto Mahmud's fulfillment names:

| Mahmud's name | Most natural spine signal |
|---|---|
| **Pending** | No `task` exists yet for this sponsorship (or for "the current cycle") |
| **Processing** | `task` exists; `task.di_status ∈ {open, in_progress}` |
| **In Delivery** | `task.di_status = completed_pending_verification` OR `child_update.status ∈ {submitted_by_di, under_admin_review, correction_requested}` (the report is in the admin pipeline) |
| **Delivered** | `child_update.status = published` (spine's "sent to donor") |
| **On Hold / Disputed / Refund Requested / Refunded / Cancelled** | NOT representable in the spine — these are admin/donor-driven gestures outside the field workflow |

**Implication:** the "happy path" fulfillment status is already a
derivable function of the spine. The "exception path" needs its own
storage.

---

## 2. RECOMMENDATION — Hybrid: derived happy-path + stored exception field

### 2.1 The shape

**One new nullable column on `sponsorship`:**

```
sponsorship.fulfillment_exception  enum nullable, default null
                                   values: 'on_hold' | 'disputed'
                                         | 'refund_requested'
                                         | 'refunded'
                                         | 'cancelled_fulfillment'
```

**Plus an aggregate column for monthly sponsors only (V2 candidate, NOT V1 — see §F):**

```
(deferred to V2) sponsorship.cycles_delivered_count  integer, default 0
                                                    incremented atomically on each
                                                    child_update.status='published'
```

**That is it.** No `sponsorship.fulfillment_status` column. No separate
`fulfillment` collection. No duplicate state machine.

### 2.2 The display value (derived at read time)

A new server-only helper `getFulfillmentStatus(sponsorshipId)` in
`src/lib/sponsorship-fulfillment.ts` returns a discriminated union:

```typescript
type FulfillmentStatus =
  | { phase: 'pending';      since: string }   // payment captured, no task yet
  | { phase: 'processing';   taskId: string; since: string; etaDays?: number }
  | { phase: 'in_delivery';  taskId: string; reportId?: string; since: string }
  | { phase: 'delivered';    reportId: string; deliveredAt: string }
  // Exception phases — set explicitly by admin via a write path:
  | { phase: 'on_hold';       reason: string; since: string }
  | { phase: 'disputed';      reason: string; since: string }
  | { phase: 'refund_requested'; since: string }
  | { phase: 'refunded';      refundedAt: string }
  | { phase: 'cancelled_fulfillment'; since: string }
```

**Resolution order** (first match wins):

> **Option A correction (post-sub-phase-2):** the earlier draft of this
> section put the payment-cancelled check at #1, which contradicted
> §B.2's "strictly independent axes" intent — admin's explicit
> `disputed` or `on_hold` gestures on a cancelled sponsorship would be
> masked as "Cancelled". Locked correction: **all four exception
> column values take precedence over payment-cancelled, not just the
> refund flow.** An admin's explicit fulfillment exception is always
> surfaced to the donor regardless of payment state. The Q5 composite
> (delivered + sponsorship-ended) still fires for the NO-exception
> delivered+cancelled case.

```
1. If sponsorship.fulfillment_exception = 'refunded'         → phase = 'refunded'
2. If sponsorship.fulfillment_exception = 'refund_requested' → phase = 'refund_requested'
3. If sponsorship.fulfillment_exception = 'disputed'         → phase = 'disputed'
4. If sponsorship.fulfillment_exception = 'on_hold'          → phase = 'on_hold'

5. If sponsorship.status ∈ {cancelled, failed} AND no exception:
   - if a child_update.status='published' exists for this sponsorship:
       phase = 'delivered' WITH sponsorshipEndedAt set
       (Q5 terminal composite — donor UI renders
        "Delivered • Sponsorship ended [date]")
   - otherwise:
       phase = 'cancelled_fulfillment'

6. If sponsorship.status = 'paused' AND no exception → phase = 'on_hold'
   (Q1 lock: DISPLAYED not WRITTEN — resuming payment auto-resumes
    fulfillment because no exception column was set.)

7. If sponsorship.status = 'pending_payment'        → display nothing yet
                                                     (donation isn't "in" until Stripe confirms)

8. Derived spine phase:
   - If a child_update.status='published' exists    → phase = 'delivered'
                                                     (latest cycle for monthly)
   - If a child_update.status ∈ {submitted_by_di,
     under_admin_review, approved, correction_requested,
     pending}                                       → phase = 'in_delivery'
   - If a task exists AND task.di_status =
     'completed_pending_verification'               → phase = 'in_delivery'
   - If a task exists AND task.di_status ∈ {open,
     in_progress}                                   → phase = 'processing'
   - Fallback                                       → phase = 'pending'
```

For **monthly** sponsorships, "delivered" means *the latest cycle is
delivered.* Each cycle is a (task, child_update) pair. The previous
cycles being delivered does NOT make the sponsorship "stuck delivered" —
when admin creates the next month's task, the latest-cycle-derived
status flips back to **Processing**. This is the natural emergent
behavior of resolving against "the most recent task/report for this
sponsorship" rather than "any task/report ever."

For **one-time** sponsorships (`payment_mode='one_time'`), it's a
single linear journey; once `delivered`, it stays delivered.

### 2.3 Why this shape — derived-vs-stored explicitly

The brief asked the design to address derived-vs-stored explicitly.
Here's the trade-off table:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **(a) Stored `sponsorship.fulfillment_status`** (full enum, written by every spine transition) | Single column scan for admin filters; donor query needs no join | **High drift risk**: two state machines updating two columns out-of-band. Every task transition, every report status flip, every admin gesture needs to remember to also write `fulfillment_status`. Phase 0 §C.4 already documented this kind of drift on the donor self-service writers (they don't write audit). Adding another "must remember to write" column repeats the lesson the codebase keeps learning. | ❌ |
| **(b) Fully derived (no column)** | Zero drift — spine IS the source of truth | Exceptions (on_hold / disputed / refund_requested) have no signal in the spine — they need somewhere to live. Also: admin filter "show me sponsorships in Processing" needs a join through `task` per row, OK at current scale but unbounded. | ❌ for exceptions; ✅ for happy path |
| **(c) Hybrid: derived happy path + stored exception** | Zero drift on the path the spine already drives. Exception storage isolated to one nullable enum that only the exception writers touch. | One extra column-level read on every fulfillment query (cheap). | ✅ — **recommended** |

The hybrid mirrors how `aid_delivery.status` and
`child_update.status` interact with `sponsorship.status` today: each
status field is owned by exactly one writer set, and the dashboard
composes them. That convention already works in this codebase.

### 2.4 Why a *separate* exception field (and not e.g. a side-collection or status enum extension)

| Considered | Rejected because… |
|---|---|
| **Extend `sponsorship.status` enum** with `on_hold`, `disputed`, `refunded` | The point of this design is to NOT collide with payment status. Stripe writes `cancelled/active/paused`; admin's "on_hold for fulfillment reasons" needs to coexist with `status='active'` (payment is fine; delivery is on hold for child-family-situation reasons). One enum can't represent both axes. |
| **Net-new `sponsorship_fulfillment_state` collection** with row-per-sponsorship | Schema bloat for one nullable enum + timestamp. The collection adds joins to every read without adding meaningful structure. Defer to V2 only if exception history (multiple on_hold → resume cycles) becomes important. |
| **A boolean `is_on_hold` + a `disputed_at` + a `refund_requested_at` + …** | Multiple parallel timestamp columns reproduce the spine's anti-pattern. One enum + one timestamp + one reason text is cleaner. |

---

## A. Status set + transitions

### A.1 Status values + meanings

| Status | Meaning (plain) | Setting event |
|---|---|---|
| **Pending** | Donor's payment confirmed; admin hasn't allocated this gift to fieldwork yet. | Derived: `task` for this sponsorship doesn't exist yet AND no `child_update` either. |
| **Processing** | Admin assigned a DI to deliver this; DI is doing the work. | Derived: an active `task` exists with `task.sponsorship = id` AND `task.di_status ∈ {open, in_progress}`. |
| **In Delivery** | DI has filed evidence / a draft report; admin reviewing for donor send-out. | Derived: `task.di_status = completed_pending_verification` OR a `child_update` exists with `status ∈ {submitted_by_di, under_admin_review, approved, correction_requested}`. |
| **Delivered** | Donor was notified; the cycle is closed for this gift. | Derived: a `child_update.status = 'published'` row exists with `.sponsorship = id`. For monthly, refers to the latest cycle. |
| **On Hold** | Admin paused fulfillment for non-payment reasons (family situation, safeguarding flag, seasonal delay). Payment status unaffected. | Stored: `sponsorship.fulfillment_exception = 'on_hold'`. Admin sets via new endpoint. |
| **Disputed** | Donor raised a concern about delivery quality / accuracy. | Stored: `'disputed'`. Admin sets via new endpoint (typically in response to donor support ticket — see `00-discovery.md` §S6 "Support tickets" gap; Phase 2.x). |
| **Refund Requested** | Donor (or admin on donor's behalf) initiated refund flow; not yet refunded. | Stored: `'refund_requested'`. |
| **Refunded** | Refund completed. (Distinct from `sponsorship.status='cancelled'` which is the payment-side state; refund_requested→refunded is the fulfillment-side reflection of the same event, kept separate so reports show "this gift was refunded" without conflating with subscription churn.) | Stored: `'refunded'`. Set by the existing refund handler — see §C below. |
| **Cancelled (fulfillment)** | The fulfillment journey is cancelled. Used for: payment failed before fulfillment started, OR admin cancelled fulfillment explicitly (rare). | Mostly derived: `sponsorship.status ∈ {'cancelled', 'failed'}` AND no report ever shipped. Optional explicit override via `sponsorship.fulfillment_exception = 'cancelled_fulfillment'`. |

### A.2 Transition diagram

```
              Stripe charge succeeds
                       │
                       ▼
                   ┌───────┐
                   │PENDING│ ◄────── (sponsorship.status='active' OR 'completed';
                   └───┬───┘          no task yet)
                       │
              admin creates a task for this sponsorship
              (via Spine 1.1's "Create field task" button)
                       │
                       ▼
                ┌──────────┐
                │PROCESSING│
                └────┬─────┘
                     │
              DI files report (or marks task completed_pending_verification)
                     │
                     ▼
                ┌──────────────┐
                │ IN_DELIVERY  │
                └──────┬───────┘
                       │
              admin approves report AND sends to donor
              (Spine 1.2/1.3: child_update.status = 'published')
                       │
                       ▼
                ┌─────────┐
                │DELIVERED│  ◄── for one-time: terminal
                └─────────┘      for monthly: next admin "Create field task"
                                  flips back to PROCESSING (next cycle)

   ─── Exception branches (admin sets sponsorship.fulfillment_exception) ───

   ANY non-terminal phase
        │
        ├──► ON_HOLD  ◄── admin paused; revert via "Resume fulfillment" → null exception → re-derive
        ├──► DISPUTED ◄── donor raised concern; resolves via "Mark resolved" → null exception → re-derive
        ├──► REFUND_REQUESTED ──► REFUNDED  (terminal-for-this-gift)
        └──► CANCELLED_FULFILLMENT (terminal — payment failed / explicit admin abort)
```

### A.3 What event causes each transition

| Transition | Trigger | Actor |
|---|---|---|
| Pending → Processing | Spine 1.1 admin task-creation endpoint fires (`POST /api/admin/tasks/create`) with `task.sponsorship = id` | Admin |
| Processing → In Delivery | DI's task-transition endpoint sets `task.di_status='completed_pending_verification'` (`POST /api/di/tasks/[id]/transition`) OR DI's report-submit endpoint creates a `child_update.status='submitted_by_di'` (`POST /api/di/reports`) | DI |
| In Delivery → Delivered | Spine 1.3 "Send to donor" endpoint sets `child_update.status='published'` (`POST /api/admin/reports/[id]/send`) | Admin |
| (monthly cycle restart) Delivered → Processing | Admin creates the next task for the same sponsorship | Admin |
| Any → On Hold | `POST /api/admin/sponsorships/[id]/fulfillment-hold` (NEW) | Admin |
| On Hold → (re-derive) | `POST /api/admin/sponsorships/[id]/fulfillment-resume` (NEW) | Admin |
| Any → Disputed | `POST /api/admin/sponsorships/[id]/fulfillment-dispute` (NEW; also auto-fires when a support ticket of type 'delivery_dispute' is opened against this sponsorship — V2) | Admin / system |
| Disputed → (re-derive) | `POST /api/admin/sponsorships/[id]/fulfillment-dispute-resolve` (NEW) | Admin |
| Any → Refund Requested | `POST /api/admin/sponsorships/[id]/fulfillment-refund-request` (NEW) OR donor-self-service refund flow (deferred to V2) | Admin / Donor (via support) |
| Refund Requested → Refunded | The existing refund handler (`POST /api/admin/sponsorships/[id]/refund`) fires — extend to also set `fulfillment_exception='refunded'` atomically with the Stripe refund (single transaction). | Admin |
| Any → Cancelled Fulfillment | Mostly derived from `sponsorship.status` — no new endpoint needed. Optional manual override is admin-only. | Stripe webhook / Admin |

---

## B. Data model

### B.1 Storage shape (recommended)

```sql
-- Single new column on the existing sponsorship table.
ALTER TABLE sponsorship
  ADD COLUMN fulfillment_exception varchar(32)  NULL,
  ADD COLUMN fulfillment_exception_at timestamptz NULL,
  ADD COLUMN fulfillment_exception_reason text NULL,
  ADD COLUMN fulfillment_exception_by uuid NULL;

-- FK on exception_by → directus_users(id) ON DELETE SET NULL
-- Two-step Directus pattern (POST /fields, POST /relations), per Phase 0 convention.
```

Plus the spine 1.2 columns on `task` and `child_update` (already
landing on `feature/spine-1.2-report-lifecycle`).

**That is the entire schema change for V1.** No new collection, no
state-machine table, no per-cycle row.

### B.2 Relationship to payment status

| Column | Owner / writers | What it represents |
|---|---|---|
| `sponsorship.status` | Stripe webhook + admin payment-lifecycle endpoints + donor self-service + cron | **Payment** lifecycle. Will the donor be charged again? Is the subscription alive? |
| `sponsorship.fulfillment_exception` | Admin via new endpoints + the existing refund handler (one mutual write) | **Fulfillment** exception layer. Is delivery paused/disputed/refunded *outside* the spine? |
| (derived) `getFulfillmentStatus().phase` | `src/lib/sponsorship-fulfillment.ts` | The composed view a stakeholder sees. |

**Critical:** the two columns are independent axes. Examples:

| `sponsorship.status` | `fulfillment_exception` | Spine state | Result |
|---|---|---|---|
| `active` | `null` | task `open` | "Processing" |
| `active` | `'on_hold'` | task `open` | "On Hold" (admin paused fulfillment; payment continues) |
| `paused` | `null` | task `open` | "On Hold (payment paused)" — payment-pause SHOULD halt fulfillment too; see Open Q3 |
| `cancelled` | `null` | report `published` exists | "Delivered" — the gift was delivered before cancellation; status reflects donor's last visible state |
| `cancelled` | `null` | no report | "Cancelled" (derived from payment) |
| `active` | `'refunded'` | (any) | "Refunded" — admin refunded a charge mid-fulfillment; takes precedence over spine signals |
| `failed` | `null` | (any) | "Cancelled" (derived) |

The display-time resolver (§2.2) encodes these precedences once.

### B.3 Relationship to task + report (spine)

| Spine entity | Role in fulfillment | Read pattern |
|---|---|---|
| `task` (with `task.sponsorship` FK) | The "Processing" signal. Latest task per sponsorship is what matters. | `readItems('task', { filter: { sponsorship: { _eq: id } }, sort: ['-date_created'], limit: 1 })` |
| `aid_delivery` (with `aid_delivery.sponsorship` FK) | NOT a fulfillment status signal in V1 — it's evidence, not communication. The donor-visible step is the report, not the raw delivery. The spine's design says `aid_delivery` rolls UP into `child_update`. | n/a (not read by fulfillment resolver) |
| `child_update` (with `child_update.sponsorship` + `child_update.task` FKs) | The "In Delivery" + "Delivered" signal. Latest report per sponsorship is what matters. | `readItems('child_update', { filter: { sponsorship: { _eq: id } }, sort: ['-id'], limit: 1 })` |

**No FK changes** in fulfillment design — Phase 0 + spine 1.2 already
added every FK we need. This design adds 4 columns on `sponsorship`,
period.

### B.4 What does NOT change

- **No `sponsorship.fulfillment_status` column** (derived, not stored — §2)
- **No new collection** (deferred — `sponsorship_fulfillment_cycle` is V2 if Mahmud wants per-cycle history for monthly)
- **No edits to** `task` / `aid_delivery` / `child_update` lifecycles (the spine is already correct; fulfillment is a READ-LAYER VIEW on top of it + one exception field)
- **No Stripe webhook changes** — payment status keeps doing exactly what it does today

---

## C. Who moves it (role × transition)

Mapping against Phase 0's role model (`super_admin`, `admin`, `data_inputter`):

| Transition | Super Admin | Admin | DI | System (webhook/cron) |
|---|---|---|---|---|
| Pending → Processing | ✓ (inherits admin) | ✓ — creates task | — | — |
| Processing → In Delivery | — | — | ✓ — files report or marks task complete | — |
| In Delivery → Delivered | ✓ (inherits admin) | ✓ — sends report to donor (Spine 1.3) | — | — |
| (monthly) Delivered → Processing next cycle | ✓ (inherits admin) | ✓ — creates next task | — | — |
| → On Hold (set exception) | ✓ | ✓ | — | — |
| → Disputed | ✓ | ✓ | — | system: support-ticket type='delivery_dispute' (V2) |
| → Refund Requested | ✓ | ✓ | — | — |
| Refund Requested → Refunded | ✓ — sensitive action; **super-admin-only** to match the existing `requireSuperAdminUser` gate on `/api/admin/sponsorships/[id]/refund` (Phase 0 §B) | partial: admin can REQUEST; cannot complete | — | — |
| → Cancelled Fulfillment | ✓ (inherits admin) | ✓ | — | system: derived from `sponsorship.status` transition |
| Re-derive (clear exception) | ✓ | ✓ | — | — |

**Auth gates** (new endpoints):

- All `POST /api/admin/sponsorships/[id]/fulfillment-*` routes: `requireAdminUser()` (Phase 0 helper). Plus role-tier check inside the handler for `refunded` writes — `requireSuperAdminUser()`, matching the existing refund endpoint convention.

**Audit** — extend the existing `AuditAction` union with:
- `admin_set_fulfillment_on_hold`, `admin_resumed_fulfillment_from_hold`
- `admin_flagged_fulfillment_disputed`, `admin_resolved_fulfillment_dispute`
- `admin_requested_fulfillment_refund`
- (the existing `admin_refunded_sponsorship_charge` audit covers refund completion; we extend its metadata to include `fulfillment_exception_at` for traceability)

Same pattern as Phase 0 — register in `AuditAction` union + `AUDIT_LABELS` map + icon maps.

---

## D. Stakeholder visibility matrix

The 3-tier privacy contract from `00-discovery.md` §S9 and Phase 0 §E.1
applies — donors see ONLY their own sponsorship's fulfillment status;
no Tier-3 child info leaks into the donor surface.

### D.1 Per-role visibility

| Status / data point | Donor (their own only) | DI | Admin | Super Admin |
|---|---|---|---|---|
| **Phase label** (Pending / Processing / In Delivery / Delivered) | ✓ on `/dashboard/sponsorship/[id]` | ✓ when child is in their scope | ✓ all sponsorships | ✓ |
| **"Since" timestamp** | ✓ | ✓ | ✓ | ✓ |
| **DI assigned (name)** | ❌ (donor doesn't need to know the field officer's identity) | ✓ self | ✓ | ✓ |
| **Task title / description** | ❌ (admin's task text may contain operational detail) | ✓ for tasks assigned to self | ✓ | ✓ |
| **Report title + donor-text body** | ✓ when phase=Delivered (per Spine 1.2 — donor reader uses `COALESCE(donor_text, content)`) | ✓ their own DI report | ✓ all | ✓ |
| **DI's original `content`** (forensic record) | ❌ | ✓ own | ✓ all | ✓ |
| **`fulfillment_exception` enum value** | ✓ (mapped to donor copy — "On hold / Disputed / Refund requested / Refunded") | ❌ (DI is not part of the exception loop) | ✓ | ✓ |
| **`fulfillment_exception_reason`** (admin's free-text rationale) | ⚠ partial — "On hold" reasons surface a donor-friendly version only (admin maintains a SEPARATE `donor_visible_reason` field — see Open Q5); "Disputed" reason never surfaces to donor | ❌ | ✓ | ✓ |
| **`fulfillment_exception_by`** (which admin) | ❌ | ❌ | ✓ | ✓ |
| **Tier-2 child fields** (siblings, household, etc.) | ✓ as already permitted | ✓ scope | ✓ | ✓ |
| **Tier-3 child fields** (district, exact DOB, guardian phone, school name) | ❌ | ✓ scope | ✓ | ✓ |

### D.2 Donor-side surfaces

`/dashboard` (donor home) — surface a per-sponsorship fulfillment
pill on each sponsorship card. New helper
`getDonorFulfillmentSummary(donorId)` returns one phase + label per
sponsorship.

`/dashboard/sponsorship/[id]` — show the full timeline: Pending →
Processing → In Delivery → Delivered with timestamps. When phase ∈
{On Hold, Disputed, Refund Requested, Refunded}, render the
exception banner above the timeline with the donor-visible reason
copy. NEVER expose `fulfillment_exception_reason` raw.

### D.3 DI-side surfaces

DI doesn't directly see "fulfillment phase" — they see TASKS (Spine
1.1's `/di/tasks` + `/di/tasks/[id]`). The fulfillment phase is a
view computed at the admin/donor layer FROM the DI's task work; DI
doesn't need a fulfillment column. If a sponsorship is on hold, DI
sees this only indirectly: admin closes/holds the task and DI's
task disappears from their queue (no new UI needed).

### D.4 Admin-side surfaces

`/admin/sponsorships` (list) — add a **Fulfillment** column showing
the derived phase, color-coded. Filter pills for each phase. Today
this list filters by payment `status`; the new column is independent.

`/admin/sponsorships/[id]` — new "Fulfillment" panel showing:
- Current phase + since
- Timeline of past cycles (for monthly) — each prior `child_update.status='published'` row
- Linked task (latest, with link to `/admin/tasks/[id]` — Spine 1.1)
- Linked report (latest, with link to `/admin/reviews/reports/[id]` — Spine 1.2)
- **Action buttons** (admin-only): "Mark on hold", "Mark disputed", "Mark refund requested". On-hold buttons require a reason text field + an optional donor-visible reason.
- Refund completion is the existing Refund button (extend to set `fulfillment_exception='refunded'` in the same transaction).

### D.5 Super Admin surfaces

Inherits all admin views. The only super-admin-specific gate is the
refund completion (matches existing convention from Phase 0 §B). No
super-admin-only fulfillment dashboard in V1.

---

## E. UI implications (described, not designed)

### E.1 Donor dashboard

**Requirements** (not pixels):
- A fulfillment pill on each sponsorship card on `/dashboard`. Six visual states (one per phase).
- A fulfillment timeline component on `/dashboard/sponsorship/[id]` showing the 4 happy-path phases + the current one highlighted, with timestamps from the spine entities (task.date_created for Processing-since, child_update.date_created for In-Delivery-since, child_update.published_at for Delivered).
- Exception banner above the timeline when applicable.
- For monthly: a "cycles delivered" counter ("3 of 12 monthly updates delivered").
- For one-time: no counter; the delivery is the journey's end.

**Donor copy table** (one source of truth, kept in `src/lib/sponsorship-fulfillment-copy.ts`):

| phase | donor headline | donor sub-copy |
|---|---|---|
| pending | "Your gift is queued for fieldwork" | "Our team will start work shortly." |
| processing | "Our field officer is on it" | "Visiting [Child] and preparing your gift's delivery." |
| in_delivery | "Almost there" | "Field evidence received — our team is reviewing before we share it with you." |
| delivered | "Delivered" | "Read the update from the field." (CTA → the report) |
| on_hold | "Briefly on hold" | (donor_visible_reason text from admin) |
| disputed | "We're looking into this" | "Our team is reviewing this delivery. You'll hear from us shortly." |
| refund_requested | "Refund being processed" | "We've received your request. Once complete you'll see this update." |
| refunded | "Refunded" | "This gift has been refunded in full." |
| cancelled_fulfillment | "Cancelled" | "This gift's fulfillment has been cancelled. Contact support for details." |

### E.2 Admin dashboard

**Requirements**:
- New **Fulfillment** filter column on `/admin/sponsorships` list (filterable by phase).
- New **Fulfillment** panel on `/admin/sponsorships/[id]` (per §D.4).
- New admin home tile: "Fulfillment exceptions" — counts `sponsorship.fulfillment_exception IS NOT NULL` rows, click-through to a filtered list. Same pattern as the existing pending-review tiles (`src/app/admin/(authed)/page.tsx`).
- An aggregate `/admin/fulfillment` (V2) that shows phase distribution across all sponsorships — defer; the per-sponsorship-list filter covers V1.

### E.3 DI dashboard

**Requirements**:
- **No new DI surface** for fulfillment phase. DI sees tasks; fulfillment phase is a view on top of tasks they don't need.
- The existing `/di/tasks/[id]` detail page from spine 1.2b is sufficient — DI knows what to do without needing to know what "phase" the donor sees.

---

## F. Build plan — four independently-testable sub-phases

Each sub-phase is shippable in isolation; later phases assume earlier
phases are merged. Test gate = tsc clean + next build clean + manual
click-test on localhost stack.

### Phase F.1 — Schema + read layer (no UI)

**Scope:**
- Migration `migrations/fulfillment/001-add-exception-fields.mjs` adding 4 columns to `sponsorship`: `fulfillment_exception`, `fulfillment_exception_at`, `fulfillment_exception_reason`, `fulfillment_exception_by` (+ FK to `directus_users` on `_by`). Two-step Phase 0 pattern.
- New `src/lib/sponsorship-fulfillment.ts` exporting `getFulfillmentStatus(sponsorshipId)` + `getDonorFulfillmentSummary(donorId)`. Reads-only; reads spine entities + the new columns; returns the discriminated union.
- Copy table in `src/lib/sponsorship-fulfillment-copy.ts`.

**Test gate:**
- For a fixture sponsorship at each phase (pending / processing / in_delivery / delivered / on_hold / refunded), the resolver returns the expected discriminated value.
- tsc + build clean.

**Does NOT include any UI or any write paths.** Pure read layer.

### Phase F.2 — Donor UI surface

**Scope:**
- Render the fulfillment pill on `/dashboard` sponsorship cards.
- Render the fulfillment timeline + exception banner on `/dashboard/sponsorship/[id]`.
- Privacy guard test: a donor opening their own sponsorship surface does NOT see another donor's reasons; never sees Tier-3.

**Test gate:**
- Each phase renders the right donor copy.
- Exception banners never expose admin's raw reason — only `donor_visible_reason` (mapped via copy table).
- tsc + build clean.

**Depends on:** F.1.

### Phase F.3 — Admin UI surface + exception write paths

**Scope:**
- New API routes:
  - `POST /api/admin/sponsorships/[id]/fulfillment-hold` + matching `fulfillment-resume`
  - `POST /api/admin/sponsorships/[id]/fulfillment-dispute` + matching `fulfillment-dispute-resolve`
  - `POST /api/admin/sponsorships/[id]/fulfillment-refund-request`
- New admin UI: Fulfillment panel on `/admin/sponsorships/[id]`. Action buttons for each transition.
- New filter column on `/admin/sponsorships` list.
- New home tile: "Fulfillment exceptions".
- Audit: 5 new `AuditAction` values registered + labels + icon maps (same pattern as Phase 0).
- Refund completion: extend the existing `/api/admin/sponsorships/[id]/refund` to also set `fulfillment_exception='refunded'` + `fulfillment_exception_at` atomically. (One-line extension; preserves all existing behavior.)

**Test gate:**
- Admin can set each exception + see it reflected on donor surface.
- Admin can resume each non-terminal exception → derived phase returns.
- Refund completes → fulfillment_exception='refunded' + audit log shows BOTH the existing payment refund event AND the new fulfillment event.
- Auth: regular admin cannot complete a refund (super-admin gate preserved). Regular admin CAN set on_hold / disputed / refund_requested.
- tsc + build clean.

**Depends on:** F.1, F.2.

### Phase F.4 — Per-cycle history for monthly sponsorships (V2 candidate)

**Deferred — ship F.1-F.3 first.** If after live use Mahmud needs:
- Per-cycle history visualization on monthly sponsor dashboards
- "Cycles delivered" count as a stored aggregate (vs computed)
- Per-cycle on_hold / dispute tracking

Then F.4 adds either:
- A `sponsorship_fulfillment_cycle` collection (one row per cycle), with its own status enum (mirrors fulfillment phase set), driven by spine triggers, OR
- A simpler `sponsorship.cycles_delivered_count` integer maintained by Spine 1.3's "send to donor" handler

Decision tree for F.4 lives in Open Q4.

### Sequencing recommendation

**F.1 → F.2 → F.3** in order. Each can ship + sit live for a week
before the next. F.4 is post-V1.

---

## G. Open questions for Mahmud

Real product forks, not "should we use TypeScript". Each blocks
something in F.1-F.4 and needs an answer before that phase ships.

### Q1 — When `sponsorship.status = 'paused'` (payment paused), what should fulfillment status show?

**Options:**
- **(a)** Auto-derive On Hold from `status='paused'`, no separate `fulfillment_exception` write needed. Pause is pause.
- **(b)** Independent — payment paused doesn't necessarily pause fulfillment; admin decides each axis separately.
- **(c)** Hybrid — payment-pause derives a "Paused (payment)" pseudo-exception that's *visible* as on-hold to the donor but doesn't *set* the `fulfillment_exception` column (so resuming payment auto-resumes fulfillment too).

**Current recommendation:** (c). Cleanest reflection of the
"payment-pause is a strong signal but stays on its own axis"
principle. Donor sees one "On Hold" pill regardless of which axis
triggered it; admin sees both axes in the detail view.

**Blocks:** F.1's resolver precedence rules. Need answer before F.1 ships.

### Q2 — Should DI see fulfillment phase at all?

**Options:**
- **(a)** No — DI sees only their task queue (current spine 1.2). Recommended; fulfillment is a donor/admin concept.
- **(b)** Yes — DI sees a "this task is for sponsorship in Processing" badge so they can prioritize sponsorships that have been waiting longest in Pending.

**Current recommendation:** (a) for V1. (b) is a polish — defer.

**Blocks:** F.2 — affects whether `/di/tasks/[id]` (spine 1.2b)
gets a fulfillment-phase chip. Not blocking F.1.

### Q3 — Donor-visible reason text — separate field or derive from `fulfillment_exception_reason`?

When admin marks On Hold, they write a free-text `reason`. Donor sees a
banner. The brief asks: same text? Or a SEPARATE donor-visible copy?

**Options:**
- **(a)** Admin writes one reason; both donor and admin see it. Simplest. Risk: admin's note might contain Tier-3 or operational specifics inappropriate for donor.
- **(b)** Admin writes two fields: a private `reason` (admin-only, for the audit log + internal context) AND an optional `donor_visible_reason` (curated copy). If `donor_visible_reason` is null, donor sees a generic phrase from §E.1's copy table.
- **(c)** Donor never sees a reason — just the generic "Briefly on hold" / "We're looking into this" copy. Admin's reason is admin-only.

**Current recommendation:** (b). Matches Spine 1.2's
DI-content-vs-admin-donor_text pattern (separate forensic vs
donor-facing fields). Adds one nullable text column —
`fulfillment_exception_donor_visible_reason`. Cheap.

**Blocks:** F.1's column list. Need answer before migration ships.

### Q4 — Per-cycle history for monthly sponsorships in V1 or V2?

**Options:**
- **(a) V1**: Ship a `sponsorship_fulfillment_cycle` collection now. Each task→report pair gets a row; fulfillment status reads from "latest cycle".
- **(b) V2**: Derive everything from spine entities (`task` + `child_update`). Defer the cycle collection.

**Current recommendation:** (b). The spine already has the data;
adding a side collection is duplicate state. If after launch Mahmud
finds query patterns awkward (e.g. "show me cycle #4 of 12 specifically"), F.4 adds the collection then.

**Blocks:** F.4 sequencing only — not F.1-F.3.

### Q5 — When `sponsorship.status` flips to `cancelled` AFTER a successful delivery, what does fulfillment show?

Concrete: monthly sponsor delivered 5 cycles, then donor cancels.
Sponsorship.status → 'cancelled'. The "last cycle" was Delivered.

**Options:**
- **(a)** Show "Delivered" (the last cycle was; reflects what the donor saw last).
- **(b)** Show "Cancelled" (the sponsorship is over; current state of the relationship).
- **(c)** Show both — "Delivered • Sponsorship ended on [date]".

**Current recommendation:** (c). Donor's last meaningful fulfillment
event was Delivered; the sponsorship ending is separate context.
On admin surface: same pattern.

**Blocks:** F.1 resolver. Need answer before F.1.

### Q6 — Multi-sponsor children: which sponsorship's fulfillment phase shows on the child's profile?

Spine 1.2's audience-resolver (`02-spine-design.md` §3.5) addresses
this for reports. For fulfillment phase: per-sponsorship view is
unambiguous; child-aggregate view needs a rule.

**Options:**
- **(a)** Show the active sponsorship's phase only (`queue_status` null + status='active').
- **(b)** Show all sponsorships' phases as a stack.
- **(c)** Skip — child profile doesn't surface fulfillment phase.

**Current recommendation:** (c) for V1. Fulfillment is a
donor-sponsorship concept; child profile already shows other
information. Defer.

**Blocks:** F.2 — only if the child profile needs to render
fulfillment. Not blocking otherwise.

---

## H. What this design explicitly does NOT do

- Does NOT change the payment status enum (`sponsorship.status`).
- Does NOT add a fulfillment column to `task`, `aid_delivery`, or `child_update` — those have their own status fields owned by the spine.
- Does NOT add a side collection in V1 (deferred to F.4).
- Does NOT add donor-self-service refund initiation (admin-only in V1; donor support requests go through `form_submission` per `00-discovery.md` §S6 today).
- Does NOT change Stripe webhook semantics — payment status keeps flowing exactly as it does today.
- Does NOT introduce a separate state machine — the resolver is a pure read function over the spine + one nullable column.

---

## I. Summary

The "donation fulfillment lifecycle" Mahmud is asking for is **already
85% present in the codebase** via the spine (1.1 + 1.2): task →
report → published. The missing piece is (1) a name + display layer
that composes those spine signals into stakeholder-readable phases,
and (2) storage for the exception axes (on hold / disputed / refund
requested) that don't live in the spine.

**Recommendation:** one new nullable enum column on `sponsorship` for
exceptions, plus a pure-derivation resolver for the happy path.
Zero duplicate state machines. The spine is the source of truth.
