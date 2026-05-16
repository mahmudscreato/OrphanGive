# Session 49 — donor surface gap audit

**Status:** discovery only. No donor-side rendering code was changed
in Session 49. This document is the input for Session 50 (or the
first slice of it) — a focused donor-surface refactor.

**Author:** Session 49 brief, executed against the
`session-49-documents-and-donor-audit` branch (off `session-48b-…`
tip, not merged to main).

**Scope of the audit:**
1. Tier classification + current rendering for every new field added
   in Sessions 48a + 48b + 49.
2. Intake-photo donor rendering gap (Session 48b deferred this
   explicitly).
3. The "show only what's reviewed" pattern — where it's implemented,
   where it isn't, and a divergence to fix.
4. Field-by-field gap table.
5. Recommended Session 50 scope, plus a draft brief.

A note on terminology: "Tier 1 / 2 / 3" follows the Session 48a ship
report. Tier 1 = public, no auth required. Tier 2 = sponsor-after-
consent (revealed via the reveal-request flow that already exists in
`src/lib/reveal-data.ts`). Tier 3 = admin-only, never on any donor
surface.

---

## 1. Donor-surface inventory (today)

The donor-facing child profile lives at
`src/app/children/[id]/page.tsx`. It composes nine section
components from `src/components/profile/`:

| Section component | Reads | Status filter | Notes |
|---|---|---|---|
| `ProfileHero` | `display_name`, `age`, `bd_division.name`, `bd_district.name`, `class_grade`, `education_level` | child.status='active' | Renders raw `education_level` enum value when no friendly label exists (see gap §4). |
| `ChildSponsorBanner` | sponsorship + queue position | sponsorship.status active/queue | Unaffected by 48a/48b/49. |
| `StorySection` | `story` (truncated to 200 chars on Tier 1) | child.status='active' | Story trim works correctly. |
| `MomentsGallery` | `child_moment` rows | `status='published'` | "Show only what's reviewed" applied correctly. |
| `LockedFieldsBand` | `*_encrypted` columns + reveal flow | reveal-request approved | Reveal flow correctly gates Tier 2 fields. |
| `DocumentsBanner` | `child_document.type`, `.status` (LEGACY enum) | `status='verified'` | **Divergence to fix in Session 50** — see §3. |
| `UpdatesSection` | `child_update` rows | `status='published'` | Correct. |
| `EducationSection` | `education_level`, `class_grade`, `areas_of_interest` | n/a (renders if non-null) | Multiple gaps — see §4. |
| `SponsorCTA` | child id + tier | n/a | Unaffected. |
| `RelatedChildren` | random active children | child.status='active' | Unaffected. |

There is also a public listing page at `src/app/children/page.tsx`
backed by `src/lib/children-data.ts` which shows cards with name,
photo, age, region (division name only — never district), and
`education_level`. Same `education_level` raw-enum issue.

---

## 2. New-field gap table

Field-by-field. **"Renders today?"** is what the running code does;
**"Should render?"** is the intent per Mahmud's Session 48a ship
report + the Session 49 brief. **"Tier"** is the privacy
classification.

### Identity (Sessions 44 + 46-fix-2)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `display_name` | 1 | Yes (hero, list) | Yes | ✓ |
| `gender` | 1 | No | Optional — soft signal only | Low priority. Could add to hero meta if Mahmud wants. |
| `date_of_birth` | 2/3 | No (only year via `age`) | Year only on Tier 1; full DOB on Tier 2 reveal | ✓ Reveal flow exists, year derivation correct. |
| `photo` | 1 | Yes (hero) | Yes | ✓ |
| `photo_consent` | n/a | Hidden field, photo upload only flows through if true | Used as a gate, not rendered | ✓ |

### Location (Session 48a renamed; Session 48a added permanent_address)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `bd_division` (name) | 1 | Yes (hero "region") | Yes | ✓ |
| `bd_district` (name) | 1 | Yes (hero) | Yes | ✓ |
| `district_internal` | 3 | No | Never — admin-only free-text fallback | ✓ Confirm. |
| `permanent_address` | 3 | No | **Never on any donor surface** | ✓ Confirm — admin-only. |

