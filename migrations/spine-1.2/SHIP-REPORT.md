# Spine 1.2 — Report Lifecycle: Ship Report

**Branch:** `feature/spine-1.2-report-lifecycle`
**Commits:** 3 (29a4baf, 4158e2f, fd0e802) — squash-merge ready
**Scope lock honored:** report from CREATION → REVIEW → APPROVED-AND-READY
only. Donor send (1.3) + donor notification (1.4) NOT built.

## What ships

### Schema (commit 29a4baf)
`migrations/spine-1.2/001-extend-child-update.mjs` adds **6 nullable
columns** to `child_update` plus 4 new status enum values. Idempotent.
Two-step FK pattern (POST /fields then POST /relations) with probes.

| Column | Type | Purpose |
|---|---|---|
| `task` | uuid M2O → task, NULLABLE, ON DELETE SET NULL | Optional link to the field task that produced this report |
| `report_type` | varchar(32) NULLABLE | `'progress'` (monthly) or `'deployment'` (one-time) — derived at write time |
| `donor_text` | text NULLABLE | Admin-editable donor copy; initialized to DI's `content` |
| `donor_text_edited_at` | timestamptz NULLABLE | Set on every admin save |
| `donor_text_edited_by` | uuid M2O → directus_users, NULLABLE, ON DELETE SET NULL | Edit attribution |
| `correction_reason` | text NULLABLE | Admin's send-back note |

New status enum values: `submitted_by_di`, `under_admin_review`,
`approved`, `correction_requested`. Existing values (`draft`, `pending`,
`published`, `rejected`) untouched.

### DI submission (commit 4158e2f)
- `createReport(input)` extended with optional `sponsorshipId` + `taskId`
- When `sponsorshipId` present: validates child match, derives
  `report_type` from sponsorship.payment_mode (`monthly→progress`,
  `one_time→deployment`), writes `status='submitted_by_di'`,
  `donor_text=content`
- Legacy path (no sponsorshipId) preserved — still writes `status='pending'`
- New picker UI on `/di/children/[id]/reports/new` shows DI's active
  sponsorships + tasks for the child
- **Bug fix:** `getApprovedChildUpdates` filtered `status='approved'`
  but the writer used `'published'` → 0 results. Now reads `'published'`
  AND comment explains why `'approved'` (Spine 1.2 intermediate) must
  NOT be visible to donors

### Admin review (commit fd0e802)
Surfaces:
- `/admin/reviews` index tile with `countPendingReports()`
- `/admin/reviews/reports` (queue list, tabs: All / Progress / Deployment)
- `/admin/reviews/reports/[id]` (detail with claim/edit/approve/send-back)

API:
- `POST /api/admin/reports/[id]/claim`
- `POST /api/admin/reports/[id]/edit-donor-text` — `{ donorText }`, 50-4000 chars
- `POST /api/admin/reports/[id]/approve`
- `POST /api/admin/reports/[id]/request-correction` — `{ reason }`, 5-500 chars

Data layer (`src/lib/admin-reports.ts`):
- `listAdminReports({ reportType })` — `_or` filter on the four review-
  able statuses (including legacy `pending`), `limit: 100`, sort `-id`
- `countPendingReports()`
- `getAdminReportDetail(reportId)`
- `claimReportForReview` / `editReportDonorText` / `approveReport` /
  `requestReportCorrection` — each writes an audit_log row inline
- Typed errors: `ReportNotFoundError`,
  `InvalidReportStatusTransitionError`, `InvalidReportInputError`

### Audit
Five new actions wired everywhere:
- `admin_viewed_report` (force-dynamic on detail page load)
- `admin_claimed_report_review`
- `admin_approved_report`
- `admin_edited_report_donor_text` — metadata is `length_before` /
  `length_after` ONLY; never the donor_text body
- `admin_requested_report_correction` — metadata includes the
  admin-written reason verbatim (small free-text)

Wired in:
- `src/lib/di-audit.ts` — union + ACTION_DESCRIPTIONS
- `src/lib/audit-labels.ts` — AUDIT_LABELS + new `'report'` bucket;
  `resolveAuditSubjectLink` routes `child_update` rows to
  `/admin/reviews/reports/[id]`
- `src/components/di/HistoryPanel.tsx` — icon map
- `src/components/di/RecentActivityPanel.tsx` — icon map
- `src/lib/admin-children.ts` — per-child history copy

