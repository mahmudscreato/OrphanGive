# Admin OS — Discovery Pass

**Branch:** `discovery/admin-os`
**Base SHA:** `e06d2cb` (main, post Session 58.10 merge)
**Scope:** READ-ONLY codebase audit. Maps existing surfaces against the
14 Admin OS target modules.
**Out of scope:** donor + public app (touched only where it surfaces
admin/DI data); UI screenshots; production VPS state.

Classification scheme used throughout:

| Tag                  | Meaning                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `[EXISTS-COMPLETE]`  | Production-quality surface; meets the intent of the module as a v1     |
| `[EXISTS-PARTIAL]`   | Code, route, or schema exists but misses one or more key sub-features  |
| `[DOES-NOT-EXIST]`   | No code, route, or schema in repo                                       |
| `[UNKNOWN]`          | Could not determine from local read; would require live DB inspection   |

The 14 target modules (rolled-up classification — full evidence in §3, §4, §6):

| # | Module                  | Status              | Where it lives (or doesn't)                            |
|---|-------------------------|---------------------|--------------------------------------------------------|
| 1 | Dashboard               | `[EXISTS-PARTIAL]`  | `/admin/` 4-tile review-queue snapshot                 |
| 2 | Donor Management        | `[EXISTS-COMPLETE]` | `/admin/donors`, `/admin/donors/[id]` (Session 65)     |
| 3 | Child Profiles          | `[EXISTS-COMPLETE]` | `/admin/children/*` (Session 66) + proposals queue     |
| 4 | Sponsorships            | `[EXISTS-COMPLETE]` | `/admin/sponsorships/*` (Session 61)                   |
| 5 | Donations               | `[EXISTS-PARTIAL]`  | Per-sponsorship Payments panel; no portfolio view      |
| 6 | DI Task Management      | `[EXISTS-PARTIAL]`  | DI side complete; admin task UI absent                 |
| 7 | Reports & Evidence      | `[EXISTS-PARTIAL]`  | `/admin/reviews/*` (Session 52); no per-sponsor digest |
| 8 | Finance Tracking        | `[DOES-NOT-EXIST]`  | No ledger, expense, or allocation tables               |
| 9 | Impact Dashboard        | `[DOES-NOT-EXIST]`  | No impact metric tables or aggregation                 |
|10 | Safeguarding Flags      | `[DOES-NOT-EXIST]`  | No flag table, no review queue                         |
|11 | Communication Center    | `[EXISTS-PARTIAL]`  | Event-triggered emails only; no broadcast surface      |
|12 | Support Tickets         | `[EXISTS-PARTIAL]`  | `form_submission` rows write; no admin triage UI       |
|13 | Audit Logs              | `[EXISTS-COMPLETE]` | `/admin/audit` (Session 67) + per-entity panels        |
|14 | Settings                | `[EXISTS-PARTIAL]`  | Catalog-style only (`donation-packages`, rates)        |

---

## S1 — Directus data model inventory

Sources of truth are walked in this order:
`bootstrap/src/index.ts` (Sessions 1–40 baseline collections) →
`bootstrap/src/v3-register-collections.ts` (Session 41-v3 additions) →
session-by-session SQL/`.mjs`/`.sh` migrations under `migrations/`.

### Collections actually used by application code

