# Admin OS — Phase 1 Spine: build-ready design

**Branch:** `design/phase-1-spine`
**Base:** `main` @ `c99af86`
**Status:** design only. No source changed. No migration written.
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
| **6 — DI evidence → donor report** | `[EXISTS-PARTIAL]` — DI submits `child_update` (status `pending → published`), but no admin review surface flips that status and nothing addresses the report to the funding sponsor. | Report lifecycle DRAFT → SUBMITTED_BY_DI → UNDER_ADMIN_REVIEW → APPROVED → DONOR_VERSION_GENERATED → SENT_TO_DONOR → ARCHIVED, with admin review queue + sponsor-specific delivery. |
| **7 — donor notification on publish** | `[DOES-NOT-EXIST]` for donors — the `notification` collection exists but only the DI side reads it (`src/lib/di-notifications.ts`); no donor-facing notification surface. The transactional email pipeline (`src/lib/email.ts` + 11 templates) does not emit a "your child's report is ready" message. | Donor in-app notification (extend the existing `notification` collection's reach to donors + a `/dashboard/notifications` page) + a new `ChildReportPublishedEmail` template + send via existing `sendEmail` helper. |

---

## 1. Data model — recommendation: **REUSE `child_update`**

The candidates (per `01-phase0-diagnostic.md` §S1 inventory):

| Option | Pros | Cons |
|---|---|---|
| **A. Reuse `child_update`** (extend status + add 3-4 columns) | Already in production, has `child`, `type`, `title`, `content`, `photo`, `visibility (sponsor_only|all_donors)`, `status (draft|pending|published|rejected)`, `created_by`, `approved_by`, `published_at`, `rejection_reason`. Phase 0 added `sponsorship` FK. DI write path exists (`src/lib/di-reports.ts`). Donor + public readers exist (`getApprovedChildUpdates` in `src/lib/sponsorship-data.ts:904`; `getChildUpdates` in `src/lib/child-profile-data.ts:502`). One concept for "additive evidence of care surfaced to donors". | Existing 4-value status enum needs to be extended to the 10-value lifecycle in the brief. Two parallel readers today filter on different status values (`approved` vs `published`) — schema drift bug to acknowledge but not fix in scope. |
| **B. Net-new `report` entity** (or re-activate dormant bootstrap `report` from `bootstrap/src/index.ts`) | Clean from-scratch lifecycle. Dormant `report` already has `period`, `pdf_file`, `generated_at`, `emailed_at` — superficially close to "monthly progress report sent to donor". | The dormant `report` was designed around a "monthly PDF" model that isn't where the product is now. Net-new entity means a second readers/writers stack alongside `child_update`. The `00-discovery.md` §S9 observation #1 explicitly flagged dormant-vs-live duality as a tech-debt smell to avoid creating more of. Donor-facing UI would have to choose between "moments" (from `child_moment` / `child_update`) and "reports" (a third stream) — fragmenting the donor experience. |

### Recommendation: **A — REUSE `child_update`**

Reasoning:
- Donor's mental model is "what news do I have about the child I sponsor?" — moments and reports are the same news stream, differentiated only by the type/title and the explicit sponsor-link. `child_update` is already that stream.
- Phase 0 invested in `child_update.sponsorship` to address exactly this hop. Reusing makes Phase 0 pay off; net-new entity would orphan that column.
- Adding 4-5 columns and extending an enum is one migration; spinning up a parallel collection + writers + readers + admin surfaces is at least 3.
- Avoids the dormant-vs-live divergence pattern the discovery doc flagged for `donation` / `report` / `contact_submission`.

### Proposed `child_update` extensions (Phase 1 migration)

**New status enum values** (additive — existing rows keep working):

| Existing | Phase 1 mapping | Notes |
|---|---|---|
| `draft` | keep — same meaning (DI's local draft) | |
| `pending` | rename concept → `submitted_by_di` (keep `pending` as alias for legacy rows; new writes use `submitted_by_di`) | The new value lands; the data layer treats `pending` as equivalent at read time during the transition. Drop `pending` after a backfill window. |
| `published` | keep — terminal "donor-visible" state, **= `sent_to_donor`** | The brief's `DONOR_VERSION_GENERATED` and `SENT_TO_DONOR` collapse into a single column transition for V1 (see Open Question #2). If a separate "donor version" rewrite step is needed later, a new column can split them. |
| `rejected` | keep — same meaning | |
| — | NEW: `under_admin_review` | Admin opened the row in the review queue. Distinguishes "queued" from "actively-looked-at" — useful for the admin queue's prioritisation. |
| — | NEW: `approved` | Admin signed off; not yet sent to donor. Allows scheduling / batching. |
| — | NEW: `correction_requested` | Admin asked DI to revise; row goes back to draft-edit mode for the DI. Distinct from `rejected` (which is terminal). |
| — | NEW: `archived` | Terminal — admin retired the row from the donor's active feed without deleting. |
| — | NEW: `hidden_from_donor` | Soft-hide for safeguarding / compliance reasons after-the-fact. Row stays in admin records; donor view excludes it. Reader pattern: `status NOT IN ('hidden_from_donor', 'archived', 'rejected')`. |

**New columns** (all nullable, all default null):

| Field | Type | Purpose |
|---|---|---|
| `task` | uuid M2O `task` (nullable) | Phase 1 — link a report to the field task that produced it. Symmetric to the Phase 0 `sponsorship` FK. Enables one-click "which work was this report about?" in the donor UI. |
| `correction_reason` | text (nullable) | Admin's body text when status = `correction_requested`. Surfaces to DI as the change-request. Distinct from `rejection_reason` which is terminal. |
| `sent_to_donor_at` | timestamp (nullable) | Set when admin clicks "Send to donor". Drives the notification + email trigger. Distinct from `published_at` (which today is set at the same time as status flips to `published`). For V1 the two move together; the field gives us a clean handle if we later split publish from send. |
| `donor_notification_sent_at` | timestamp (nullable) | Set after the in-app notification + email is dispatched. Idempotency guard against duplicate sends if the publish handler is retried. |
| `hidden_at` | timestamp (nullable) | Set when status flips to `hidden_from_donor`. Optional — kept here so the audit trail doesn't have to be queried for retraction time. |
| `hidden_reason` | text (nullable) | Admin's free-text rationale. Surfaces in audit timeline only; not shown to donor or DI. |

**No change** to: `child`, `type`, `title`, `content`, `photo`, `visibility`, `created_by`, `approved_by`, `published_at`, `rejection_reason`, `sponsorship` (Phase 0).

### DI-facing vs donor-safe fields

| Field | DI sees | Admin sees | Donor sees |
|---|---|---|---|
| `id`, `title`, `type`, `content`, `photo`, `published_at` | yes | yes | yes (when status reaches `published` AND donor sponsors the linked child) |
| `sent_to_donor_at`, `donor_notification_sent_at` | no (internal lifecycle marker) | yes | no — surfaces only as a derived "Sent on …" badge if needed |
| `correction_reason` | yes (it's a message to them) | yes | no |
| `rejection_reason` | yes | yes | no |
| `hidden_at`, `hidden_reason` | no | yes | no |
| `task` | yes (their task — already scoped via di-tasks) | yes | yes (Phase 1.4) — "From the X delivery on Y date" |
| `sponsorship` | no | yes | no (donor sees the report on THEIR sponsorship surface; doesn't need the explicit id) |
| `created_by`, `approved_by` | yes (self-attribution) | yes | no |

**Tier-3 guarantee:** `child_update` itself carries no Tier-3 child PII fields (no exact birthdate, full address, guardian contact, medical, etc.). The risk is that `content` is free-text written by the DI — they could in principle type a Tier-3 fact into the narrative. Mitigations:
- Admin review step is the human gate (see §6 Privacy below).
- The audit-log redaction map (`AUDIT_REDACTED_FIELDS` in `src/lib/di-audit.ts:238`) doesn't need extending because `child_update.content` doesn't end up in the audit `diff` — only field-name changes do.
- Existing donor-facing reader `getApprovedChildUpdates` in `src/lib/sponsorship-data.ts:904` does NOT join the child's encrypted fields (`PUBLIC_FIELDS`/`TIER2_FIELDS`/`ENCRYPTED_FIELDS` split in `src/lib/child-profile-data.ts:114-165` keeps that clean).

---

## 2. Hop 3 — admin task creation

### Reuse / new

| Layer | Decision |
|---|---|
| Collection | **REUSE** `task` (Session 41-v3, bootstrap-defined in `bootstrap/src/v3-register-collections.ts:212-236`). |
| Sponsorship link | **REUSE** `task.sponsorship` FK (added in Phase 0, branch `feature/phase-0-foundation` migration `001-add-sponsorship-fks.mjs`). Nullable today; Phase 1 leaves it nullable but the new admin UI always populates it when the task is created from a sponsorship context. |
| DI data layer | **REUSE** `src/lib/di-tasks.ts` for reads + transitions. **NEW write helper** `createTaskForSponsorship({ sponsorshipId, assigneeUserId, title, description?, dueDate?, priority? })` in a new admin module (`src/lib/admin-tasks.ts`). |
| DI surface | **REUSE** `/di/tasks` page + `src/components/di/TaskCard.tsx` + transition endpoints — no change. The task appears in the assignee's queue automatically because of `task.assignee` scoping in `listTasksForUser` (`src/lib/di-tasks.ts:260`). |

### NEW: admin UI

| Surface | Why |
|---|---|
| `/admin/sponsorships/[id]/page.tsx` — add a "Create field task" action button to the existing detail page header (sits next to the existing pause/cancel/refund actions). The button opens a modal. | The sponsorship detail page is the natural origin: admin is looking at a donor's commitment and asking "what work do we owe them?". Co-locating the task creation here means `task.sponsorship`, `task.child` are both pre-filled with no admin typing. |
| `/admin/tasks` (new) — global admin list of all tasks across all DIs, with filters: di_status, admin_status, assignee, child, sponsorship, priority. | Operational view for triage — "what's our backlog?". Read-only; per-task admin actions (verify / reject_redo) ship in Phase 1.2 once the report flow attaches to verification. |
| `/admin/tasks/[id]` (new) — admin task detail with: full task fields, linked sponsorship + donor + child summary, list of related `aid_delivery` + `child_moment` evidence (filter by `task` FK once added — see §3), admin actions (verify_complete / rejected_redo). | Closes the loop between task and verification. |
| `/api/admin/tasks/create` (new) | POST endpoint backing the modal. Audits via `recordAuditEvent` with action `admin_created_task` (new — extend `AuditAction` union in `src/lib/di-audit.ts` and `AUDIT_LABELS` in `src/lib/audit-labels.ts`). |
| `/api/admin/tasks/[id]/verify` (new) | `task.admin_status = 'verified_complete'`. Audit `admin_verified_task`. Triggers the DI's notification (`admin_verified_task` notification type — extend `NotificationType` in `src/lib/di-notifications.ts`). |
| `/api/admin/tasks/[id]/reject-redo` (new) | `task.admin_status = 'rejected_redo'`. Audit `admin_rejected_task_completion`. Triggers DI notification. |

### Task → DI notification (existing pattern, extend it)

`notifyDi(...)` in `src/lib/di-notify.ts` already handles "admin did X, DI needs to know" — the new task-creation event fires that with a new `NotificationType = 'admin_assigned_task'` value. The TODO at `src/lib/di-notifications.ts:79-82` explicitly anticipates this — Phase 1 ships the missing server-side handler.

---

## 3. Hop 6 — evidence link to task + report

### Reuse / new

| Layer | Decision |
|---|---|
| `aid_delivery.sponsorship` | **REUSE** — already exists, already optionally populated by DI (`src/app/api/di/deliveries/route.ts:85-87`). |
| `aid_delivery.task` | **NEW nullable FK** to `task`. Phase 1 migration. Lets a DI declare "this delivery satisfied this task" without coupling it to a sponsorship (general tasks have no sponsorship). |
| `child_moment.task` | **NEW nullable FK** to `task`. Lets a moment captured during fieldwork attach to the originating task. |
| `child_update.task` | **NEW nullable FK** (covered in §1 above) — the report is the narrative bundling the evidence. |
| Many-to-many evidence linking | **Deferred.** A report may visually need multiple photos / moments. V1 ships with one `photo` (existing column) plus the implicit list via `task`-FK back-reference (admin queue can join evidence by task id). A future Phase 1.x can add `child_update_moment` junction if multi-photo narrative is needed. |

### Flow (DI side, mostly already exists)

1. DI opens `/di/tasks/[id]` (when this exists — current DI surface is `/di/tasks` list + transition only; per-task detail is a Phase 1.1 deliverable).
2. DI submits an `aid_delivery` via existing `POST /api/di/deliveries`. The new task UI passes `taskId` in the body; the route writes `task` on the row.
3. DI submits one or more `child_moment` rows via existing surfaces; the new task UI passes `taskId` similarly.
4. DI marks the task `completed_pending_verification` via existing `POST /api/di/tasks/[id]/transition` (no change).
5. DI drafts the donor-facing report via existing `POST /api/di/reports` (writes `child_update`); the new task UI passes both `taskId` and `sponsorshipId` so the row carries both FKs.
6. DI submits the report — `child_update.status = 'submitted_by_di'`.

### Admin verification + report review (NEW)

`/admin/reviews/reports` (new) — admin queue of `child_update` rows in `submitted_by_di`. Mirrors the existing `/admin/reviews/moments`, `/admin/reviews/intake-photos`, `/admin/reviews/documents` queues (`src/app/admin/(authed)/reviews/*`).
Per-report detail at `/admin/reviews/reports/[id]` with actions:
- **Mark under review** → `status = 'under_admin_review'` (audit + nothing else; row is now claimed)
- **Approve** → `status = 'approved'`
- **Request correction** → `status = 'correction_requested'` + `correction_reason`; DI notified
- **Reject** → `status = 'rejected'` + `rejection_reason`; DI notified
- **Send to donor** → only valid from `approved`. Sets `sent_to_donor_at` + flips `status = 'published'` (which is our `sent_to_donor` semantic per §1 mapping). Fires notification + email (§4).
- **Archive** → `status = 'archived'` (post-send; soft-retire)
- **Hide from donor** → `status = 'hidden_from_donor'` + `hidden_at` + `hidden_reason` (post-send safeguarding retraction)

The admin verification of the TASK (§2 above) is a separate step from the report review. Sequence: admin verifies the task first (task is the "did the work happen?" gate), then reviews the report (the "is the story safe to send?" gate). They can be done in either order in V1.

---

## 4. Hop 7 — donor notification (in-app + email)

### In-app notification

| Layer | Decision |
|---|---|
| Collection | **REUSE** existing `notification` (`src/lib/di-notifications.ts:7-22`). The schema (recipient FK to `directus_users`, type, payload JSON, read flag, read_at, date_created) is already donor-compatible — the recipient column accepts any `directus_users` row, donors included. The discovery doc §S7 confirmed donors are `directus_users` rows; only the absence of a reader has kept this surface DI-only. |
| New types | Extend `NotificationType` union in `src/lib/di-notifications.ts`: `child_report_sent_to_donor`, plus the §2 types `admin_assigned_task`, `admin_verified_task`, `admin_rejected_task_completion`. |
| New write path | `notifyDonor(...)` helper in a new module `src/lib/donor-notify.ts`. Same shape as `notifyAdminOfPendingSubmission` in `src/lib/di-notify.ts` but addresses donors. Best-effort write per the existing rule (failures swallow + log; the parent action stays successful). |
| New reader | `src/lib/donor-notifications.ts` — `listNotificationsForDonor(donorId, { limit, unreadOnly })`, `markNotificationRead(notificationId, donorId)`, `markAllReadForDonor(donorId)`, `countUnreadForDonor(donorId)`. Scoped server-side by `recipient = donorId`. |
| New UI |  Phase 1.4 — `src/app/dashboard/notifications/page.tsx` (mirror of `/di/notifications`) + a bell badge in the donor dashboard nav (currently no nav notification surface in `src/app/dashboard/components/*`). The bell reads `countUnreadForDonor`; clicking opens the page. |
| Read-permission | Donor role permission on `notification` collection needs to be granted (currently only DI / admin / system read). Schema-light: Directus admin UI change — document in the Phase 1.4 README; no migration script. |

### Email

| Layer | Decision |
|---|---|
| Template | **NEW** `src/emails/ChildReportSentEmail.tsx` — React Email component mirroring the style of `src/emails/SponsorshipWelcomeEmail.tsx` (same brand colors, same components from `src/emails/components/`). Props: `firstName`, `childName`, `reportTitle`, `reportType` (academic/health/story/etc.), `reportSummary` (truncated content, ≤200 chars), `reportUrl` (the donor's `/dashboard/sponsorship/[id]` page), `unsubscribeUrl`. No child PII beyond `childName` (already Tier-1 safe — it's the display_name shown publicly). |
| Send path | **REUSE** `sendEmail({ to, subject, template })` in `src/lib/email.ts:17-44`. Same Resend pipeline as the other 11 transactional templates (`src/emails/`). |
| Trigger | The "Send to donor" admin action (§3). After the status flip succeeds: (a) write the notification row; (b) `sendEmail(...)`; (c) set `donor_notification_sent_at`. All three best-effort with idempotency on `donor_notification_sent_at` (don't re-send if already non-null). |
| API route | **NEW** `/api/admin/reports/[id]/send/route.ts`. Same auth + audit pattern as the Phase 0 admin sponsorship lifecycle routes. |

---

## 5. State flow — one sequence, all entities

A single sponsorship pays for a single field task that produces one report sent to the donor.

```
T0   donor checkout                      sponsorship.status = active
                                          sponsorship.donor = D
                                          sponsorship.child = C

T1   admin opens /admin/sponsorships/[s] sponsorship.status = active   (unchanged)
     admin clicks "Create field task" →
       task created                       task.sponsorship = s
                                          task.child       = C
                                          task.assignee    = DI1
                                          task.di_status   = open
                                          task.admin_status= open
     DI1 notified                          notification(recipient=DI1,
                                                       type=admin_assigned_task)

T2   DI1 opens task in /di/tasks         task.di_status = open       (unchanged)
     DI1 starts work                     task.di_status = in_progress

T3   DI1 submits aid_delivery            aid_delivery.task        = task.id
                                          aid_delivery.sponsorship = s
                                          aid_delivery.status      = pending
     DI1 submits 0..N moments            child_moment.task = task.id
                                          child_moment.status = pending
     DI1 marks task complete             task.di_status = completed_pending_verification

T4   admin verifies task                 task.admin_status = verified_complete
     admin verifies the evidence rows    aid_delivery.status   = verified
     (one per row via existing review)   child_moment.status   = published

T5   DI1 drafts the report               child_update created
                                          child_update.task        = task.id
                                          child_update.sponsorship = s
                                          child_update.child       = C
                                          child_update.visibility  = sponsor_only
                                          child_update.status      = draft
     DI1 submits the report              child_update.status = submitted_by_di

T6   admin opens the report queue        child_update.status = under_admin_review

T6a  (alt) admin requests correction     child_update.status = correction_requested
                                          + correction_reason
                                          DI1 notified
                                          (DI1 edits → back to T5 submit)

T6b  (alt) admin rejects                 child_update.status = rejected
                                          + rejection_reason
                                          DI1 notified (terminal)

T7   admin approves                      child_update.status      = approved
                                          child_update.approved_by = admin
                                          child_update.published_at = NOW

T8   admin clicks "Send to donor"        child_update.status              = published
                                                                            (== sent_to_donor)
                                          child_update.sent_to_donor_at    = NOW
                                          notification written              (recipient=D,
                                                                            type=child_report_sent_to_donor)
                                          ChildReportSentEmail sent          (to D)
                                          child_update.donor_notification_sent_at = NOW

T9   donor opens dashboard               bell shows unread count
     donor opens /dashboard/notifications  marks the row read
     donor opens the report               sees title + content + photo
                                          (Tier-3 PII never queried — see §6)

T10  (optional) admin retires            child_update.status = archived
                                          (still visible in donor's history; no
                                           longer in active "recent" stream)

T10b (optional) admin retracts after-the-fact
                                          child_update.status      = hidden_from_donor
                                          + hidden_at + hidden_reason
                                          donor's reader excludes the row
                                          (Phase 1.x — donor notified of removal?
                                           open question)
```

**Actors** at each hop: T0 = donor self-service. T1, T4, T6–T8 = admin. T2–T3, T5 = DI. T9 = donor.

---

## 6. Privacy — Tier-3 leak guard points

The 3-tier model (`00-discovery.md` §S5, `01-phase0-diagnostic.md` §E.1):
- **Tier 1 public**: name, photo, story, age, **DIVISION (not district)**.
- **Tier 2 authenticated donor**: + Tier 2 enrichment.
- **Tier 3 admin / DI**: + encrypted fields (exact DOB, full address, guardian contact, medical, school name).

The report path runs DI → admin → donor. Guard points:

| Point | Mechanism |
|---|---|
| **DI writes the report content** | Free-text. The DI is permitted to know Tier-3 facts but must not write them into the donor-facing narrative. Guard: admin review (T6) is the human gate. We do NOT add content-scanning regex (false positives + false confidence). |
| **Admin reviews** | The review surface at `/admin/reviews/reports/[id]` renders the full `content` text exactly as the DI wrote it. Admin is human-in-the-loop — same pattern as the existing moment / document / intake-photo review queues. Reject / Request-correction is the lever for catching Tier-3 leaks in narrative. |
| **Donor-facing reader fetches the row** | New `getReportsForSponsorship(sponsorshipId, donorId)` in `src/lib/donor-data.ts` (extends existing donor-scope reads). Field list: `id, type, title, content, photo, published_at, sent_to_donor_at` plus a child-join limited to `id, display_name, Photo` (Tier 1 only). **No Tier 2 or Tier 3 child fields are joined.** Same `SAFE_FIELDS`-style restriction as `children-data.ts:256-269` post-R1 hotfix. |
| **Email template** | `ChildReportSentEmail` props are typed `firstName: string` (donor's), `childName: string` (Tier 1), `reportTitle`, `reportSummary` (truncated body), `reportUrl`. The template doesn't accept any Tier-2 or Tier-3 field. If a future contributor extends the props, the type system flags the addition for review. |
| **In-app notification payload** | `notification.payload` JSON contains `{ reportTitle, childDisplayName, sponsorshipId, reportUrl }`. No PII beyond Tier 1. Documented in the `NotificationType` comment for `child_report_sent_to_donor`. |
| **Audit log** | Audit writes for the report lifecycle use `recordAuditEvent({ metadata: { childId, sponsorship, reportId, status } })`. Metadata keys are IDs only. `redactAuditPayload` in `src/lib/di-audit.ts:251` runs on every audit row; if a future contributor adds a Tier-3 column to `child_update`, the field name must be added to `AUDIT_REDACTED_FIELDS`. Comment that requirement in the migration script. |

**No grep-time tier check is needed** because no path queries Tier-2 or Tier-3 child fields on the report's behalf. The guard is positive — we only fetch what the donor is allowed to see.

---

## 7. Build plan — four sub-phases

Each sub-phase is independently testable + shippable. Test gate at the end of each: tsc + build + manual click-test against local stack.

### Phase 1.1 — Admin task creation (hop 3)

**Scope**
- Migration script `migrations/phase-1/001-add-task-evidence-fks.mjs` adding `aid_delivery.task` + `child_moment.task` (nullable, Postgres FK, ON DELETE SET NULL). Same shape as Phase 0 migration.
- `src/lib/admin-tasks.ts` — `createTaskForSponsorship`, `verifyTask`, `rejectTaskCompletion`.
- Admin UI: "Create field task" button + modal on `/admin/sponsorships/[id]`.
- Admin UI: `/admin/tasks` global list (read-only) + `/admin/tasks/[id]` detail (with verify / reject_redo actions).
- API routes: `POST /api/admin/tasks/create`, `POST /api/admin/tasks/[id]/verify`, `POST /api/admin/tasks/[id]/reject-redo`.
- Audit-action additions: `admin_created_task`, `admin_verified_task`, `admin_rejected_task_completion` (extend `AuditAction` + `AUDIT_LABELS`).
- Notification-type addition: `admin_assigned_task` (wire `notifyDi` call from the create handler).
- DI-side: per-task detail page `/di/tasks/[id]` so the DI can land on it from the notification link (current `/di/tasks` is list-only).

**Test gate**: admin creates a task from a sponsorship → DI sees it in `/di/tasks` + receives notification → DI transitions open→in_progress→completed_pending_verification → admin verifies → DI receives "verified" notification.

### Phase 1.2 — Report lifecycle (hop 6, no donor send yet)

**Scope**
- Migration script `migrations/phase-1/002-extend-child-update.mjs` adding the 6 new columns (§1) + extending the status enum dropdown choices in Directus admin UI.
- DI side: extend `src/lib/di-reports.ts` write path to accept `taskId` + `sponsorshipId` and stamp them. Form on `/di/children/[id]/reports/new` already exists — add task picker (filtered to the DI's open tasks for this child).
- Admin UI: `/admin/reviews/reports` queue + `/admin/reviews/reports/[id]` detail (mirror of `/admin/reviews/moments/*`).
- Admin actions: `mark_under_review`, `approve`, `request_correction`, `reject`, `archive`, `hide_from_donor`. Each via its own POST endpoint under `/api/admin/reports/[id]/*`. No send-to-donor yet — that's 1.3.
- Audit actions: `admin_reviewed_report`, `admin_approved_report`, `admin_requested_report_correction`, `admin_rejected_report`, `admin_archived_report`, `admin_hid_report_from_donor`.
- DI notifications: `admin_approved_report` (when status moves to `approved`), `admin_requested_report_correction`, `admin_rejected_report`.

**Test gate**: DI drafts + submits a report linked to a task + sponsorship → admin sees it in the review queue → admin approves → status = `approved`, DI notified. Correction-request loop also tested.

### Phase 1.3 — Send to donor (hops 6→7 bridge)

**Scope**
- API route `POST /api/admin/reports/[id]/send` — flips status `approved` → `published` (= `sent_to_donor`), sets `sent_to_donor_at`, calls the donor-side write helpers from 1.4 (or stubs them if 1.4 is sequenced after). Idempotency check on `donor_notification_sent_at`.
- Admin UI: "Send to donor" action button on `/admin/reviews/reports/[id]` (only enabled when status = `approved`).
- Audit action: `admin_sent_report_to_donor`.

**Test gate**: from a previously-approved report, admin clicks "Send to donor" → the row's `sent_to_donor_at` populates → re-clicking is a no-op (idempotent).

### Phase 1.4 — Donor in-app notification + email (hop 7)

**Scope**
- `src/lib/donor-notifications.ts` reader + write helpers (`notifyDonor` mirror of `notifyDi`).
- Donor permission grant on `notification` collection in Directus admin UI (documented, not migrated).
- UI: `/dashboard/notifications` page (mirror of `/di/notifications`) + bell badge in the existing donor dashboard nav.
- New email template `src/emails/ChildReportSentEmail.tsx` + integration into the 1.3 send handler.
- New notification type `child_report_sent_to_donor` (extend `NotificationType` + `ACTOR_ROLE_STYLES` if needed — donor role is already in the styles map per `src/lib/audit-labels.ts:140-144`).

**Test gate**: end-to-end — admin clicks Send to donor on a report → donor's bell increments → donor opens `/dashboard/notifications` and sees the row → donor opens the report and reads it → donor receives the email (verified via Resend dev inbox or `EMAIL_TRANSPORT=sendmail` capture).

### Sequencing recommendation

**1.1 → 1.2 → 1.3 → 1.4 in order.** Each builds on its predecessor's schema + UI affordance. 1.3 can be merged with 1.4 if Mahmud prefers a single end-to-end ship, but separating them gives an extra test gate (1.3 verifies the admin send semantics in isolation before any donor-facing surface activates).

---

## 8. Open questions — need Mahmud's product call before build

### Q1. Should the brief's `DONOR_VERSION_GENERATED` be a distinct state?

The lifecycle in the brief has TWO terminal admin-side steps: `APPROVED` then `DONOR_VERSION_GENERATED` then `SENT_TO_DONOR`. The design above collapses `DONOR_VERSION_GENERATED` and `SENT_TO_DONOR` into one transition because there is no admin "rewrite for donor" gesture today. **If admin needs a discrete step where the DI's content is rewritten into donor-friendly copy (anonymising child name, softening clinical detail, adding "from your sponsorship" framing), `DONOR_VERSION_GENERATED` becomes its own state + an editable `donor_version_content` column.** If admin signs off on the DI's content as-is and just clicks Send, the collapse is correct. Default recommendation: collapse for V1, split later if needed.

### Q2. One report per task, or many?

The design above assumes 1:1 (`child_update.task` is M2O). A task could in principle produce multiple reports (e.g. "monthly progress" + "special holiday card" both attached to the same task). The cheapest answer for V1 is many-reports-per-one-task (which is what M2O already gives us) and let admin/DI use the title/type to distinguish. **Confirm: is the constraint 1:1 (enforce uniqueness) or 1:N (let admins/DIs file multiple)?** Default recommendation: 1:N (no uniqueness constraint).

### Q3. Multi-sponsor children — per-sponsor reports or shared?

A child can have an active sponsor + queued sponsors (`sponsorship.queue_position > 0`). When a report ships, who gets it? Options:
- (a) **Active sponsor only** — `child_update.sponsorship` set to the active row; report flows only to that donor. Queued donors see nothing during their wait.
- (b) **All current donors (active + queued + recently-ended)** — `child_update.visibility = 'all_donors'` and the donor reader scopes by "any sponsorship I ever held for this child". This matches the existing `visibility` enum's intent.
- (c) **DI/admin chooses per report** — a checkbox at report-creation time.

Default recommendation: (a) for V1 because Phase 0 invested in the explicit per-sponsor FK. (b) is the second-best fallback and is what the existing `visibility='all_donors'` is built for — admins can opt into it per-row. (c) is overkill for V1.

### Q4. Hidden-from-donor — notify the donor of the retraction?

If admin hides a previously-sent report for safeguarding reasons, does the donor receive a "we retracted that update" notification, or does the row silently disappear? Mirrors the existing `admin_removed_approved_*` pattern for DI (`src/lib/di-audit.ts:101-108`) which DOES notify. **Donor-facing equivalent: should we notify, or silent-pull?** Default recommendation: silent for V1 (avoid spooking donors); revisit if compliance/legal requires a positive notice.

### Q5. Existing `getApprovedChildUpdates` status filter — fix in scope?

`src/lib/sponsorship-data.ts:912` filters `status = 'approved'`, but the existing enum + writer path uses `status = 'published'` (`src/lib/di-reports.ts` header + `src/lib/child-profile-data.ts:512`). This means the donor-scoped reader returns zero rows today. Is this a known bug from a prior session, or is `approved` intended? Phase 1's reuse of `child_update` would have to pick the right value — the design above assumes `published` is the truth-side and absorbs `approved` as the same lifecycle state for new writes, but **Mahmud should confirm** whether the `getApprovedChildUpdates` filter is correct as-is and we should write `approved` going forward (in which case `published` is the obsolete value), or vice versa. Default recommendation: standardise on `published` going forward; treat the existing `getApprovedChildUpdates` filter as a latent bug to fix in Phase 1.2.

### Q6. Auto-send vs manual send

Once an admin approves, should the report auto-send to the donor immediately, or wait for an explicit "Send to donor" click? The design above is manual (explicit click) because it gives admin a clear last-mile gate. Auto-send is cheaper to build. **Confirm: explicit Send button, or auto-send on approve?** Default recommendation: explicit (matches the Phase 1.3 plan).

### Q7. SLA / cadence

Is there a target cadence ("one report per active sponsorship per month") with a cron that nudges DIs when they're overdue? Phase 1 does NOT include any SLA enforcement; reports are submitted when there's something to say. **Confirm: any cadence guarantee, or strictly event-driven?** Default recommendation: event-driven for V1; SLA cron is a future Phase 1.x.