### Education (Session 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `education_level` (enum) | 1 | Yes — but renders RAW enum value when not in old labels map | Yes, with a friendly label | **GAP**: `EducationSection` and `ProfileHero` both use a hardcoded `EDUCATION_LABELS` map (`primary`, `secondary`, `madrasa`, `vocational`) that pre-dates Session 48a's 10-value enum. New values like `primary_1_5`, `madrasa_dakhil`, `junior_secondary_6_8` render as raw slugs to donors. Fix: import `EDUCATION_LEVEL_OPTIONS` from `form-constants` and look up the label there. |
| `class_grade` | 1 | Yes (hero, education) | Yes | ✓ |
| `educational_organization` (school M2O) | 2 | No | Yes — sponsor reveal-approved view | **GAP**: never rendered on donor surface. Should appear in `EducationSection` for Tier 2 (post-reveal) viewers. |
| `school_name_raw` | 2 | No | Yes — fallback when no M2O linked | **GAP**: never rendered. Should appear as fallback in `EducationSection` when `educational_organization` is null. |
| `areas_of_interest` (text[]) | 1 | Yes (`EducationSection`) — but renders RAW slugs (`drawing_art`, `religious_studies`) | Yes, with friendly labels | **GAP**: same as `education_level` — `EducationSection` maps the array straight into pills using the slug as the label. Fix: import `AREA_OF_INTEREST_OPTIONS` from `form-constants` and use the `.label`. |

### Story / support (Sessions 44 + 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `story` | 1 (200 char preview) / 2 (full) | Yes | Yes | ✓ Truncation logic correct. |
| `support_type` | 1 | No | Optional — could show as eyebrow tag | Low priority. |
| `monthly_cost` | 1 | No | Yes — already shown in sponsor flow elsewhere | ✓ Sponsorship flow handles. |
| `priority_support` | 1 | No | **Maybe — small "Urgent" badge on hero when value=urgent** | **GAP**: not rendered. Worth a hero badge when value=`urgent`. Per brief "Tier 1 level only, should render as badge on public profile" — confirm with Mahmud. |
| `priority_notes` | 3 | No | **Never on any donor surface** | ✓ Confirm — admin-only. |

### Health (Sessions 44 + 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `blood_group` | 2 | No | Yes — sponsor view | **GAP**: never rendered. Could go in a Tier 2 "Health" section. |
| `vaccination_status` | 2 | No | Yes — sponsor view | **GAP**: never rendered. |
| `last_medical_checkup` | 3 | No | Never (date is identifying) | ✓ Confirm. |
| `disability_status` | 2 | No | Yes — sponsor view, value-aware (only show if not 'none') | **GAP**: never rendered. |
| `disability_notes` | 2 | No | Yes — sponsor view, conditional on `disability_status != 'none'` | **GAP**: never rendered. |

### Family (Sessions 44 + 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `parent_loss` | 2 | No | Yes — sponsor view (e.g. "Lost: father") | **GAP**: never rendered. Consider a "Family situation" Tier 2 sub-section. |
| `siblings_count` | 2 | No | Yes — soft context for sponsor | **GAP**: never rendered. |
| `sibling_position` | 2 | No | Yes — soft context | **GAP**: never rendered. |
| `siblings_notes` | 2 | No | Yes — soft context, free text | **GAP**: never rendered. |
| `household_size` | 2 | No | Yes — soft context | **GAP**: never rendered. |

### Socioeconomic (Session 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `household_income_source` | 2 | No | Yes — sponsor view, friendly label | **GAP**: never rendered. |
| `monthly_household_income_bdt` | 2/3 | No | **Maybe — admin only? sponsor reveal?** | Decision needed. Specific BDT amount feels closer to Tier 3. Recommend Tier 3 unless sponsor explicitly asks. |