| Collection         | Defined in                          | Used in src/?    | Notes                                                                                                  |
| ------------------ | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `directus_users`   | Directus built-in + bootstrap extensions | yes              | Donors + DI + admin all share the table. `og_role` enum, `og_status`, `og_admin_approval_status`, etc. |
| `child`            | bootstrap index                     | yes              | Status enum: `draft|awaiting_intake|pending_approval|active|sponsored|archived|withdrawn`              |
| `child_proposal`   | v3                                  | yes              | Pending edits queue (admin approve/reject). Status enum: `draft|pending|approved|rejected|withdrawn`   |
| `child_document`   | bootstrap index                     | yes              | Tier-3 evidence (parent death cert, NID, etc.). Status: `pending|approved|rejected`                    |
| `child_intake_photo` | Session 48b migration             | yes              | Per-child initial-visit photos. Status: `pending|approved|rejected`                                    |
| `child_moment`     | Session 47-ish                       | yes              | Timeline highlights. Status: `pending|approved|rejected`                                              |
| `child_update`     | bootstrap index                     | yes              | DI reports; types: `academic|health|story|photo|milestone|eid_greeting|letter`; visibility `sponsor_only|all_donors` |
| `sponsorship`      | bootstrap index + many extensions   | yes              | Status: `pending_payment|active|paused|cancelled|completed|failed`. Carries queue_position/queue_status, payment_schedule, donor_currency_*, cause_tag, donation_package |
| `payment`          | not in bootstrap; legacy collection | yes              | Per-Stripe-charge ledger. Read by `getPaymentsForSponsorship`. **Schema details not fully traced — `[UNKNOWN]` whether 'payment' is bootstrap-managed.** |
| `aid_delivery`     | v3                                  | yes              | DI submits, admin verifies. Status: `pending|verified|rejected`. `sponsorship` FK is nullable.        |
| `task`             | v3                                  | yes              | Admin-assigned. Dual status: `di_status` (open/in_progress/completed_pending_verification) + `admin_status` (open/verified_complete/rejected_redo). No sponsorship FK. |
| `audit_log`        | v3                                  | yes              | actor + role + action + collection + record_id + diff + metadata. Donor role declared in code but no caller writes donor-role rows. |
| `notification`     | bootstrap index                     | yes (DI only)    | In-app bell. Recipient = directus_users. NO donor-facing notification reader exists.                  |
| `donation_package` | Session 58 migration                 | yes              | Catalog. `package_subtype` field added in 58.3. Archivable + reorderable.                              |
| `currency_rate`    | Session 58 migration                 | yes              | 8 currencies (BDT/USD/GBP/EUR/AUD/CAD/SGD/INR). Donor-currency lock semantics live in Stripe.         |
| `reveal_request`   | bootstrap index                     | yes              | Donor → "reveal real name/photo". Status: `pending|approved|rejected|revoked`.                         |
| `form_submission`  | Session 32 / 34 (not bootstrap)     | yes              | Contact + orphan referral + volunteer apps. Written by `/api/contact`; NO admin surface reads it.    |
| `bd_district`      | bootstrap index (or pre-existing)   | yes              | Lookup table for child location.                                                                       |

### Collections declared in bootstrap but DORMANT in code

| Collection           | Status        | Notes                                                                                                                               |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `donation`           | unused        | The new sponsor flow writes `sponsorship` + `payment`, never `donation`. Likely vestigial from a pre-Session-58 data model.        |
| `report`             | unused        | DI reports map to `child_update`. The `report` collection (with `period`, `pdf_file`, `generated_at`, `emailed_at`) is uncalled.    |
| `contact_submission` | unused        | The contact form writes `form_submission` instead. The bootstrap-declared `contact_submission` collection is uncalled.              |
| `tenant`             | unused        | Multi-tenancy declared but only one tenant exists; no `tenant_id` filtering in any read.                                            |
| `donation_bucket`    | unused        | Pre-Session-58 cause-buckets concept; replaced by `cause_tag` + `donation_package`.                                                 |
| `addon`              | unused        | No grep hits in src/.                                                                                                               |
| `site_content`, `site_page`, `faq`, `story` | mixed | Public-site content; outside admin/DI scope. `faq` content is hardcoded in bootstrap seeds.                                  |

### Key FK shape (relevant to S5 spine)

```
child ──┬─< child_proposal (proposed edits queue)
        ├─< child_document
        ├─< child_intake_photo
        ├─< child_moment
        ├─< child_update         (DI reports / "stories" to donors)
        ├─< aid_delivery         (sponsorship FK is NULLABLE)
        ├─< task                 (NO sponsorship FK)
        └─< sponsorship ───< payment (per-charge ledger)
                └── donor (directus_users)
                └── donation_package (FK, nullable; new-flow only)
```

**Critical observation:** the `aid_delivery → sponsorship` link is the
ONLY structural connection between a donor's money and a piece of field
work. `task → sponsorship` does not exist. `child_update → sponsorship`
does not exist (only `visibility: sponsor_only|all_donors`).

---

## S2 — Roles & RBAC

### Declared roles

`bootstrap/src/index.ts` line ~75 declares 6 roles in the `og_role`
enum on `directus_users`:

```
['super_admin', 'admin', 'data_inputter', 'legal_guardian', 'donor', 'org_donor']
```

The brief locks the V1 internal surface to **3 roles**: Super Admin,
Admin, Data Inputter.

### Auth gates today

