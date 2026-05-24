# Admin OS — Phase 0 Pre-Build Diagnostic

**Branch:** `diagnostic/phase-0`
**Base:** `main` @ `e06d2cb`
**Scope:** READ-ONLY codebase audit ahead of Phase 0 build. Deep on the
three Phase 0 surgery sites (sponsorship FK links, Super Admin vs Admin
gate, audit-log write paths) plus the two areas the broad pass left thin
(duplicated/conflicting logic, security/privacy).
**Out of scope:** anything already settled in
`docs/admin-os/00-discovery.md` (role enum inventory, full route lists,
collection inventory, live-vs-dormant model) — cited here, not
re-derived.
**Rule:** diagnose only. No code changes proposed inline.

Classification scheme reused from `00-discovery.md`:
`EXISTS` / `PARTIAL` / `MISSING` / `UNKNOWN`.

---

## A — Sponsorship FK links (the structural weakness)

### A.1 `aid_delivery → sponsorship`  — `PARTIAL`

| Aspect                      | Reality                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field name                  | `sponsorship` (M2O to `sponsorship`)                                                                                                                                  |
| Declared in                 | `bootstrap/src/v3-register-collections.ts:197` (`f.m2o('sponsorship', { required: false })`); relation registered at `bootstrap/src/v3-register-collections.ts:288`. |
| Production schema           | Confirmed by `migrations/deploy-2026-05-17/002-directus-register.sh:285` — `interface: select-dropdown-m2o, special:[m2o]`, no `required:true`.                       |
| Nullability                 | Nullable in DB. Form workflow makes it optional too.                                                                                                                  |
| Write path                  | `src/lib/di-deliveries.ts:176` — `...(input.sponsorshipId ? { sponsorship: input.sponsorshipId } : {})`. Caller validates match-to-child via `getDiChildSponsorships`. |
| Validation                  | `src/lib/di-deliveries.ts:160-168` — if `sponsorshipId` provided, must belong to the same child. Throws `SponsorshipNotMatchingError`. **Does NOT enforce that a delivery for a sponsored child MUST be linked to the funding sponsorship.** |
| Read paths                  | `src/lib/di-deliveries.ts:209,222,290-321` (DI delivery list); `src/lib/admin-children.ts:1000` (admin per-child audit window); `src/lib/di-audit.ts:441` (child history feed). No admin sponsorship-detail page joins on `aid_delivery.sponsorship`. |
| Audit metadata              | `src/app/api/di/deliveries/route.ts:85-87` — when DI links to a sponsorship, the audit row's `metadata.sponsorshipId` carries it.                                     |
| Backfill concern            | Historical `aid_delivery` rows have `sponsorship = NULL`. Phase 0 cannot retroactively pair them without manual triage.                                              |

**One fact:** the column already exists, is already writable, and one
write-site already carries it — Phase 0 doesn't need a migration to
*introduce* the FK, only to (a) flip it to required when child has an
active sponsorship and (b) add a `NOT NULL` constraint guarded by a
backfill plan.

### A.2 `task → sponsorship`  — `MISSING`

| Aspect                  | Reality                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Field name              | none                                                                                                                                     |
| Declared in             | `bootstrap/src/v3-register-collections.ts:222-235` (no sponsorship m2o); `migrations/deploy-2026-05-17/002-directus-register.sh:305-…`  |
| Indirect linkage        | `task.child` (M2O child, nullable per `task` fields at v3-register:224) → child has 0..N sponsorships. No direct money→work hop.        |
| Read/write paths        | `src/lib/di-tasks.ts:136-148` (TASK_FIELDS list) — confirms no sponsorship field; `src/lib/di-home-stats.ts:107` (count by assignee).   |
| Audit metadata          | Task transition audit (`/api/di/tasks/[id]/transition`) records `metadata.childId` only. No sponsorship handle anywhere.                |
| Backfill concern        | `task` rows exist (DI side actively uses them). A new `sponsorship` column would be nullable on day 1; production data starts NULL.    |