### StatusPill (in 4158e2f)
`src/components/di/StatusPill.tsx` extended with the four new lifecycle
kinds plus matching icons (Clock / Eye / CheckCircle2 / RotateCcw).

## Privacy boundary

Three structural guards on top of the existing tier system:

1. **Admin review reads (data layer):** every join in
   `admin-reports.ts` includes ONLY Tier-1 child fields (`display_name`,
   `bd_division.name`). NO district, DOB, guardian phone/name,
   medical, school, address. The admin has nothing Tier-3 to copy
   from in the surrounding render.

2. **DI original preserved verbatim:** `child_update.content` holds
   the DI's narrative untouched forever. Admin edits write to a
   separate `donor_text` column with `donor_text_edited_at` + `by`
   attribution.

3. **Audit metadata excludes donor_text body:** the
   `admin_edited_report_donor_text` action records lengths only.
   `admin_requested_report_correction` records the admin-written reason
   verbatim (small free-text the admin chose to write).

## Verification

- `tsc --noEmit`: clean
- `npm run build`: clean; all 4 API routes + 2 admin pages built
- Privacy grep across new surfaces: no Tier-3 field references
- Schema applied to local; FKs verified
  (`child_update_task_foreign`, `child_update_donor_text_edited_by_foreign`)
- DB-level smoke: inserted a `submitted_by_di` row → cleaned up

End-to-end browser walk-through deferred for user (requires DI + admin
session cookies the dev harness can't auto-provision).

## What's NOT in this branch (locked deferrals)

- Sending the approved report to the donor (Spine 1.3)
- Donor-side report notification (Spine 1.4)
- Donor-facing email (Spine 1.4)
- DI in-app notification for `admin_approved_report` / `admin_edited_report_donor_text` /
  `admin_requested_report_correction` — mirroring the moments pattern, this
  belongs in the same session that ships the donor send (so the DI doesn't
  see "approved" before the donor does)
- A terminal `rejected` admin path — Spine 1.2 only has send-back
  loop. Direct-in-Directus `rejected` flag remains reachable via
  the Directus admin UI for emergency overrides
- `report_type='progress'` reports for *paused* monthly sponsorships
  — current filter on `/di/children/[id]/reports/new` excludes paused;
  product decision needed before reviving

## Migration runbook

```
# Local (already applied):
cd public-site
docker compose run --rm node:22-alpine node migrations/spine-1.2/001-extend-child-update.mjs

# Production:
# (Mahmud to run from /opt/orphangive, env var pattern from session 58
# cleanup commit. Same idempotent script, safe to re-run.)
```

## Files changed

```
migrations/spine-1.2/001-extend-child-update.mjs   (new, commit 29a4baf)
migrations/spine-1.2/README.md                      (new, commit 29a4baf)
migrations/spine-1.2/SHIP-REPORT.md                 (this file)

src/lib/admin-reports.ts                            (new)
src/lib/di-reports.ts                               (modified — 4158e2f)
src/lib/di-tasks.ts                                 (modified — 4158e2f)
src/lib/sponsorship-data.ts                         (modified — 4158e2f, bug fix)
src/lib/di-audit.ts                                 (modified — fd0e802, audit actions)
src/lib/audit-labels.ts                             (modified — fd0e802)
src/lib/admin-children.ts                           (modified — fd0e802)
src/components/di/StatusPill.tsx                    (modified — 4158e2f)
src/components/di/HistoryPanel.tsx                  (modified — fd0e802)
src/components/di/RecentActivityPanel.tsx           (modified — fd0e802)
src/components/di/ReportForm.tsx                    (modified — 4158e2f)
src/components/admin/ReportReviewActions.tsx        (new — fd0e802)

src/app/api/di/reports/route.ts                     (modified — 4158e2f)
src/app/di/(authed)/children/[id]/reports/new/page.tsx (modified — 4158e2f)

src/app/admin/(authed)/reviews/page.tsx             (modified — fd0e802)
src/app/admin/(authed)/reviews/reports/page.tsx     (new — fd0e802)
src/app/admin/(authed)/reviews/reports/[id]/page.tsx (new — fd0e802)
src/app/api/admin/reports/[id]/claim/route.ts       (new — fd0e802)
src/app/api/admin/reports/[id]/approve/route.ts     (new — fd0e802)
src/app/api/admin/reports/[id]/edit-donor-text/route.ts (new — fd0e802)
src/app/api/admin/reports/[id]/request-correction/route.ts (new — fd0e802)
```