| Role             | Helper                             | Cookie pair                                | Role-check key                     | Refresh? |
| ---------------- | ---------------------------------- | ------------------------------------------ | ---------------------------------- | -------- |
| Admin            | `requireAdminUser()` (lib/admin-auth.ts) | `admin_access_token` / `admin_refresh_token` | `role.name ∈ {"Admin","Administrator"}` | NO (route-handlers manually re-login on 401) |
| Data Inputter    | `requireDiUser()` (lib/di-auth.ts)       | `di_access_token` / `di_refresh_token`       | `role.name === "Data Inputter"`        | YES (transparent /auth/refresh)             |
| Donor (out-of-scope) | Better Auth (separate stack)             | Better Auth cookies                          | n/a — donor flow uses its own session   | yes (Better Auth managed)                   |

### Route protection

| Route group               | Guard                                            | Behaviour on no-session       |
| ------------------------- | ------------------------------------------------ | ----------------------------- |
| `/admin/(authed)/**`      | `await requireAdminUser()` in layout.tsx; manual `redirect("/admin/login")` | Redirect                      |
| `/di/(authed)/**`         | `await requireDiUser()` in layout.tsx; library calls `redirect("/di/login")` | Redirect                      |
| `/api/admin/**`           | Per-route `await requireAdminUser()` check; manual 401 NextResponse           | 401 JSON                     |
| `/api/di/**`              | Per-route `await getDirectusSession()` check; manual 401 NextResponse         | 401 JSON                     |

### Permission matrix

- `[DOES-NOT-EXIST]` — there is **no central permission matrix** in
  the codebase. Each admin route handler self-gates by name. Directus's
  own per-collection role permissions (set during bootstrap) form the
  actual matrix, but no code-side mirror exists.
- `[DOES-NOT-EXIST]` — there is **no distinction between Super Admin
  and Admin in application code today**. `ADMIN_ROLE_NAMES = new Set([
  "Admin", "Administrator" ])` admits both; the `super_admin` enum
  value on `og_role` is unreferenced in `src/`.

### Audit visibility

- `audit_log` write happens via `recordAuditEvent(...)` (lib/di-audit.ts).
  Caller passes `actorRole` ∈ `{data_inputter, admin, system}`.
- `donor` role exists in `AuditActorRole` (lib/audit-labels.ts:111) for
  forward compatibility but no caller writes a donor-role row today.

---

## S3 — Admin surfaces

### Routes (every `page.tsx` under `src/app/admin/`)

| Route                                              | Role     | Session  | What it does                                                                  |
| -------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `/admin/login`                                     | public   | 46-fix-2 | Cookie-based login form for Admin role                                        |
| `/admin/` (home)                                   | admin    | 51       | 4 stat tiles: pending proposals / moments+intake / deliveries / documents     |
| `/admin/audit`                                     | admin    | 67       | Global audit log viewer (URL-driven filters: actions, role, subject, date)    |
| `/admin/children`                                  | admin    | 66       | Paginated children list w/ filter + search + sponsor-count + funding state    |
| `/admin/children/[id]`                             | admin    | 66       | Full child detail (Tier 3 PII visible), audit history panel, edit + archive   |
| `/admin/children/[id]/edit`                        | admin    | 66       | Direct edit form (bypasses proposal queue; writes `admin_edited_child` audit) |
| `/admin/proposals`                                 | admin    | 51       | Pending child_proposal queue                                                  |
| `/admin/proposals/[id]`                            | admin    | 51       | Per-proposal detail with diff render + approve/reject/request-changes         |
| `/admin/reviews`                                   | admin    | 52       | Queue index (moments + intake photos + documents)                             |
| `/admin/reviews/moments`                           | admin    | 52b      | Pending moments queue                                                         |
| `/admin/reviews/moments/[id]`                      | admin    | 52b      | Per-moment review w/ approve / reject / remove                                |
| `/admin/reviews/intake-photos`                     | admin    | 52b      | Per-child intake batch queue                                                  |
| `/admin/reviews/intake-photos/[childId]`           | admin    | 52b      | Per-child batch-decide form                                                   |
| `/admin/reviews/documents`                         | admin    | 52b/52c  | Pending documents queue                                                       |
| `/admin/reviews/documents/[id]`                    | admin    | 52b/52c  | Per-document review w/ approve / reject / remove / direct-upload              |
| `/admin/sponsorships`                              | admin    | 61       | List of all sponsorships (filter by status)                                   |
| `/admin/sponsorships/[id]`                         | admin    | 61       | Detail: header + donor + donation-context + child + Payments + timeline + actions (pause/resume/cancel/refund) |
| `/admin/donors`                                    | admin    | 65       | List of donors (filter, sort, search). Pending badge in sidebar.              |
| `/admin/donors/[id]`                               | admin    | 65       | Detail: profile + sponsorship history + lifetime giving + approve/reject/suspend/reactivate/reset-password |
| `/admin/donation-packages`                         | admin    | 58       | Catalog list w/ drag-reorder (@dnd-kit)                                       |
| `/admin/donation-packages/[id]`                    | admin    | 58       | Edit / archive / reactivate                                                   |
| `/admin/donation-packages/new`                     | admin    | 58       | Create form                                                                   |
| `/admin/currency-rates`                            | admin    | 58       | 8-currency rate list                                                          |
| `/admin/currency-rates/[id]`                       | admin    | 58       | Edit rate                                                                     |