### Guardian (Sessions 44 + 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `guardian_relationship` | 2 | No | Yes — sponsor view | **GAP**: never rendered. (`LockedFieldsBand` only handles encrypted full name + contact.) |
| `guardian_employment_type` | 3 | No | **Never** | ✓ Confirm — admin-only. (Free-text `guardian_employment` is similarly Tier 3.) |
| `guardian_employment` | 3 | No | Never | ✓ Confirm. |
| `guardian_phone` | 3 | No | **Never** | ✓ Confirm — admin-only PII. |
| `guardian_phone_alt` | 3 | No | **Never** | ✓ Confirm. |
| `guardian_summary_internal` | 3 | No | Never (the column name says it) | ✓ Confirm. |
| `additional_family_notes` | 3 | No | Never | ✓ Confirm. |

### Field visit / submission (Session 48a)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `submission_date` | 3 | No | **Never on any donor surface** | ✓ Confirm — admin-only timestamp. |
| `last_visit_date` | 3 | No | Never | ✓ Confirm — same as above (mirrored). |

### Intake photos (Session 48b)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `child_intake_photo` rows (status=approved) | 2 | No | **Yes — sponsor view** | **GAP — biggest single donor-surface miss.** See §3 below. |

### Documents (Session 49)

| Field | Tier | Renders today? | Should render? | Gap |
|---|---|---|---|---|
| `child_document.file` | 3 | No | **Never** — files are not donor content | ✓ Confirm. |
| `child_document.notes` | 3 | No | Never | ✓ Confirm. |
| `child_document.status` (verification badge only) | 1 | Yes — `DocumentsBanner` shows "X documents verified" pill | Yes — pill only, no file link | ✓ Pattern is correct, but the data path uses the LEGACY enum. See §3 divergence. |

---

## 3. The "show only what's reviewed" pattern — current shape and divergence

Mahmud's rule, restated:

> Missing documents do NOT block the profile from going live. The
> public profile shows only what's been reviewed and approved. If
> guardian NID is approved but birth certificate is pending, the
> public profile shows what's allowed; the missing pieces are absent
> from view but don't blank out the whole profile.

Generalised: each donor-facing section reads only rows whose status
indicates a positive admin decision. The status keyword differs by
collection — some say `published`, some say `verified`, some say
`approved`.

### Where the pattern is implemented today

| Collection | Status keyword | Where (file:line) | Correct? |
|---|---|---|---|
| `child` | `active` | `getChildById`, `src/lib/child-profile-data.ts:192` | ✓ |
| `child_moment` | `published` | `getChildMoments`, `src/lib/child-profile-data.ts:383` | ✓ |
| `child_update` | `published` | `getChildUpdates`, `src/lib/child-profile-data.ts:323` | ✓ |
| `child_document` | `verified` (LEGACY) | `getChildDocumentsStatus`, `src/lib/child-profile-data.ts:280`; consumed by `DocumentsBanner.tsx:28` | ⚠️ See divergence below |
| `child_intake_photo` | n/a | (not rendered yet) | n/a |

### The Session 49 divergence

Session 49's brief introduces a NEW `document_type` + status enum
(`pending`, `approved`, `rejected`, `archived`) that does NOT match
the legacy `child_document.type` enum (`BIRTH_CERTIFICATE`, etc.) or
the legacy status enum (`pending_review`, `verified`, `rejected`,
`replacement_requested`, `waived`).

Both vocabularies coexist on the same table after the Session 49
migration (which is purely additive — see
`migrations/session-49/001-documents.sql` header for the full story).
Concretely:

- **DI form (new code)** writes ONLY the new columns:
  `document_type='guardian_nid'`, `status='approved'`.
- **`DocumentsBanner` (legacy code, untouched in Session 49)** reads
  ONLY the legacy columns: `type='GUARDIAN_NID'`, `status='verified'`.

Result today: when a DI uploads a guardian NID via the new form and
admin "approves" it via the new status, the legacy `DocumentsBanner`
on the donor surface won't notice — it's still looking for
`status='verified'` on the legacy column. So the public profile won't
update its "X documents verified" count.

**Reconciliation options for Session 50 (recommended in §5):**