**One fact:** the `task` collection has *no* current bridge to
sponsorship — not even an indirect via metadata. Phase 0 must add a new
column (Directus schema change) and decide whether tasks created for a
specific sponsor *cause* must be 1:1 with a sponsorship or are simply
tagged.

### A.3 `child_update → sponsorship`  — `MISSING` (with visibility flag stand-in)

| Aspect                  | Reality                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field name              | none                                                                                                                                                                            |
| Closest existing field  | `child_update.visibility` enum `sponsor_only | all_donors` — `src/lib/di-reports.ts:18-21` documents.                                                                            |
| Read paths              | `src/lib/sponsorship-data.ts:912` (`readItems('child_update' …)` — used for the donor's per-sponsorship "updates" timeline); donor-facing `getChildUpdates` in child-profile-data. |
| Audit metadata          | `child_update` write writes `metadata.childId`, no sponsorship handle. No code path stamps the update with the sponsoring donor's row id.                                       |
| Backfill concern        | Same as `task` — production `child_update` rows exist; a new sponsorship column would land NULL.                                                                                |

**One fact:** the donor-side "your updates" experience already filters
by `child_update.visibility = sponsor_only` AND donor sponsors the
child — not by an FK from update→sponsorship. Phase 0 either keeps the
visibility-flag idiom or adds an explicit FK; the choice changes
whether one update can be "addressed to" a specific sponsor (FK
required) vs simply scoped to any current sponsor (visibility
suffices).

### A.4 Cross-cutting

- **Phase 0 FK additions would touch (per file):**
  `bootstrap/src/v3-register-collections.ts` (declare new fields/
  relations), one new `migrations/session-XX/*.mjs` (apply via fetch +
  admin token, no SQL), `src/lib/di-deliveries.ts` (enforce required
  when applicable), `src/lib/di-tasks.ts` (TASK_FIELDS + admin
  create), `src/lib/di-reports.ts` + `src/lib/sponsorship-data.ts`
  (read joins), the relevant `/api/*` route handlers, plus admin
  sponsorship detail page (`/admin/sponsorships/[id]/page.tsx`) to
  surface linked work.
- **Backfill flag:** all three additions land on collections that
  already have production data. NULLable on day 1 is safe; NOT NULL
  requires a one-shot backfill — `aid_delivery` rows by guessing the
  active sponsorship at delivery time (lossy), `task` rows by manual
  admin pairing, `child_update` rows by per-child active sponsorship
  at publish time. None of this is in scope for diagnosis.

---

## B — Super Admin vs Admin gate (RBAC)

### B.1 Enforcement points for admin auth

| Layer                            | File                                                  | Check                                                                                  |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Layout (server component)        | `src/app/admin/(authed)/layout.tsx:20-23`             | `await requireAdminUser()` → `redirect("/admin/login")` if null                        |
| Session helper                   | `src/lib/admin-auth.ts:167-205`                       | `getAdminSession()` — fetches `/users/me` from Directus, checks `role.name ∈ {Admin, Administrator}` |
| Session helper (re-export)       | `src/lib/admin-auth.ts:213-215`                       | `requireAdminUser()` → thin wrapper around `getAdminSession()`. No `redirect()` — API routes manually 401. |
| Sponsorship action envelope      | `src/lib/admin-sponsorship-actions.ts:90-108`         | `authedAdminSponsorship(rawId)` → calls `requireAdminUser` + 404 on bad uuid           |
| Per-route handler check          | 28 of 34 `/api/admin/**` route files                  | `const admin = await requireAdminUser(); if (!admin) return 401`                       |
| **No-auth admin route handlers** | `/api/admin/login/route.ts`, `/api/admin/logout/route.ts` | Both intentionally pre-auth (login) or take refresh-token only (logout). Correct.   |
| **No-auth admin route handlers** | `/api/admin/sponsorships/[id]/{pause,cancel,resume,refund}/route.{ts,tsx}` | Each calls `authedAdminSponsorship` which internally calls `requireAdminUser` — so the per-route `grep` for `requireAdminUser` literal misses it, but the indirection is genuine. **Verified safe.** |

### B.2 Where `Admin` and `Administrator` are treated as interchangeable

Single source: `src/lib/admin-auth.ts:23`

```
const ADMIN_ROLE_NAMES = new Set(["Admin", "Administrator"]);
```

Used at:
- `src/lib/admin-auth.ts:130` (`loginAdmin` accept gate)
- `src/lib/admin-auth.ts:195` (`getAdminSession` accept gate)

**These two `.has(roleName)` checks are the *only* sites in `src/`.**
Anywhere else admin-ness is decided is downstream of `requireAdminUser`
returning a session.

### B.3 Sites that would need to change to introduce a real
`super_admin` vs `admin` distinction

Minimal cut:
1. `src/lib/admin-auth.ts` — split `ADMIN_ROLE_NAMES` into a tier
   discriminator; expose `AdminSession.tier: "super" | "regular"`.
2. Every `/api/admin/**` route handler that performs a sensitive
   action (refund, suspend donor, currency-rate edit, child archive,
   donor force-reset) — add a tier guard.
3. Layout-level gates that hide super-only navigation in
   `src/components/admin/AdminSidebar.tsx` / `AdminBottomNav.tsx`
   (currently unconditional).
4. A permission matrix module (does not exist today) — natural home:
   new file `src/lib/admin-permissions.ts` co-located with auth, kept
   exhaustive over the AUDIT_LABELS action list so admin-only vs
   super-only is a single-page diff.

### B.4 Where the role value comes from at request time

- `admin_access_token` cookie → Directus `/users/me?fields=…,role.name`.
- The role is read *from Directus on every request*, not stored in the
  cookie / JWT body. So role changes apply immediately and there's no
  client-side trust path.
- There is **no DB-side `og_role` column read** inside `admin-auth.ts`
  — only `role.name` (the built-in `directus_roles.name`). The
  `directus_users.og_role` enum exists (bootstrap-declared) but is
  **not consulted** by the admin auth flow.

### B.5 `super_admin` references in `src/`

```
grep -rn "super_admin\|SuperAdmin\|superAdmin" src/
→ ZERO hits
```

The `super_admin` enum value on `directus_users.og_role` exists in
`bootstrap/src/index.ts` and `bootstrap/src/v3-register-collections.ts`
only. No application-side code branches on it.

**One fact:** introducing Super Admin is a 4-call diff (the two
`ADMIN_ROLE_NAMES.has` sites + the layout sidebar + a new permission
module) because there's no scattered hand-rolled role check anywhere
else — every gate funnels through `requireAdminUser`.

---

## C — Audit-log write paths (resolving the open UNKNOWN)

### C.1 The reader

`src/lib/admin-sponsorships.ts:719-762` — `listAuditEventsForSponsorship`
queries `audit_log` filtered by `collection = 'sponsorship' AND
record_id = sponsorshipId`, sorted by timestamp.

Inline comment at lines 700-708 explicitly notes:
> "Donor self-cancel + self-pause via /api/sponsorship/[id]/* don't
> currently write audit_log rows (the donor flow predates the audit
> layer). For those, the timeline still shows the timestamp without
> attribution and we add a 'by donor' inference when the audit_log
> lookup turns up empty for an event that has a column timestamp set."

So the documented intent matches reality: the reader expects holes.

### C.2 Per-endpoint write status

Verified by `grep -c "audit_log\|recordAuditEvent"` against each route
file. **All sponsorship lifecycle endpoints:**

| Endpoint                                              | Audit write? | Action value written                       |
| ----------------------------------------------------- | ------------ | ------------------------------------------ |
| `/api/admin/sponsorships/[id]/cancel/route.ts`        | YES (raw `createItem('audit_log')`) | `admin_cancelled_sponsorship`              |
| `/api/admin/sponsorships/[id]/pause/route.ts`         | YES (raw `createItem('audit_log')`) | `admin_paused_sponsorship`                 |
| `/api/admin/sponsorships/[id]/resume/route.ts`        | YES (raw `createItem('audit_log')`) | `admin_resumed_sponsorship`                |
| `/api/admin/sponsorships/[id]/refund/route.tsx`       | YES (raw `createItem('audit_log')`) | `admin_refunded_sponsorship_charge`        |
| `/api/sponsorship/[id]/cancel/route.ts`               | NO           | —                                          |
| `/api/sponsorship/[id]/pause/route.ts`                | NO           | —                                          |
| `/api/sponsorship/[id]/resume/route.ts`               | NO           | —                                          |
| `/api/sponsorship/[id]/extend/route.ts`               | NO           | —                                          |
| `/api/sponsorship/[id]/modify-amount/route.ts`        | NO           | —                                          |
| `/api/sponsorship/[id]/visibility/route.ts`           | NO           | —                                          |
| `/api/sponsorship/[id]/cancel-queued/route.ts`        | NO           | —                                          |
| `/api/sponsorship/[id]/queue-shift/route.ts`          | NO           | —                                          |
| `/api/webhooks/stripe/route.ts`                       | NO           | — (no `system_*` audit on any of the 11 webhook event types) |

### C.3 Action-name registration

Cross-check the four action values that ARE being written against the
two registries:

| Value                                  | In `AuditAction` union (`lib/di-audit.ts`)? | In `AUDIT_LABELS` map (`lib/audit-labels.ts`)? |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `admin_cancelled_sponsorship`          | NO                                          | NO                                              |
| `admin_paused_sponsorship`             | NO                                          | NO                                              |
| `admin_resumed_sponsorship`            | NO                                          | NO                                              |
| `admin_refunded_sponsorship_charge`    | NO                                          | NO                                              |

Render behaviour today: `formatActionLabel` (audit-labels.ts:92-97)
falls back to snake-case → spaced-words, producing labels like
"Admin cancelled sponsorship" in the timeline. **Cosmetic only; the
data IS being captured.**

### C.4 Definitive resolution of the open UNKNOWN

- **Admin-initiated** sponsorship state changes (cancel/pause/resume/
  refund) ARE audited. The timeline reader sees real rows.
- **Donor-initiated** sponsorship state changes (cancel/pause/resume/
  extend/modify-amount/visibility/cancel-queued/queue-shift) ARE NOT
  audited. The timeline reader gets no row; the inline reader comment
  acknowledges this and falls back to a "by donor" inference from the
  sponsorship-row timestamp columns.
- **Webhook-initiated** state changes (`status='active'` on first
  payment, `status='completed'` on cron-driven prepaid expiry,
  Stripe-driven refund) ARE NOT audited.
- **Extend / modify-amount / visibility** changes — even when admin
  initiates via Directus admin UI rather than `/api/admin/*` — are
  not captured by any audit row written from `src/`.
- **No `admin_extended_sponsorship` / `admin_modified_amount` /
  `admin_changed_visibility` endpoints exist** under `/api/admin/`.

**One fact:** the timeline reader is doing best-effort triangulation
across audit rows that exist for admin cancel/pause/resume/refund and
nothing else — every other state change is invisible to the audit
viewer. Phase 0 must either (a) add `recordAuditEvent` calls to the
donor-side endpoints and the webhook, or (b) accept the gap and rename
the timeline panel "Admin-action history" to set the right
expectation.

---

## D — Duplicated / conflicting logic

### D.1 Dormant bootstrap collections

Confirmed via `grep -rnE 'readItems?\([\"\'](donation|report|
contact_submission)[\"\']|createItem\([\"\'](donation|report|
contact_submission)[\"\']' src/`:

```
→ ZERO hits
```

| Collection           | Schema present in `bootstrap/src/index.ts`? | Any SDK read or write in `src/`? | Conflict risk                                            |
| -------------------- | ------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `donation`           | yes                                         | NO                               | None — the live alternative is `sponsorship` + `payment`. No stray import. |
| `report`             | yes (period/pdf_file/generated_at/emailed_at) | NO                               | None — live alternative is `child_update`. The string `"report"` appears only in user-facing email copy / label maps (`src/lib/di-notify.ts:67`, `src/emails/AdminPendingSubmissionEmail.tsx:15`). |
| `contact_submission` | yes                                         | NO                               | None — live alternative is `form_submission` (Session 32/34). The dormant `contact_submission` table never gets a row written; nothing reads it. |
| `tenant`             | yes                                         | NO                               | None — no `tenant_id` filtering anywhere; single-tenant deploy.    |
| `donation_bucket`    | yes                                         | NO                               | None — superseded by `donation_package` + `cause_tag`.             |
| `addon`              | yes                                         | NO                               | None.                                                              |

**Risk of re-activation:** low. The bootstrap script is idempotent and
would re-register the dormant collections if re-run, but no application
code path writes or reads them. A stray future import would have to
explicitly type the collection string — auto-complete won't surface
them because no existing module exports a `Donation` / `Report` /
`ContactSubmission` type.

### D.2 Other duplicated abstractions

| Pattern                                | Where                                                                  | Why it's a conflict                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit write site                       | `lib/di-audit.ts:recordAuditEvent` vs raw `createItem("audit_log", …)` | Admin sponsorship action routes write audit via raw `createItem` (cancel/pause/resume/refund). DI-side mutations go through `recordAuditEvent`. The raw path bypasses the `redactAuditPayload` Tier-3 redaction (audit-labels has no Tier-3 fields on sponsorship today, so currently benign — but the divergence is real). |
| Sponsorship full-field list            | `lib/sponsorship-data.ts:132 (FULL_FIELDS)` vs `lib/admin-sponsorship-actions.ts:29 (ADMIN_FULL_FIELDS)` | Two near-identical 30-field lists. The admin one was copy-pasted in Session 61 with explicit note "kept small and intentional." Stays in sync by manual diff today; Session 58.10's donor-currency additions to FULL_FIELDS were NOT mirrored into ADMIN_FULL_FIELDS — verified by spot-check. **Drift risk.**            |
| Two `ChildSummary` modules             | `lib/children-data.ts:ChildSummary` (public browse) vs `lib/di-children.ts:DiChildSummary` (DI-scoped) vs `lib/admin-children.ts:AdminChildRow` (admin) | Intentional — different audiences see different field shapes. Not really a conflict, but Phase 0 work that touches "what's on a child card" must pick one and stop assuming a shared shape exists. |
| Two `OutOfScopeError` classes          | `lib/di-deliveries.ts:75-82` and `lib/di-reports.ts:79-86`             | Independently declared but semantically identical. No `instanceof` cross-check would survive the swap. Cosmetic.                                                                                                                                                                                                            |
| Two `InvalidInputError` classes        | same files                                                             | Same pattern.                                                                                                                                                                                                                                                                                                              |

**One fact:** the admin audit-write path uses raw `createItem` instead
of `recordAuditEvent`. That's the only true duplication of behaviour
on a code path Phase 0 might touch — everything else is either dormant
schema or per-audience shape divergence that's defensible.

---

## E — Security / privacy risk scan

### E.1 The privacy contract (load-bearing reference)

Per Session 49 documentation + repeated inline reminders in
`src/lib/children-data.ts:16-23` and
`src/components/children/BrowseChildCard.tsx:189-190`:
- **Tier 1 (public, unauthenticated):** name, photo, story, age,
  DIVISION (not district), education_level. NEVER: district, exact
  DOB, guardian contact, GPS, medical, school name, address.
- **Tier 2 (authenticated donor):** + Tier 2 enrichment fields
  (siblings, household, disability flags, vaccination, education
  organisation).
- **Tier 3 (admin / DI scope):** + encrypted fields surfaced via
  separate admin/DI data layers (never via donor-facing query).

### E.2 Risks found, ranked by severity

#### 🔴 R1 — `bd_district.name` leaks to Tier 1 on `/children/[id]`

| Aspect       | Evidence |
| ------------ | -------- |
| Data layer   | `src/lib/child-profile-data.ts:114-130` — `PUBLIC_FIELDS` array includes `"bd_district.code"` and `"bd_district.name"`. `getChildById(id, tier)` requests these EVERY tier, including `tier === "public"` (lines 280-296), and returns `district: row.bd_district?.name?.trim() ?? null` (line 358) unconditionally. |
| Render layer | `src/components/profile/ProfileHero.tsx:139-145` — renders `child.district` (followed by `, child.region`) inside a location pill. The component receives `tier` as a prop but only uses it at line 161 to switch CTA label ("Sign in to learn more →" vs "Sponsor"). District display is NOT gated. |
| Route        | `/children/[id]` (`src/app/children/[id]/page.tsx`) — public, no auth required. |
| Severity     | HIGH. Direct violation of the Tier 1 contract on the most-linked donor-acquisition page. Anyone with the URL sees the district. |

**Note:** The data-layer comment at `children-data.ts:16-23` explicitly
warns against district-level *filtering* on the public list — but the
*detail* page (a different code path) still emits district to all
viewers.

#### 🟠 R2 — `ChildCard.tsx` shows district before region

| Aspect       | Evidence |
| ------------ | -------- |
| Render layer | `src/components/children/ChildCard.tsx:66` — `const districtLine = child.district ?? child.region ?? null;`. District is preferred; region is fallback. |
| Used on      | `/dashboard` recommendations (donor-tier, OK), `/dashboard/sponsorship/[id]` (donor-tier, OK), but also `src/app/dashboard/components/SponsorshipCard.tsx:62` (donor-tier, OK) and `src/app/dashboard/components/VertSponsorshipCard.tsx:63` (donor-tier, OK). |
| Severity     | MEDIUM-LOW — every use site I traced is donor-authenticated, so the field is allowed at that tier. But the *preference order* (district before region) inverts the privacy default. If this component is ever reused on an unauth surface (Phase 0 dashboard widgets etc.), it would inherit a leak. Flag for hardening. |

#### 🟠 R3 — Donor-side sponsorship lifecycle endpoints lack audit trail

| Aspect    | Evidence |
| --------- | -------- |
| Endpoints | All 8 `/api/sponsorship/[id]/*` routes — see C.2 table.                  |
| Risk      | A bad actor (or compromised donor account) can cancel, pause, modify amount, change visibility, cancel a queue slot — and no audit row records who/when/why. The sponsorship-row column timestamps catch some (cancelled_at, paused_at, modified_at) but lose attribution, reason, and intermediate state. |
| Severity  | MEDIUM. Privacy-adjacent (it's about reconstructibility, not exposure). Phase 0 is the right moment to add `recordAuditEvent` calls because the surface is already in scope. |

#### 🟡 R4 — `Admin` and `Administrator` treated identically; no Super Admin distinction

| Aspect   | Evidence                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Site     | `src/lib/admin-auth.ts:23` — `ADMIN_ROLE_NAMES = new Set(["Admin","Administrator"])`. Anyone holding either Directus role gets every admin route, including refund, suspend donor, archive child, currency-rate edit. |
| Severity | MEDIUM — privilege over-grant within the trusted admin pool. Real risk if production has both role names assigned to different humans with the assumption that one is "less powerful." `00-discovery.md` already flagged this; restating here because Phase 0 will fix it. |

#### 🟡 R5 — Raw `createItem("audit_log", …)` bypasses `redactAuditPayload`

| Aspect   | Evidence                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Site     | All 4 admin sponsorship action routes (cancel/pause/resume/refund) write audit via raw `createItem`, NOT through `recordAuditEvent`. The Tier-3 redaction map at `src/lib/di-audit.ts:238-241` (`AUDIT_REDACTED_FIELDS = { guardian_phone, guardian_phone_alt }`) is not applied. |
| Risk    | Currently benign — those four endpoints don't put Tier-3 fields into `diff` or `metadata`. But the divergence means a future contributor adding (say) a `guardian_phone` change-tracking field to an admin sponsorship action would silently leak it into audit_log unless they also remember to redact. |
| Severity | LOW today; LATENT MEDIUM. |

#### 🟢 R6 — No admin API route lacks an auth check

Audited via `find … -exec grep -L "requireAdminUser|getAdminSession"`.
Five `/api/admin/*` files come up as "missing literal":
- `login` / `logout` — intentional (login pre-auth; logout uses refresh token).
- `sponsorships/[id]/{pause,cancel,resume,refund}` — auth via
  `authedAdminSponsorship` (which calls `requireAdminUser` internally).
Hand-verified — no actual gap. Severity: NONE.

### E.3 URL / log / bundle leak surfaces

- `src/app/api/assets/[id]/route.ts` — child photo proxy. Accepts
  transform params (width/height/quality/format/fit/key). The `key`
  param maps to Directus storage presets, including the
  `intake-locked` preset that server-side blurs intake photos for
  non-sponsor viewers. **Properly gated server-side**, not via
  client-only CSS. (Session 52c note in the file header.)
- `/sponsor/[childId]` carries `childId` in the URL — fine, public
  ID with no PII leak.
- No grep hits for PII patterns (`guardian_phone`, `full_address`,
  `exact_birthdate`) in `console.log` / `console.error` paths
  outside the DI form draft handling.
- `directus_files` UUIDs are accepted via `/api/assets/[id]` with
  upstream auth via `DIRECTUS_SERVER_TOKEN` env var — the token
  never reaches the client.

### E.4 Single highest-severity finding

**R1** — `/children/[id]` shows `bd_district.name` to unauthenticated
viewers via `ProfileHero.tsx:139-145`, violating the Tier 1 privacy
contract that the rest of the codebase explicitly upholds. Surface is
the most-linked child page on the platform.

---

## Cross-cutting backfill / migration concerns affecting Phase 0

1. **`aid_delivery.sponsorship`** — column exists, nullable, sparsely
   populated. NOT NULL constraint requires backfill plan (admin
   triage). Read-only here; documented at A.1.
2. **`task.sponsorship`, `child_update.sponsorship`** — net new
   columns. Phase 0 should ship as nullable; tightening to NOT NULL
   would require either a backfill pass or a feature flag for new
   rows. Documented at A.2 and A.3.
3. **Audit gap on donor + webhook + extend/modify/visibility paths**
   — no schema change needed; only `recordAuditEvent` insertion.
   Phase 0 work scope: 8 donor route handlers + 1 webhook + 0 (no
   admin extend/modify/visibility endpoints exist today). Documented
   at C.2.
4. **`ADMIN_ROLE_NAMES` → tiered role check** — no DB/schema change.
   Single-file diff in `admin-auth.ts` plus new permission module.
   Documented at B.3.
5. **`R1` ProfileHero district leak** — no schema change. Two-file
   diff: `child-profile-data.ts` (strip `bd_district.*` from
   `PUBLIC_FIELDS` when tier is `public`, OR return `district: null`
   for tier=public) and a hardening note in `ProfileHero.tsx`.
   Documented at E.2.R1.

All five items are independent of each other — Phase 0 can sequence
them in any order without coupling.