### Admin API routes (under `/api/admin/`)

Grouped by entity:

- **proposals:** `[id]/approve`, `[id]/reject`, `[id]/request-changes`
- **reviews — documents:** `route` (list), `[id]` (detail+delete), `[id]/approve`, `[id]/reject`
- **reviews — moments:** `[id]/approve`, `[id]/reject`
- **reviews — intake-photos:** `route` (list), `[id]` (detail+delete), `[id]/approve`, `[id]/reject`, `batch-decide`
- **sponsorships:** `[id]/cancel`, `[id]/pause`, `[id]/refund` (`.tsx`!), `[id]/resume`
- **donors:** `[id]/approve`, `[id]/reject`, `[id]/suspend`, `[id]/reactivate`, `[id]/send-password-reset`
- **children:** `[id]/archive`, `[id]/edit`, `[id]/reactivate`, `[id]/request-document-reupload`, `[id]/request-intake-reupload`
- **donation-packages:** `create`, `[id]/edit`, `reorder`
- **currency-rates:** `[id]/edit`
- **auth:** `login`, `logout`

### Module-by-module classification (admin POV)

| Admin OS module       | Status              | Evidence                                                                                                                                |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard             | `[EXISTS-PARTIAL]`  | 4 review-queue tiles only. No active-sponsorships KPI, no MRR/lifetime-giving, no "alerts" pane, no recent-activity feed for admin.    |
| Donor management      | `[EXISTS-COMPLETE]` | Full list + detail + approval lifecycle + sponsorship history + audit (`admin_*_donor` actions all wired through Session 65)            |
| Child profiles        | `[EXISTS-COMPLETE]` | Full CRUD via direct-edit + proposal queue. Document + intake-photo review queues. Re-upload request hooks → DI notifications.        |
| Sponsorships          | `[EXISTS-COMPLETE]` | List + detail + pause/resume/cancel/refund. Donor-currency display (Session 58.7–58.10). Charges/refund via live Stripe API.            |
| Donations (financial portfolio view) | `[EXISTS-PARTIAL]` | Per-sponsorship Payments panel surfaces individual charges; **no cross-sponsorship donations report, no "lifetime giving by donor" aggregate**, no failed-payment retry queue. |
| DI Task management (admin side)      | `[DOES-NOT-EXIST]` | DI surfaces tasks (read + transition) but admin has **no UI for creating, assigning, priority-editing, or verifying tasks**. Per the di-tasks.ts header: "Admin owns: creation, priority, due date, verification — until Admin Dashboard ships, that lives in Directus admin only." |
| Reports & Evidence    | `[EXISTS-PARTIAL]`  | Admin reviews moments + intake + documents + child_update? **`child_update` (DI reports) has NO admin review surface — they go from `pending` → `published` but no UI between**. `aid_delivery` review: also no dedicated admin queue (only stat tile).                                              |
| Finance tracking      | `[DOES-NOT-EXIST]`  | No expense/disbursement table. No "money sent to country" view. The only money record is incoming (sponsorship + payment).               |
| Impact dashboard      | `[DOES-NOT-EXIST]`  | No impact metric collection (meals served, schoolings supported, etc). Aid-deliveries have an `aid_type` enum but no aggregation surface. |
| Safeguarding flags    | `[DOES-NOT-EXIST]`  | No flag table, no review queue, no `is_sensitive` column on `child` per grep. FAQ static content mentions "safeguarding team" but no code-side workflow. |
| Communication center  | `[EXISTS-PARTIAL]`  | Per-event triggered emails (see §S7). **No broadcast / segment / campaign surface, no in-app messaging.**                              |
| Support tickets       | `[EXISTS-PARTIAL]`  | `/api/contact` writes `form_submission` rows. **No admin triage UI, no status/assignee/conversation thread.** Resend email also fires to support@orphangive.org. |
| Audit logs            | `[EXISTS-COMPLETE]` | `/admin/audit` (Session 67) + per-entity panels on sponsorship/child/donor detail. AUDIT_LABELS centralised in lib/audit-labels.ts.    |
| Settings              | `[EXISTS-PARTIAL]`  | Catalog-style: donation-packages + currency-rates. **No `/admin/settings/*` page; no org-level config (org name, address, timezone, email-from, support-email), no role permissions matrix, no feature flags.** |