1. Update `getChildDocumentsStatus` to read EITHER the legacy OR the
   new column with EITHER positive status keyword. Map each row
   into a normalised `{type, label, status:'verified'|'pending'|'missing'}`
   shape. (Lowest-friction; works while data is split.)
2. Backfill: write a one-shot data migration that copies legacy
   `(type, status)` into `(document_type, status)` using a value-
   mapping table. Drop the legacy columns. Update the bootstrap
   script to remove them. (Cleanest end state; most work.)
3. The opposite direction: have the new DI form write ALSO to the
   legacy columns. (Worst — double-write to stale columns.)

Recommended: **option 1 for Session 50, then option 2 for a later
cleanup pass**.

### Pattern visible at the two reference URLs

> http://localhost:3000/children/f6c4c677-46d0-4fd7-b08e-3ba6216245b6
> http://localhost:3000/children/da9a8c24-38d1-40fa-95f3-20edc878f1ff

I can't actually load these URLs in this run (no live Directus/dev
server), but the rendering code path is the same for both. What
each renders depends entirely on:

1. Whether the `child` row has `status='active'` (otherwise 404)
2. How many `child_moment` rows have `status='published'`
3. How many `child_update` rows have `status='published'`
4. How many `child_document` rows have `status='verified'`
   (LEGACY column)

Differences between the two profiles will be entirely a function of
how many published moments, updates, and verified-legacy docs each
has. The pattern itself is consistent.

---

## 4. The "raw enum slug" rendering bugs (Session 48a regression)

Independent of the other gaps, two existing components render Session
48a's new enum values as raw slugs to donors:

### `src/components/profile/EducationSection.tsx:11–12`

```typescript
const EDUCATION_LABELS: Record<string, string> = {
  primary: "Primary school",
  secondary: "Secondary school",
  madrasa: "Madrasa",
  vocational: "Vocational training",
};
const eduLabel = child.education_level
  ? EDUCATION_LABELS[child.education_level.toLowerCase()] ?? child.education_level
  : null;
```

Session 48a replaced the free-text `education_level` with the enum
`['not_enrolled', 'primary_1_5', 'junior_secondary_6_8', 'secondary_9_10', 'higher_secondary_11_12', 'madrasa_ibtidayee', 'madrasa_dakhil', 'madrasa_alim', 'vocational', 'other']`.

`vocational` matches the old map by accident; `madrasa_dakhil`,
`primary_1_5`, etc. fall through to the fallback `?? child.education_level`
and render literally as `madrasa_dakhil` and `primary_1_5` to donors.

**Fix:** import `EDUCATION_LEVEL_OPTIONS` from `@/lib/form-constants`
and look up `.find(o => o.value === child.education_level)?.label`.

Also at `src/components/profile/ProfileHero.tsx:46–48`:

```typescript
const educationLine = child.class_grade
  ? `Class ${child.class_grade}, ${child.education_level ?? "school"}`
  : child.education_level
    ? `${child.education_level} education`
    : null;
```

Renders `Class 5, primary_1_5` to donors today. Same fix.

### `src/components/profile/EducationSection.tsx:46–53`

```typescript
{child.areas_of_interest.map((interest) => (
  <span key={interest} ...>
    {interest}
  </span>
))}
```

Renders `studies`, `drawing_art`, `religious_studies`,
`writing_poetry`, etc. as raw slugs in the interest tags.

**Fix:** import `AREA_OF_INTEREST_OPTIONS` from `@/lib/form-constants`
and look up the label.

These two fixes are roughly five lines of code total but high-value:
they're regressions visible to every donor today.

---

## 5. Recommended Session 50 scope

Two natural shapes. My recommendation: **split into Session 50 + 51**
because the rendering work is meaningfully bigger than the
data-layer work, and they have different review needs.

### Session 50 — donor data layer + tier classification (smaller, lower risk)

Goal: a single source of truth for "what does this tier see" and
fixes for the regressions visible today.

Scope:

1. **Fix the two raw-enum rendering bugs in §4** (EducationSection,
   ProfileHero). Self-contained, ~10 lines.
