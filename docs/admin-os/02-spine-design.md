# Admin OS — Phase 1 Spine: build-ready design

**Branch:** `design/phase-1-spine`
**Base:** `main` @ `c99af86`
**Status:** design only. No source changed. No migration written.
**Revisions:** v2 (this revision) locks two product decisions from
Mahmud and reflects them in the data model + lifecycle:

1. **Admin-edit at review** — DI drafts; at the admin review step,
   admin may *optionally* edit the donor-facing text inline before
   sending. No edit = sends as DI drafted. One human-optional step,
   not a mandatory rewrite stage.
2. **One-time donors are first-class** — the spine reports to BOTH
   ongoing monthly sponsors AND one-time donors (e.g. "your cycle
   was delivered"). The original v1 missed one-time donors entirely.

**Ground truth:**
- `docs/admin-os/00-discovery.md` (broad audit)
- `docs/admin-os/01-phase0-diagnostic.md` (Phase 0 surgery sites)
- Phase 0 commit on `feature/phase-0-foundation` added two nullable FK
  columns + Postgres FK constraints: `task.sponsorship` and
  `child_update.sponsorship` (see `migrations/phase-0/001-add-sponsorship-fks.mjs`
  on that branch).

## What we're closing

From `00-discovery.md` §S5 — the three broken accountability spine hops:

| Hop | Today | After Phase 1 |
|-----|-------|---------------|
| **3 — admin creates field task** | `[DOES-NOT-EXIST]` — admin task creation lives in Directus admin UI only (per `src/lib/di-tasks.ts:9-12` header). | Admin UI to create + assign a task to a DI, linked to the sponsorship that funds it (Phase 0 FK). |
| **6 — DI evidence → donor report** | `[EXISTS-PARTIAL]` — DI submits `child_update` (status `pending → published`), but no admin review surface flips that status and nothing addresses the report to the funding donor (monthly OR one-time). | Report lifecycle DRAFT → SUBMITTED_BY_DI → UNDER_ADMIN_REVIEW → APPROVED → SENT_TO_DONOR (+ ARCHIVED / HIDDEN_FROM_DONOR / CORRECTION_REQUESTED / REJECTED), with admin review queue + per-funder delivery. Admin can optionally edit the donor-facing text inline during review. Two `report_type` values — `progress` (monthly sponsor → ongoing child story) and `deployment` (one-time donor → "your gift was delivered"). |
| **7 — donor notification on publish** | `[DOES-NOT-EXIST]` for donors — the `notification` collection exists but only the DI side reads it (`src/lib/di-notifications.ts`); no donor-facing notification surface. The transactional email pipeline (`src/lib/email.ts` + 11 templates) does not emit a "your child's report is ready" / "your gift was delivered" message. | Donor in-app notification (extend the existing `notification` collection's reach to donors + a `/dashboard/notifications` page) + a new `ChildReportSentEmail` template + send via existing `sendEmail` helper. Audience-resolver branches on `sponsorship.payment_mode` to address either ongoing or one-time donor. |

---

## 1. Data model — REUSE `child_update`, with one editable donor-text column + a report_type discriminator

### Why reuse `child_update`

Same reasoning as v1 (full table comparison preserved below); not
changed by the new decisions. Summary:
- Phase 0 invested in `child_update.sponsorship` for exactly this hop. Reusing makes Phase 0 pay off.
- One concept for "news/evidence flowing to donors"; net-new entity would orphan Phase 0 + fragment the donor experience.
- Avoids the dormant-vs-live pattern the discovery doc flagged for `donation` / `report` / `contact_submission`.

| Option | Pros | Cons |
|---|---|---|
| **A. Reuse `child_update`** (extend status + add columns) | Already in production, has `child`, `type`, `title`, `content`, `photo`, `visibility (sponsor_only|all_donors)`, `status (draft|pending|published|rejected)`, `created_by`, `approved_by`, `published_at`, `rejection_reason`. Phase 0 added `sponsorship` FK. DI write path exists (`src/lib/di-reports.ts`). Donor + public readers exist (`getApprovedChildUpdates` in `src/lib/sponsorship-data.ts:904`; `getChildUpdates` in `src/lib/child-profile-data.ts:502`). | Existing 4-value status enum needs extension. Two parallel readers filter on different status values (`approved` vs `published`) — see Q5 carry-forward. |
| **B. Net-new `report` entity** | Clean from-scratch lifecycle. Dormant `report` already has `period`, `pdf_file`, `generated_at`, `emailed_at`. | Net-new collection + parallel readers/writers/admin surfaces. Discovery §S9 #1 flagged dormant duality. Donor UI fragmented across "moments" + "updates" + "reports". |

### Recommendation: **A — REUSE `child_update`**

### Status enum (post-revision)

| Existing | Phase 1 mapping | Notes |
|---|---|---|
| `draft` | keep — DI's local draft | |
| `pending` | rename concept → `submitted_by_di` (legacy `pending` read as equivalent during transition; drop after backfill) | |
| `published` | keep — terminal "donor-visible" state, **= `sent_to_donor`** | |
| `rejected` | keep — terminal admin-side rejection | |
| — | NEW: `under_admin_review` | Admin opened the row; queue claim marker |
| — | NEW: `approved` | Admin signed off; not yet sent to donor |
| — | NEW: `correction_requested` | Admin asked DI to revise; row returns to DI's drafts |
| — | NEW: `archived` | Terminal — admin retires the row post-send without deleting |
| — | NEW: `hidden_from_donor` | Soft-hide for safeguarding reasons post-send |

The brief's `DONOR_VERSION_GENERATED` does **not** become a separate
status because Decision 1 swapped a mandatory rewrite stage for an
optional inline edit during review. The presence/absence of the
edit is captured in two columns (below), not in the lifecycle
state machine.

### New columns (all nullable, all default null)

| Field | Type | Purpose |
|---|---|---|
| `report_type` | enum `'progress' | 'deployment'` (not null in V2; backfilled for existing rows per the migration script — see §7.1.2) | **Decision 2.** `progress` = ongoing child story to an active monthly sponsor (the v1-implied default). `deployment` = "your specific gift was delivered" to a one-time donor. Drives the audience-resolver (§3) + the admin review queue filter. |
| `task` | uuid M2O `task` (nullable) | Phase 1 — link a report to the field task that produced it. |
| `donor_text` | text (nullable) | **Decision 1.** The donor-facing copy. Convention: at draft time, this is null. When admin saves an edit at review, this populates. The donor-facing reader reads `COALESCE(donor_text, content)` — admin's edit wins if present, otherwise the DI's narrative is sent through unchanged. Keeps the DI's original `content` intact for forensics + audit trail. |
| `donor_text_edited_at` | timestamp (nullable) | Set when admin first saves a non-null `donor_text`. Lets the audit timeline distinguish "admin edited copy" from "admin approved as-is" without a separate enum value. |
| `donor_text_edited_by` | uuid M2O `directus_users` (nullable) | The admin who edited. Audit anchor. |
| `correction_reason` | text (nullable) | Admin's body text when status = `correction_requested`. |
| `sent_to_donor_at` | timestamp (nullable) | Set when admin clicks "Send to donor". Drives notification + email trigger. |
| `donor_notification_sent_at` | timestamp (nullable) | Set after the in-app notification + email is dispatched. Idempotency guard. |
| `hidden_at` | timestamp (nullable) | Set when status flips to `hidden_from_donor`. |
| `hidden_reason` | text (nullable) | Admin's free-text rationale. Audit-only. |

**No change** to: `child`, `type`, `title`, `content`, `photo`,
`visibility`, `created_by`, `approved_by`, `published_at`,
`rejection_reason`, `sponsorship` (Phase 0).

**Critical convention (Decision 1):** the donor reader **always**
displays `COALESCE(donor_text, content)`. This means:
- Default behaviour (no admin edit): donor sees the DI's `content` verbatim. Zero extra work for admin.
- Admin clicks "Edit" → modal pre-populates with `content`. Admin saves → `donor_text` stores the edited string. Donor sees `donor_text`.
- Admin can re-edit before send. Once `sent_to_donor_at` is set, further edits are blocked at the UI; the audit trail keeps every revision via the audit log's `diff` column.

### Why `donor_text` as a separate column (not overwrite `content`)

Three reasons:
1. **Forensic integrity.** The DI's original narrative is the field record; admin's polish for donor consumption is editorial. Both need to be inspectable in disputes or compliance reviews.
2. **DI feedback loop.** A future feature ("show DI what admin changed") needs both versions in the row.
3. **Reversibility.** Admin discovers their edit was wrong → null `donor_text` reverts to the DI's `content` without recovering from audit log.

### DI-facing vs donor-safe fields

| Field | DI sees | Admin sees | Donor sees |
|---|---|---|---|
| `id`, `title`, `type`, `photo`, `published_at` | yes | yes | yes (when status reaches `published` AND the audience-resolver in §3 includes them) |
| `content` (DI's original) | yes | yes | **no** — donor sees `COALESCE(donor_text, content)`; if admin edits, `content` is admin-only forensics |
| `donor_text` | yes (after admin saves; surfaces in DI's "submissions" view as the editorial change) | yes | yes (via COALESCE) |
| `donor_text_edited_at`, `donor_text_edited_by` | yes (so DI knows admin polished it) | yes | no — surfaces only as a derived "Edited by Admin" badge if needed |
| `report_type` | yes | yes | yes (drives donor UI sectioning: "Updates from the field" vs "Deployment confirmations") |
| `sent_to_donor_at`, `donor_notification_sent_at` | no | yes | no — derived "Sent on …" badge only |
| `correction_reason` | yes (a message to them) | yes | no |
| `rejection_reason` | yes | yes | no |
| `hidden_at`, `hidden_reason` | no | yes | no |
| `task` | yes (their task) | yes | yes (Phase 1.4) — "From the X delivery on Y date" |
| `sponsorship` | no | yes | no (donor sees the report on THEIR sponsorship surface; doesn't need the explicit id) |
| `created_by`, `approved_by` | yes (self-attribution) | yes | no |

**Tier-3 guarantee:** `child_update` carries no Tier-3 PII columns.
Both `content` (DI-written) and `donor_text` (admin-edited) are
free-text — admin review is the human gate per §6.

---

## 2. Hop 3 — admin task creation

Unchanged from v1. Summary kept here for completeness.

### Reuse / new

| Layer | Decision |
|---|---|
| Collection | **REUSE** `task` (Session 41-v3, bootstrap-defined in `bootstrap/src/v3-register-collections.ts:212-236`). |
| Sponsorship link | **REUSE** `task.sponsorship` FK (Phase 0; `migrations/phase-0/001-add-sponsorship-fks.mjs`). Nullable today; Phase 1 leaves it nullable but the new admin UI always populates it when the task is created from a sponsorship context — INCLUDING when the sponsorship is `payment_mode = 'one_time'` (e.g. admin creates a "deliver this cycle" task from a one-time donation). |
| DI data layer | **REUSE** `src/lib/di-tasks.ts` for reads + transitions. **NEW write helper** `createTaskForSponsorship({ sponsorshipId, assigneeUserId, title, description?, dueDate?, priority? })` in a new admin module (`src/lib/admin-tasks.ts`). |
| DI surface | **REUSE** `/di/tasks` page + `src/components/di/TaskCard.tsx` + transition endpoints. |

### NEW: admin UI

- `/admin/sponsorships/[id]/page.tsx` — add "Create field task" action button. **Now also surfaces on one-time donation rows** (same detail page; `payment_mode` doesn't gate the button — admin can create a "fulfil this gift" task for a one-time donation just like a "send Imran his school supplies" task for a monthly sponsor).
- `/admin/tasks` (new) — global admin queue.
- `/admin/tasks/[id]` (new) — admin task detail + verify / reject_redo actions.
- `/api/admin/tasks/create`, `[id]/verify`, `[id]/reject-redo` — new POST endpoints.
- Audit actions: `admin_created_task`, `admin_verified_task`, `admin_rejected_task_completion`.
- DI notification: `admin_assigned_task` (extends the existing `notifyDi` pattern).

---

## 3. Hop 6 — evidence link + report lifecycle (revised for Decision 1 + 2)

### Reuse / new schema (unchanged from v1 + above)

| Layer | Decision |
|---|---|
| `aid_delivery.sponsorship` | **REUSE** — already exists. **Works for one-time donations** because both monthly and one-time live in the same `sponsorship` table; the FK doesn't care about `payment_mode`. |
| `aid_delivery.task` | **NEW nullable FK** to `task`. |
| `child_moment.task` | **NEW nullable FK** to `task`. |
| `child_update.task` | **NEW nullable FK** (§1). |
| `child_update.sponsorship` (Phase 0) | **CONFIRMED** to link to either monthly OR one-time sponsorship rows — see §3.5 below. |

### 3.5 One-time donations vs monthly sponsorships in the schema

**Schema reality** (cited from the live code, on `main`):

| Field on `sponsorship` | Monthly subscription | One-time gift |
|---|---|---|
| `payment_mode` (`'monthly' | 'one_time'`) — `src/lib/sponsorship-data.ts:42` | `'monthly'` | `'one_time'` ← **canonical discriminator** |
| `payment_schedule` (`'monthly' | 'monthly_prepaid' | null`) — `:68` | `'monthly'` (recurring) or `'monthly_prepaid'` (prepaid bundle) | `null` |
| `child` (uuid, nullable per Postgres) | almost always set | set for child-specific gift, **null for campaign gifts** (per Session 58.2 — campaign one-times have null child) |
| `status` | `pending_payment` → `active` (ongoing) → `paused` / `cancelled` / `completed` | `pending_payment` → `completed` (single charge ends the row) |
| `stripe_subscription_id` | populated | null |
| `stripe_payment_intent_id` | populated for prepaid bundles + first charge | populated for the single PI |
| `donation_package` FK (Session 58) | populated when checkout used a `package_type='monthly'` package | populated when checkout used a `package_type='one_time'` package (`'one_time_quick'` or `'one_time_gift'` per `package_subtype` from session-58/003) |
| `cause_tag` (Session 58.2) | rarely set | typically set (e.g. `'cycle'`, `'school_uniform'`) — the cause is the *thing* the donor paid for |

**Implication for the spine:**

The `child_update.sponsorship` FK added in Phase 0 **already
supports linking to one-time donations** — it's a plain uuid
pointing at any row in `sponsorship` regardless of `payment_mode`.
**No schema change needed** to enable one-time donor reports. Only
the audience-resolver + the new `report_type` column are new.

### Audience-resolver (NEW — branches on `payment_mode`)

A single function `resolveReportAudience(reportRow)` in
`src/lib/admin-reports.ts` returns the donor recipient (singular
for the simple cases; an array if §8 Q3 picks "all donors" later):

```
function resolveReportAudience(report):
  if report.sponsorship is null: return []  # report not addressed to a funder

  sponsorship = fetch(report.sponsorship)
  if sponsorship.payment_mode == 'one_time':
    # Deployment report — the donor of the one-time gift.
    return [sponsorship.donor]

  if sponsorship.payment_mode == 'monthly':
    # Progress report — the ACTIVE sponsor on this row.
    # Multi-sponsor children (queued donors) handled per §8 Q3.
    return [sponsorship.donor]

  return []
```

The resolver's branching is the ONLY place `payment_mode` matters
to the spine. The schema doesn't need to encode the type — Phase 0's
`sponsorship` FK is the universal handle.

### Report-type field — derived OR stamped?

Two options for `report_type`:

| Option | Pros | Cons |
|---|---|---|
| **(a) Derived at read time** from `sponsorship.payment_mode` | No new column, no migration risk; always in sync. | Three readers (admin queue, DI submissions, donor dashboard) all duplicate the lookup. Filtering the admin queue by `report_type = 'deployment'` becomes a join. |
| **(b) Stamped on the row at write time** from `sponsorship.payment_mode` | Single column scan for the admin queue's "Deployment reports only" filter. Donor-side reader doesn't need the sponsorship row to label the section. | One-way derivation — if a sponsorship somehow flipped `payment_mode` (impossible in practice; the column is set at checkout and never written again), the row would drift. Defensive: nullable column with a backfill that re-runs if the sponsorship changes (unnecessary in practice; the column is immutable). |

**Recommendation: (b) stamp.** Cheap (8 bytes/row), avoids per-page-load joins, supports queue filters efficiently. The "drift risk" is theoretical — `payment_mode` is immutable post-checkout.

### Flow (DI side — revised for both report types)

1. DI opens `/di/tasks/[id]`.
2. DI submits an `aid_delivery` via `POST /api/di/deliveries` (the new task UI passes `taskId` so the row carries it).
3. DI submits 0..N `child_moment` rows similarly.
4. DI marks task `completed_pending_verification`.
5. DI drafts the donor-facing report via `POST /api/di/reports`:
   - Form populates `report_type` automatically by checking the linked sponsorship's `payment_mode` (server-side; not user-selectable). DI can't accidentally mis-label.
   - For `payment_mode='one_time'`, the form's UI copy reads "Deployment confirmation" instead of "Progress update". Same backend write.
6. DI submits — `child_update.status = 'submitted_by_di'`.

### Admin verification + report review (REVISED — Decision 1 inline edit)

`/admin/reviews/reports` — admin queue of `child_update` rows in
`submitted_by_di`. Mirrors `/admin/reviews/moments` etc. **New
filter: report_type** (Progress / Deployment / All).

Per-report detail at `/admin/reviews/reports/[id]` with actions:

| Action | Effect |
|---|---|
| **Mark under review** | `status = 'under_admin_review'` (queue claim) |
| **Edit donor text** (NEW — Decision 1) | Opens inline editor pre-filled with the current `COALESCE(donor_text, content)`. On save, writes `donor_text` + stamps `donor_text_edited_at`/`donor_text_edited_by`. Re-openable until status `published`. Distinct from `content` (DI's original stays intact). Audit action `admin_edited_report_donor_text`. |
| **Discard edit** (NEW) | Nulls `donor_text` + clears the edited_at/by stamps. Reverts to DI's original at the donor reader. Audit action `admin_discarded_report_donor_text_edit`. |
| **Approve** | `status = 'approved'`. The donor-facing text is whatever `COALESCE(donor_text, content)` evaluates to at this moment. |
| **Request correction** | `status = 'correction_requested'` + `correction_reason`; DI notified. |
| **Reject** | `status = 'rejected'` + `rejection_reason`; DI notified (terminal). |
| **Send to donor** | Valid from `approved`. Sets `sent_to_donor_at` + flips `status = 'published'`. Fires notification + email to the audience resolved per §3.5. |
| **Archive** | `status = 'archived'` (post-send retire). |
| **Hide from donor** | `status = 'hidden_from_donor'` + `hidden_at` + `hidden_reason` (post-send safeguarding retraction). |

**Convention:** the "Edit" action is *optional*. Admin's default
muscle memory is Mark under review → Approve → Send. Editing
happens only when the DI's narrative needs softening, anonymising,
or rewording for donor consumption.

---

## 4. Hop 7 — donor notification (in-app + email) — revised for one-time

### In-app notification

Same plumbing as v1 (extend `notification` collection's reach to
donors; new reader at `src/lib/donor-notifications.ts`; new
`/dashboard/notifications` page + bell badge).

**Two notification types** (new):
- `child_report_sent_to_donor` (Progress) — for `report_type = 'progress'`.
- `gift_deployment_confirmed` (Deployment) — for `report_type = 'deployment'`.

Each fires from the admin "Send to donor" handler based on the
resolved `report_type`. Copy and email subject differ; the underlying
write path is the same `notifyDonor(...)` helper.

### Email

Single new template `src/emails/ChildReportSentEmail.tsx` —
generic-by-design. Props:
- `firstName`, `childName`
- `reportType: 'progress' | 'deployment'` — switches headline +
  CTA copy without needing two separate templates.
- `reportTitle`, `reportSummary` (truncated `COALESCE(donor_text, content)` ≤200 chars), `reportUrl`, `unsubscribeUrl`
- Optional `giftLabel` (for deployment: e.g. "your bicycle gift") — null on progress reports.

**Why one template, not two**: copy diverges in 3 strings, not 30.
Sharing the template keeps brand-style drift impossible. If
deployment reports later grow much richer (delivery photo gallery,
recipient-acknowledgment image, GPS pin), splitting is cheap.

### Trigger

The "Send to donor" admin action (§3) calls a single send-handler.
Internally:
1. Resolve audience via `resolveReportAudience(report)`.
2. For each recipient donorId:
   - Write `notification` row with the correct `type` per `report.report_type`.
   - Call `sendEmail(...)` with `ChildReportSentEmail` props bound to the report + type.
3. Stamp `donor_notification_sent_at` (idempotency).

API route: `POST /api/admin/reports/[id]/send`. Same auth + audit
pattern as Phase 0's admin sponsorship lifecycle routes.

---

## 5. State flow — one sequence, both report types

```
T0   donor checkout
     (a) monthly path:                    sponsorship row
         /sponsor/[childId]                payment_mode = 'monthly'
                                          status        = active
                                          donor = D, child = C
     (b) one-time path:                   sponsorship row
         /donate or /sponsor with         payment_mode = 'one_time'
         a one_time package                status        = pending_payment → completed
                                          donor = D
                                          child = C (or null for campaign)
                                          donation_package = ID of the gift bundle
                                          cause_tag = 'cycle' (e.g.)

T1   admin opens /admin/sponsorships/[s]
     admin clicks "Create field task" →   task created
                                          task.sponsorship = s
                                          task.child       = C (or null for campaign)
                                          task.assignee    = DI1
                                          task.di_status   = open
                                          task.admin_status= open
     DI1 notified                          notification(recipient=DI1, type=admin_assigned_task)

T2   DI1 opens task / starts work        task.di_status = in_progress

T3   DI1 submits aid_delivery             aid_delivery.task        = task.id
                                          aid_delivery.sponsorship = s
                                          aid_delivery.status      = pending
     DI1 submits 0..N moments             child_moment.task = task.id
                                          child_moment.status = pending
     DI1 marks task complete              task.di_status = completed_pending_verification

T4   admin verifies task                  task.admin_status = verified_complete
     admin verifies the evidence rows     aid_delivery.status = verified
                                          child_moment.status = published

T5   DI1 drafts the report                child_update created
                                          .task        = task.id
                                          .sponsorship = s
                                          .child       = C (or null)
                                          .report_type = 'progress' or 'deployment'
                                                         (stamped from
                                                          sponsorship.payment_mode)
                                          .content     = DI's narrative
                                          .donor_text  = null (default)
                                          .visibility  = sponsor_only
                                          .status      = draft
     DI1 submits the report               .status = submitted_by_di

T6   admin opens the report queue         .status = under_admin_review

T6e  (optional, Decision 1) admin edits   .donor_text             = admin's polished copy
     the donor-facing text                .donor_text_edited_at   = NOW
                                          .donor_text_edited_by   = admin
                                          .content stays untouched (forensic record)

T6a  (alt) admin requests correction      .status = correction_requested
                                          + correction_reason
                                          DI1 notified

T6b  (alt) admin rejects                  .status = rejected (terminal)

T7   admin approves                       .status      = approved
                                          .approved_by = admin
                                          .published_at = NOW

T8   admin clicks "Send to donor"         .status              = published
                                                                  (== sent_to_donor)
                                          .sent_to_donor_at    = NOW

     Audience resolved per §3.5:
       sponsorship.payment_mode = 'monthly'   → audience = [active sponsor donor]
       sponsorship.payment_mode = 'one_time'  → audience = [one-time donor]

     For each recipient donor D':
       notification written                (recipient=D',
                                            type=child_report_sent_to_donor
                                                  if report_type=progress
                                                 OR
                                                  gift_deployment_confirmed
                                                  if report_type=deployment)
       ChildReportSentEmail sent           (to D', with reportType prop)

     .donor_notification_sent_at = NOW    (idempotency)

T9   donor opens dashboard
     bell shows unread count
     donor opens /dashboard/notifications  marks the row read
     donor opens the report                sees title + photo +
                                          COALESCE(donor_text, content)
                                          (Tier-3 PII never queried — see §6)

T10  (optional) admin retires            .status = archived
T10b (optional) admin retracts after     .status = hidden_from_donor
                                          + hidden_at + hidden_reason
                                          donor reader excludes
```

**Actors**: T0 = donor. T1, T4, T6, T6e, T7, T8 = admin. T2–T3, T5 = DI. T9 = donor.

---

## 6. Privacy — Tier-3 leak guard points

Unchanged from v1; the new columns don't introduce Tier-3 surfaces.

| Point | Mechanism |
|---|---|
| **DI writes `content`** | Free-text. DI is permitted to know Tier-3 facts but must not write them. Admin review is the human gate. |
| **Admin edits `donor_text`** (NEW — Decision 1) | Same free-text guard. Admin's editorial pass is the moment to scrub anything Tier-3 the DI wrote. If admin's edit removes a Tier-3 leak, the donor sees the edited text via COALESCE; the original `content` row stays in admin-only forensics. |
| **Admin reviews** | The review surface renders the full `content` (DI's original) + the editable `donor_text` (admin's polish, if any). Both visible to admin. |
| **Donor-facing reader** | New `getReportsForSponsorship(sponsorshipId, donorId)` in `src/lib/donor-data.ts`. Field list: `id, type, title, COALESCE(donor_text, content), photo, published_at, sent_to_donor_at, report_type` plus a child-join limited to `id, display_name, Photo` (Tier 1 only). No Tier-2 / Tier-3 child fields. |
| **Email template** | `ChildReportSentEmail` props typed `firstName: string`, `childName: string` (Tier 1), `reportTitle`, `reportSummary` (truncated from COALESCE result), `reportType`, `giftLabel?`, `reportUrl`. Type system blocks any future addition of Tier-2/3 props. |
| **In-app notification payload** | `{ reportTitle, childDisplayName, sponsorshipId, reportUrl, reportType }`. No PII beyond Tier 1. |
| **Audit log** | `recordAuditEvent({ metadata: { childId?, sponsorship, reportId, status, edited: boolean } })`. The `donor_text` edit action logs `edited: true` (boolean) without writing the edited TEXT to the audit metadata — the full text lives in the row's diff column, captured automatically by the existing audit pattern; the `redactAuditPayload` pass in `src/lib/di-audit.ts:251` runs on every row. |

---

## 7. Build plan — four sub-phases (revised — adds Decision 1 + 2 to 1.2)

Each sub-phase is independently testable + shippable. Same test
gate as v1: tsc + build + manual click-test against local stack.

### Phase 1.1 — Admin task creation (hop 3) — UNCHANGED FROM V1

**Scope**
- Migration script `migrations/phase-1/001-add-task-evidence-fks.mjs` adding `aid_delivery.task` + `child_moment.task` (nullable, Postgres FK ON DELETE SET NULL). Two-step pattern from Phase 0.
- `src/lib/admin-tasks.ts` — `createTaskForSponsorship`, `verifyTask`, `rejectTaskCompletion`.
- Admin UI: "Create field task" button + modal on `/admin/sponsorships/[id]` (works for both monthly + one-time sponsorship rows).
- Admin UI: `/admin/tasks` global list + `/admin/tasks/[id]` detail.
- API routes: `POST /api/admin/tasks/create`, `POST /api/admin/tasks/[id]/verify`, `POST /api/admin/tasks/[id]/reject-redo`.
- Audit-action additions: `admin_created_task`, `admin_verified_task`, `admin_rejected_task_completion`.
- Notification-type addition: `admin_assigned_task`.
- DI-side: `/di/tasks/[id]` per-task detail page.

**Test gate:** admin creates a task from BOTH a monthly sponsorship AND a one-time donation → DI sees both in `/di/tasks` + receives notifications → DI transitions both → admin verifies both.

### Phase 1.2 — Report lifecycle (hop 6, no donor send yet) — REVISED for Decisions 1 + 2

**Scope**
- Migration script `migrations/phase-1/002-extend-child-update.mjs` adding:
  - 8 new nullable columns: `report_type` (string, backfilled to `'progress'` for existing rows), `task`, `donor_text`, `donor_text_edited_at`, `donor_text_edited_by`, `correction_reason`, `sent_to_donor_at`, `donor_notification_sent_at`, `hidden_at`, `hidden_reason`.
  - Status enum extension via Directus admin UI metadata patch (the column is varchar; the dropdown choices grow).
  - **Backfill:** every existing row's `report_type` = `'progress'` (the v1 implicit default). Idempotent.
- DI side: extend `src/lib/di-reports.ts` write path to accept `taskId` + `sponsorshipId` AND server-side-derive `report_type` from `sponsorship.payment_mode`.
- DI submission form on `/di/children/[id]/reports/new` already exists — add task picker; UI copy flips between "Progress update" and "Deployment confirmation" based on the linked sponsorship's `payment_mode`.
- Admin UI: `/admin/reviews/reports` queue + `/admin/reviews/reports/[id]` detail (mirror of `/admin/reviews/moments/*`). **New filter: report_type** (All / Progress / Deployment).
- Admin actions: `mark_under_review`, `approve`, `request_correction`, `reject`, `archive`, `hide_from_donor`, **`edit_donor_text` (NEW), `discard_donor_text_edit` (NEW)**. Each via its own POST endpoint under `/api/admin/reports/[id]/*`. No send-to-donor yet — that's 1.3.
- Audit actions: `admin_reviewed_report`, `admin_approved_report`, `admin_requested_report_correction`, `admin_rejected_report`, `admin_archived_report`, `admin_hid_report_from_donor`, **`admin_edited_report_donor_text` (NEW), `admin_discarded_report_donor_text_edit` (NEW)**.
- DI notifications: `admin_approved_report`, `admin_requested_report_correction`, `admin_rejected_report`.

**Test gate (revised):**
- DI drafts + submits TWO reports — one linked to a monthly sponsorship (auto-stamped `report_type='progress'`), one linked to a one-time donation (auto-stamped `report_type='deployment'`).
- Admin sees both in queue; filter by `report_type` works.
- Admin opens the progress report → approves AS-IS (no donor_text edit) → status = `approved`, `donor_text` still NULL.
- Admin opens the deployment report → clicks **Edit donor text**, saves changed copy → `donor_text` populated, `donor_text_edited_at`/`donor_text_edited_by` stamped → approves → status = `approved`, `donor_text` populated. Re-open editor → modify → re-save (covers re-edit). Discard → `donor_text` reverts to NULL.
- Correction-request loop also tested.

### Phase 1.3 — Send to donor (hops 6→7 bridge) — REVISED for one-time audience

**Scope**
- API route `POST /api/admin/reports/[id]/send` — flips `approved` → `published`, sets `sent_to_donor_at`, **resolves audience via `resolveReportAudience` (§3.5)** — branches on `sponsorship.payment_mode` to pick the right recipient. Calls 1.4's donor-side write helpers (or stubs if 1.4 sequenced after). Idempotent on `donor_notification_sent_at`.
- Admin UI: "Send to donor" action button on `/admin/reviews/reports/[id]` (only enabled when status = `approved`).
- Audit action: `admin_sent_report_to_donor`.

**Test gate:** from a previously-approved monthly-linked report, admin clicks Send → the monthly sponsor's donor row becomes the recipient. From a previously-approved one-time-linked report, admin clicks Send → the one-time donor row becomes the recipient. Re-clicking is a no-op (idempotent).

### Phase 1.4 — Donor in-app notification + email (hop 7) — REVISED for two notification types

**Scope**
- `src/lib/donor-notifications.ts` reader + write helpers (`notifyDonor` mirror of `notifyDi`).
- Donor permission grant on `notification` collection (Directus admin UI; documented, not migrated).
- UI: `/dashboard/notifications` page + bell badge in the donor dashboard nav.
- **New email template `src/emails/ChildReportSentEmail.tsx`** — accepts `reportType: 'progress' | 'deployment'` prop, branches the headline + CTA copy; otherwise shared brand styling.
- **Two new notification types** added to `NotificationType` union in `src/lib/di-notifications.ts`: `child_report_sent_to_donor` (progress) and `gift_deployment_confirmed` (deployment).
- Donor dashboard reads from the existing per-sponsorship surface — the report renders on `/dashboard/sponsorship/[id]` for both monthly + one-time rows. For campaign one-times (where `child` is null on the sponsorship), the report renders without a child anchor — title + body + photo + delivery date only.

**Test gate (revised):**
- End-to-end progress: admin sends a progress report → monthly sponsor donor's bell increments → `/dashboard/notifications` shows "Progress update on [Child]" → opens the report → reads `COALESCE(donor_text, content)` → email arrives with progress-flavored subject + body.
- End-to-end deployment: admin sends a deployment report (with `donor_text` edit) → one-time donor's bell increments → `/dashboard/notifications` shows "Your gift was deployed" → opens the report → reads the ADMIN's edited copy via COALESCE → email arrives with deployment-flavored subject + body.
- For both: notification + email idempotent on re-click.

### Sequencing recommendation

**1.1 → 1.2 → 1.3 → 1.4 in order.** Same as v1. Each builds on its
predecessor's schema + UI affordance.

---

## 8. Open questions — carry-forward with current recommendations

Decisions 1 + 2 are LOCKED (this revision). The remaining open
questions from v1 are carried here unchanged — none block 1.1
starting. Current recommendations listed for each:

### Q3 (carried) — Multi-sponsor children: per-sponsor reports or shared?

A child can have an active sponsor + queued sponsors (`sponsorship.queue_position > 0`). When a PROGRESS report ships, who gets it?
- (a) **Active sponsor only** — `child_update.sponsorship` set to the active row; queued donors see nothing during their wait. Default.
- (b) **All current donors** — `visibility = 'all_donors'`, donor reader scopes by "any sponsorship I ever held for this child".
- (c) Per-report admin choice.

**Current recommendation:** (a) for V1. The audience-resolver in §3.5 returns `[active sponsor]`. (b) remains available row-by-row via the existing `visibility` flag if admin wants broad reach. No blocking work needed — the resolver is one-line to extend if Mahmud picks (b) later.

### Q4 (carried) — Hidden-from-donor: notify the donor of the retraction?

**Current recommendation:** silent for V1. Revisit if compliance/legal requires positive notice.

### Q5 (carried, raised in spine + Phase 2) — Existing `getApprovedChildUpdates` status filter bug

`src/lib/sponsorship-data.ts:912` filters `status = 'approved'`, but the existing enum + writer path uses `status = 'published'`. The donor-scoped reader returns zero rows today.

**Current recommendation:** standardise on `'published'` going forward (matches the writer); treat the `getApprovedChildUpdates` filter as a latent bug to fix as part of Phase 1.2 (one-line patch).

### Q6 (carried) — Auto-send on approve, or explicit Send button?

**Current recommendation:** explicit Send (matches Phase 1.3). Auto-send is cheaper but removes admin's last-mile gate.

### Q7 (carried) — SLA / cadence

**Current recommendation:** event-driven for V1. No cron-driven cadence enforcement. Future Phase 1.x if needed.

### Q8 (NEW from Decision 2) — Where do REPORT-less one-time gifts live?

A one-time donor pays for a gift that the field officer marks as
delivered, but admin or DI never gets around to filing the
`child_update` deployment report. Without a report, the donor never
hears "your gift was delivered" — only the existing
`CampaignDonationThankYouEmail` (sent at charge-success).

Three product options:
- (a) **No-op.** Treat the absence of a report as acceptable. Some gifts just don't get a named deployment narrative.
- (b) **Auto-stub.** When an `aid_delivery` is verified AND it's linked to a `sponsorship.payment_mode='one_time'` with no `child_update` row, auto-create a minimal "Your [cause] was delivered on [date]" deployment report in `submitted_by_di` state for admin to approve + send. Removes the manual-DI-drafting step for the simple cases.
- (c) **SLA reminder.** Cron flags verified deliveries that are >N days old with no published `deployment` report and surfaces them on a new admin dashboard tile.

**Current recommendation:** (a) for V1 — ship the manual path, observe whether the gap is felt. (b) is the right Phase 1.x answer if Mahmud wants every one-time gift to land a deployment confirmation. (c) is the right answer if compliance requires it. Need Mahmud's call before 1.4 ships to decide whether the audience-resolver should warn admin "this gift has no report yet" on the sponsorship detail page.