---

## S4 — DI system

### DI routes (under `src/app/di/(authed)/`)

| Route                                    | Session | What it does                                                          |
| ---------------------------------------- | ------- | --------------------------------------------------------------------- |
| `/di/login`                              | 42      | Cookie-based login                                                    |
| `/di/`                                   | 47      | Home: stat tiles + Urgent Tasks panel + Recent Activity feed         |
| `/di/children`                           | 43      | List of DI-scoped children w/ category filter pills                   |
| `/di/children/[id]`                      | 43      | Detail with tabs: Profile / Moments / Reports / Deliveries / Documents / History / Sponsorship |
| `/di/children/[id]/edit`                 | 44      | Opens proposal-edit flow                                              |
| `/di/children/new`                       | 52a     | Create stub child (status `awaiting_intake`) → proposal               |
| `/di/children/[id]/moments/new`          | 47-ish  | Submit a `child_moment` (pending → admin review)                     |
| `/di/children/[id]/reports/new`          | 45      | Submit a `child_update` (DI "report")                                |
| `/di/children/[id]/deliveries/new`       | 45      | Submit an `aid_delivery` (optionally tied to a sponsorship)           |
| `/di/drafts`                             | 52d     | DI's in-progress proposals/uploads                                    |
| `/di/notifications`                      | 47      | Bell list (admin approvals, re-upload requests, etc.)                |
| `/di/submissions`                        | various | All pending/recent submissions across the 4 surfaces                  |
| `/di/tasks`                              | 46      | Admin-assigned task list w/ status + priority filters                 |

### DI API routes (under `/api/di/`)

`proposals` (create/submit/withdraw + per-id), `moments`, `reports`,
`deliveries`, `tasks/[id]/transition`, `documents`, `intake-photos`,
`uploads/photo`, `uploads/video`, `uploads/document`, `schools`,
`notifications` (read, read-all), `children/[id]/sponsorship`,
`login` / `logout` / `me`.

### Scoping rule (centralised)

Every DI read enforces:

```
(child.uploaded_by_di = self OR child.assigned_di = self)
AND child.status NOT IN ('withdrawn', 'awaiting_intake'/* stubs */)
```

Implemented in `di-children.ts`. Every mutation re-checks ownership
server-side before persisting.

### Module classification (DI POV)

| Admin OS module    | Status              | Evidence                                                                                                                          |
| ------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| DI Task management | `[EXISTS-PARTIAL]`  | DI **can read, filter, sort, and transition** tasks (open→in_progress→completed_pending_verification, plus rework on rejected_redo). DI **cannot create** tasks (no admin task-creation UI either, see §S3). |

---

## S5 — Deployment / Accountability spine (CRITICAL)

Trace of: **donation → admin allocation → DI field task → evidence →
admin verify → donor report → notify → finance/impact.**