2. **Reconcile the documents enum divergence** (option 1 from §3 —
   normalize `getChildDocumentsStatus` to accept either column shape).
3. **Extend `ChildProfile` shape in `src/lib/child-profile-data.ts`**
   to include the Tier 1 + Tier 2 fields catalogued in §2 that
   should render but aren't fetched. Add `priority_support` (Tier 1),
   `educational_organization`, `school_name_raw`, `parent_loss`,
   `siblings_*`, `household_size`, `household_income_source`,
   `disability_status`, `disability_notes`, `blood_group`,
   `vaccination_status`, `guardian_relationship` (all Tier 2).
4. **Move all enum-to-label lookups into form-constants helpers**
   (e.g. `labelForEducationLevel(value)` etc.) so both donor-side
   and DI-side share the source of truth.

Out of scope: any new UI sections.

### Session 51 — donor profile page rebuild (larger, design-driven)

Goal: render the new fields using the full donor surface design
language.

Scope:

1. New "Family" Tier 2 section: `parent_loss`, `siblings_*`,
   `household_size`, `guardian_relationship`. Reveal-gated.
2. New "Health" Tier 2 section: `blood_group`, `vaccination_status`,
   `disability_status` + conditional `disability_notes`.
3. New "Household" Tier 2 section: `household_income_source` (label
   only, no BDT amount).
4. Extend `EducationSection` to render `educational_organization`
   (school name) with `school_name_raw` fallback.
5. Add an `IntakePhotosGallery` component for the sponsor-view of
   intake photos (status=approved only). Visually separated from
   `MomentsGallery` — intake photos are "first impression / context",
   moments are "ongoing life updates". Gate by sponsorship status,
   not just login.
6. Optional: small "Urgent" hero badge when `priority_support='urgent'`.

This split keeps Session 50 pure plumbing (low review burden) and
Session 51 pure UX (high review burden, design conversations needed).

### Draft Session 50 brief

```markdown
# Session 50 — Donor data layer reconciliation + display bug fixes

Stacked on session-49-documents-and-donor-audit. Goals:

1. Fix two raw-enum-slug regressions visible to donors today
   (EducationSection + ProfileHero).
2. Reconcile child_document dual-enum divergence introduced in
   Session 49 — normalize getChildDocumentsStatus.
3. Extend ChildProfile shape with the Tier 1 + Tier 2 new fields
   from Sessions 48a + 48b + 49 (data-layer only — no rendering).
4. Move all enum-to-label lookups to form-constants helpers shared
   by DI + donor sides.

Explicitly out of scope: any new donor-facing sections or
sponsor-only Tier 2 rendering. Those come in Session 51 once the
data layer is solid.

Apply: extend src/lib/child-profile-data.ts shape, add helper
functions to src/lib/form-constants.ts, update DocumentsBanner +
EducationSection + ProfileHero to use the helpers. No schema
migration. No Directus changes.

Self-audit:
- [ ] /children/{id} shows "Class 5, primary school" not "Class 5, primary_1_5"
- [ ] Interest tags show "Drawing / art" not "drawing_art"
- [ ] DocumentsBanner verifies count is correct against EITHER legacy
  OR new status column
- [ ] No donor-side rendering changes beyond the bug fixes
```

---

## 6. Open questions for Mahmud

1. **`priority_support` Tier 1 badge** — the brief says "Tier 1 level
   only, should render as badge on public profile?" with a question
   mark. Confirm: yes show "Urgent" badge on hero when value=urgent,
   or leave it admin-only?
2. **`monthly_household_income_bdt`** — is the specific BDT value
   sponsor-relevant (Tier 2) or admin-only (Tier 3)? Recommend Tier 3.
3. **Intake photos sponsor view** — visually separated from moments,
   or interleaved? My read of the Session 48b ship report leans
   "separated" (intake = first impression, moments = ongoing).
4. **Document enum reconciliation timeline** — option 1 (compatibility
   layer) ship-soon, then option 2 (backfill + drop legacy) when
   admin dashboard ships? Or do them together in Session 50?