| Hop | What it means                                                          | Status              | Where the gap is                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Donation lands (sponsorship row created, payment captured)              | `[EXISTS-COMPLETE]` | `/api/donate/init` → Stripe checkout/PI → webhook (`/api/webhooks/stripe`) writes sponsorship + payment rows. Currency-locked per donor. |
| 2   | Admin sees the donation, decides allocation                             | `[EXISTS-PARTIAL]`  | Admin can see the sponsorship in `/admin/sponsorships/[id]` (incl. child + donor + cause). **Allocation is implicit (sponsorship.child set at checkout). There is no separate "admin allocates this donation" step or table — the donor picks the child up-front, admin has no re-allocation UI.** |
| 3   | Admin creates a DI task for the field work                              | `[DOES-NOT-EXIST]`  | No admin task-creation UI in `/admin/*`. Tasks must currently be created directly in Directus admin per di-tasks.ts header.                                                       |
| 4   | DI executes, uploads evidence (delivery + photo + acknowledgment)        | `[EXISTS-COMPLETE]` | `/di/children/[id]/deliveries/new` → `aid_delivery` row (pending). Photo required server-side. `sponsorship` FK is **optional, not enforced** — DI may forget to link.            |
| 5   | Admin verifies evidence                                                  | `[EXISTS-PARTIAL]`  | Admin home shows `pending_delivery_count` tile but the queue lives at `/admin/reviews` (catch-all), **with NO dedicated `aid_delivery` review queue page** — DI deliveries are not in the Session 52b queue routes.                                |
| 6   | Donor receives a report tying the work back to their gift               | `[EXISTS-PARTIAL]`  | DI submits a `child_update` (with `visibility: sponsor_only | all_donors`). **No code path emails the sponsor when a child_update is published.** The `report` collection exists but is dormant. |
| 7   | Donor + admin notified throughout                                        | `[EXISTS-PARTIAL]`  | DI gets `notification` rows for admin decisions. **Donor receives NO in-app notifications at all** (no donor reader for `notification`). Donor email touchpoints: signup, welcome, monthly receipt, pause/cancel/extend/modify, reveal approved/denied, campaign thank-you. None tied to evidence-published events. |
| 8   | Finance: money in (sponsorship/payment), money out (disbursement, expense, FX) | `[DOES-NOT-EXIST]`  | Money-in is fully tracked. **Money-out (admin/DI sends money to country, buys aid, pays staff) has zero schema.** No expense, disbursement, ledger, or reconciliation table.        |
| 9   | Impact: aggregate KPIs (children helped, meals served, etc.)             | `[DOES-NOT-EXIST]`  | No aggregation surface. `aid_delivery.aid_type` is the only structured impact data and it isn't summarised anywhere in code.                                                       |

**Spine health summary:** hops 1, 4 are solid. Hop 2 collapses
allocation into the donor's checkout choice. Hop 3 is a hard gap.
Hop 5 has the data but no dedicated UI. Hop 6 is data-present
(child_update + visibility) but never reaches the sponsor. Hops 8–9
are missing wholesale.

---

## S6 — Finance / Impact / Safeguarding / Comms / Tickets

### Finance — `[DOES-NOT-EXIST]`

- No `expense`, `disbursement`, `country_remittance`, or
  `cost_center` collection.
- The only money-tracking is incoming: `sponsorship.amount_usd` /
  `sponsorship.donor_currency_amount` / `payment.amount_usd` /
  `payment.currency`.
- `currency_rate` exists for checkout pricing, not for reconciliation
  of foreign-currency disbursements.
- No FX reconciliation between BDT base and donor currencies once the
  charge is settled.
- No payout queue, no Stripe payout reconciliation surface.

### Impact — `[DOES-NOT-EXIST]`

- No `impact_metric`, `kpi_snapshot`, `program_outcome` collection.
- `aid_delivery.aid_type` enum (`education|food|healthcare|clothing|
  general_care|other`) is structured but never aggregated in code.
- Stat tiles count `pending` deliveries, not delivered-by-type.

### Safeguarding flags — `[DOES-NOT-EXIST]`

- No `safeguarding_flag`, `incident`, `child_concern` collection.
- `child.is_sensitive_flag` does not appear in any `src/` grep
  (only in FAQ static content + `bootstrap` schema definition).
- No safeguarding review queue, no escalation workflow, no
  flag-and-suppress-from-donor logic.

### Communication center — `[EXISTS-PARTIAL]`

- All comms today are **event-triggered transactional emails** via
  `/api/internal/email/*`:
  `campaign-thank-you`, `donor-approved`, `monthly-receipt`,
  `preview/[template]`, `reveal-approved`, `reveal-denied`,
  `sponsorship-cancelled`, `sponsorship-extended`,
  `sponsorship-modified`, `sponsorship-paused`,
  `sponsorship-welcome`.
- `[DOES-NOT-EXIST]`: any segment + broadcast surface, donor-list
  filter UI, send-once campaign tool, A/B test, suppression list
  manager (Resend handles bounces silently), in-app messaging.

### Support tickets — `[EXISTS-PARTIAL]`

- `/api/contact` accepts three kinds (general, orphan referral,
  volunteer application) → writes `form_submission` Directus row +
  fires Resend email to support@orphangive.org.
- `[DOES-NOT-EXIST]`: any admin UI that reads `form_submission`, no
  status/assignee/SLA/reply-thread fields, no per-ticket conversation
  history. The bootstrap-declared `contact_submission` collection
  exists but is unused (different table name from what `/api/contact`
  actually writes to).

---

## S7 — Email & notifications

### In-app notifications

- One table: `notification` (recipient FK to `directus_users`, type
  enum, JSON payload, read flag, read_at, date_created, created_by).
- Reader: only `/api/di/notifications/*` + `/di/notifications` page.
  **No donor or admin in-app notification surface.**
- Writer: `notify(...)` in `lib/di-notify.ts` — admin actions only.
  16 declared notification types covering proposal approve/reject,
  document/intake/moment approve/reject, removal of approved items,
  re-upload requests, and TODOs for `admin_assigned_child` /
  `admin_assigned_task` (not yet wired — no admin UI for task
  creation).

### Email templates (React Email, sent via Resend)

| Template file                                  | Trigger                                                              | Audience |
| ---------------------------------------------- | -------------------------------------------------------------------- | -------- |
| `OperationalNoticeEmail`                       | `/api/contact` POST                                                  | support inbox |
| `donor-approved`                               | admin approves donor (`approveDonor` in admin-donor-actions.ts)      | donor    |
| `monthly-receipt`                              | cron + webhook recurring payment success                             | donor    |
| `sponsorship-welcome`                          | first successful charge on a new sponsorship                         | donor    |
| `sponsorship-cancelled` / `-paused` / `-modified` / `-extended` | matching sponsorship lifecycle endpoints                            | donor    |
| `reveal-approved` / `reveal-denied`            | admin decision on `reveal_request`                                   | donor    |
| `campaign-thank-you`                           | one-time campaign donations                                          | donor    |
| `preview/[template]`                           | dev-only template preview                                            | dev      |

- `[EXISTS-PARTIAL]` overall: per-event transactional emails are
  comprehensive for the lifecycle events Sessions 58+ defined.
- `[DOES-NOT-EXIST]`: no email when `child_update` (DI report)
  publishes; no email when `aid_delivery` verifies. The donor doesn't
  hear from us when our field team actually delivers their gift.

### Crons

`/api/cron/*`: `cleanup-otp`, `decrement-prepaid` (prepaid-month
counter + auto-cancel when 0), `expire-reveals` (auto-revoke pending
> N days), `expire-stale-proposals` (auto-reject pending proposals
> 30d), `promote-queue` (waitlist → active when prior sponsor ends).
Crons documented in `docs/cron-setup.md`.

---

## S8 — Local dev environment

### Local stack composition (docker-compose.local.yml)

| Service           | Image                                | Port (host) | Purpose                                                  |
| ----------------- | ------------------------------------ | ----------- | -------------------------------------------------------- |
| og-postgres-local | `postgis/postgis:15-3.4-alpine`      | 5433        | Pinned to VPS (PG 15.8 + PostGIS 3.4)                    |
| og-directus-local | `directus/directus:11.17.4`          | 8055        | Pinned to VPS                                             |

The Next.js app runs separately via `npm run dev` against `NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055`.

### Boot sanity check (run this pass)

```
$ docker compose -f docker-compose.local.yml ps
og-directus-local   Up 6 days (healthy)   0.0.0.0:8055->8055/tcp
og-postgres-local   Up 9 days (healthy)   0.0.0.0:5433->5432/tcp

$ curl -s http://localhost:8055/server/ping
pong

$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8055/server/health
200
```

Stack is up and healthy.

### Known friction (read-only observations)

- `.env.local-stack` is git-ignored. `docker compose` warned about
  unset `DIRECTUS_KEY`, `DIRECTUS_SECRET`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD` when invoked without the env file. Existing
  containers were started with the env file present, so they keep
  working — but a fresh clone needs the file before `up -d` will
  produce a usable Directus.
- No Redis, no Caddy, no SMTP locally (sendmail no-op).
- Storage is local-disk only — Cloudinary uploads cannot be tested
  end-to-end against local Directus.
- No automated seed: the local DB is whatever was restored from the
  Session 41-LOCAL dump. Schema drift between local + production is
  managed by re-running session-N migration scripts under
  `migrations/`.

### Other docs that touch dev setup

- `docs/dev-setup.md` — full reset procedure
- `docs/cron-setup.md` — local cron testing
- `docs/email-architecture.md` — Resend + template flow
- `docs/pre-launch-audit.md` — Session-40-era audit
- `docs/session-49-donor-surface-audit.md` — Session 49 audit

---

## S9 — Observations, Risks, and Unknowns

### Observations (informational — do not act on these without an
explicit task)

1. **`donation`, `report`, `contact_submission` collections in
   `bootstrap/src/index.ts` are dormant** — the live app writes
   `sponsorship` + `payment`, `child_update`, and `form_submission`
   respectively. Cleanup is a future-session opportunity, not a bug.
2. **`AUDIT_LABELS` in `lib/audit-labels.ts` already includes 5
   sponsorship-lifecycle actions and donor-management actions**, but
   the `AuditAction` union in `lib/di-audit.ts` does NOT include any
   sponsorship-side action (cancel/pause/refund/extend/modify). The
   sponsorship lifecycle handlers in `/api/sponsorship/[id]/*` and
   `/api/admin/sponsorships/[id]/*` were NOT confirmed to call
   `recordAuditEvent` — `[UNKNOWN]` whether sponsorship state changes
   are audited. The `/admin/sponsorships/[id]` page does call
   `listAuditEventsForSponsorship`, so SOMETHING is being recorded,
   but the action enum doesn't list them.
3. **No `admin_*` audit row exists for any donation/sponsorship
   action** beyond donation_package / currency_rate. If an admin
   refunds a charge or cancels a sponsorship, the audit trail is
   `[UNKNOWN]`.
4. **`child_update` (DI report) has no admin review surface** —
   moments/intake-photos/documents each have a `/admin/reviews/*`
   route + per-id detail, but reports do not. `child_update` has
   status `draft|pending|published|rejected` but no admin page in
   `/admin/reviews/` flips that status.
5. **`aid_delivery` review queue lives at `/admin/reviews` (the
   index)** — the home stat tile counts pending deliveries but
   clicking through goes to a queue index, not a dedicated delivery
   review page like `/admin/reviews/deliveries/`. Possibly handled
   inside `/admin/reviews/page.tsx` — not confirmed.
6. **DI cannot create tasks; admin has no task UI either.** Per
   di-tasks.ts header: tasks must be created in Directus admin until
   an admin task UI ships.
7. **Donors receive zero in-app notifications.** The `notification`
   collection has a `recipient` FK to `directus_users` — donors are
   `directus_users` rows — but no reader, no bell, no inbox page on
   the donor surface.
8. **Sponsorship-evidence link is one-way and weak.** `aid_delivery`
   has an optional `sponsorship` FK, but no enforcement that a
   delivery for a sponsored child is linked to the funding
   sponsorship. `task` and `child_update` have NO sponsorship FK at
   all.
9. **Six roles defined, two used.** `og_role` enum carries
   `super_admin`, `admin`, `data_inputter`, `legal_guardian`,
   `donor`, `org_donor`. App code only branches on Admin /
   Administrator vs Data Inputter vs Better Auth donor. The
   `super_admin` / `legal_guardian` / `org_donor` paths are
   un-implemented.
10. **`payment` collection origin is `[UNKNOWN]`** — it isn't in
    `bootstrap/src/index.ts` nor in the v3 register script we read.
    Read-only grep confirms it's actively used. Likely registered in
    one of the pre-Session-41 SQL files or directly in Directus
    admin during the early life of the project.

### Risks (observations rephrased through the donor's lens — still
informational only)

- A donor who funds a sponsorship can land on the dashboard, see a
  charge, but **never be told when their gift translates to a
  delivered piece of aid**. The plumbing exists (`aid_delivery` with
  optional `sponsorship` FK + `child_update` with `sponsor_only`
  visibility) but nothing closes the loop.
- A safeguarding incident (child harm, donor misconduct, data
  exposure) has **no schema, no queue, and no escalation path** in
  the platform today.
- A donor's money "in" is tracked end-to-end. The same money "out"
  (FX-converted, sent to country, spent on aid) is not tracked at
  all. The org cannot self-audit its own disbursement chain from this
  data model.

### Unknowns

- The exact schema of the live `payment` table (used by code,
  origin not in bootstrap files read).
- Whether sponsorship lifecycle actions (admin cancel/refund/pause)
  call `recordAuditEvent` — `AuditAction` enum doesn't list them but
  `/admin/sponsorships/[id]` reads timeline events.
- Whether the production Directus role permissions diverge from the
  bootstrap registration script (this audit didn't touch the live
  database).
- The actual user count of each role on production (only `admin`
  and `data_inputter` exercised by code; legal_guardian / org_donor
  may or may not have real users).
- Whether `/admin/reviews/page.tsx` handles aid_delivery review
  inline or whether the stat tile dead-ends (route exists but
  contents not read this pass).
