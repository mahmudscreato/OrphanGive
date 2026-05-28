# Pre-launch safety fix plan

**Authored:** 2026-05-28.
**Method:** every external-audit claim was re-checked against the actual code
on `main`. The summary below is verdicts; phase plan is the deliverable.
**Scope lock:** safeguarding + privacy + tier enforcement + asset gating first.
Everything else later, in safety order.
**Deadline trigger:** the P1 fixes must ship + verify **before the first real
child profile is uploaded**, not before public launch. Current public data is
demo and will be wiped (see P1.0).

---

## 1. Audit verification table

Each row is **what the audit claimed → what the code actually does → real
severity**. The "Refuted" rows are important: they save us work.

| # | Audit claim | Code reality (file:line) | Verdict | Severity |
|---|---|---|---|---|
| A | `/children/[id]` is indexable; sitemap exposes child URLs | `src/app/children/[id]/page.tsx:107-111` calls `buildPageMetadata(...)` with no `robots` override; `src/lib/page-metadata.ts:81-111` doesn't set one either. `src/app/robots.ts:21-38` Disallow list includes `/dashboard/`, `/admin/`, `/di/`, `/sponsor/`, but NOT `/children`. `src/app/sitemap.ts:33-49, 92-97` enumerates every `status='active'` child as `/children/{id}` at priority 0.8. | **Confirmed** | High |
| B | Full legal names leak via Tier-1 | The field rendered everywhere public is `display_name` — `FeaturedChildren.tsx:72-75, 188`, `BrowseChildCard.tsx:51-54, 187, 259`, `ProfileHero.tsx:128-130`, `app/children/[id]/page.tsx:100-104` (OG title). No first-name extraction at data layer; `display_name` is whatever the DI typed. | **Nuanced** — only as risky as the data | High |
| C | Server returns full record; UI hides | **Refuted.** `src/lib/child-profile-data.ts:119-171, 286-292` builds the Directus `fields:` projection by tier: `PUBLIC_FIELDS`, then `TIER2_FIELDS` only when `tier !== "public"`, then `ENCRYPTED_FIELDS` only when `tier === "admin"`. Non-public fields are literally not fetched. `children-data.ts:265-276` SAFE_FIELDS excludes `bd_district`, `school`, `guardian_*`. No public `/api/children/*` route exists. | **Refuted** | Informational |
| D | Public filters enable narrowing | `/children` page passes `<ChildrenFilterBar />` unauthenticated; filters available are division (8 buckets), age band (4 buckets), sponsorship status. District/gender/education filters intentionally NOT exposed (see `children-data.ts:18-23` comment). | **Nuanced** — bounded enough | Low |
| E | Sponsorship status & donor name shown publicly | Confirmed: `BrowseChildCard.tsx:224-237` shows "Sponsored monthly / Queue full" pills publicly. `ChildSponsorBanner.tsx:78-117, 121-136` renders sponsor first-name publicly via `NameOrAnon` unless donor's `visibility='anonymous'`. `ProfileHero.tsx:93-95, 127` hardcodes "Awaiting sponsorship" regardless of state (rendering bug — not privacy). | **Confirmed** | Medium |
| F | `/api/assets/[id]` open + no EXIF strip | `src/app/api/assets/[id]/route.ts:21-37` has no auth check; proxies to Directus with the server token. UUIDs are not enumerable, but anyone with a UUID (which appears in `<img src>` HTML) can fetch the raw bytes. `src/lib/di-photos.ts:114-183` upload helper forwards `File` to Directus with no `sharp`/`exiftool`/`withMetadata(false)`. Phone-shot photos retain EXIF GPS. | **Confirmed** | High |
| G | Stripe webhook needs signature + idempotency + server-authoritative status | **Refuted.** `src/app/api/webhooks/stripe/route.ts:884-917` does `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; lines 919-922 + 1003 implement `isStripeEventProcessed` / `markStripeEventProcessed` dedup; status writes are exclusively server-side from Stripe events. | **Refuted** | Informational |
| H | IDOR + missing role gates + reveal expiry/revoke/audit missing | Donor IDOR: refuted — `dashboard/sponsorship/[id]/page.tsx:54-62` uses `getSponsorshipForDonor(id, donor.id)`; helper at `sponsorship-data.ts:493-514` enforces `row.donor === donorId`. Admin/DI gates: confirmed present on spot-checks. Reveal 90-day expiry: present via `src/app/api/cron/expire-reveals/route.ts:42-72`. **Missing:** revoke on sponsorship cancel; reveal grant/withdraw audit-log entries. | **Mostly refuted; 2 gaps** | Medium |
| I | Homepage counters showing 0/0/0 | `src/lib/homepage-data.ts:113-253` queries are correct. 0/0/0 means there are literally zero `status='active'` children in the DB right now — a data state, not a code bug. | **Refuted** | Informational |
| J | `/transparency /about /stories /for-charities` broken | All four render fine. `/transparency` has explicit `TODO-ALLOCATION` placeholder copy (lines 1-23 of the file say so). None throw, none 500. | **Refuted** | Informational |
| K | Directus CMS rows can replace legal copy | Confirmed. `src/lib/site-page.ts:44-91` `getSitePage(slug)` is called by `/privacy /terms /safeguarding /cookies /refund` — when a `site_page` row with `status='published'` has non-empty `content`, it replaces the counsel-reviewed hardcoded copy entirely. Gating is purely the Directus collection's write permissions. | **Confirmed** | Medium-High |
| L.1 | Data-residency contradiction (EU/Lithuania/Singapore) | No claim is made on any public surface. "Lithuania" / "Singapore" appear only in `src/lib/countries.ts:131,192` (billing-address dropdown). "EU" appears once at `src/app/privacy/page.tsx:339` ("EU GDPR" — a regulation reference). | **Refuted** (omission, not contradiction) | Informational |
| L.2 | Multiple contact emails | Confirmed inconsistency: `support@orphangive.org` is the canonical inbox (contact page, FAQ, legal pages, /api/contact, login reset prompts). `hello@orphangive.org` still appears in `error.tsx`, `global-error.tsx`, `dashboard/profile/ProfileSections.tsx:218, 618, 621`. `SiteNav.tsx:12-14` comment notes hello@ is "no longer the canonical inbox". | **Confirmed** | Low |
| L.3 | "Platform" wording on public surfaces | Lot 4 swept this; one user-visible occurrence remains: `src/app/for-charities/page.tsx:78` "Your team learns the platform". Three other comments say "never platform" but the body copy was missed. | **Confirmed** | Informational |
| L.4 | Fee transparency missing | `/transparency` mentions "payment processing fees" only inside the draft 85/10/5 allocation row (annotated `TBD-ALLOCATION`). No "100% goes to children" claim exists to contradict. | **Nuanced — omission** | Low |

---

## 2. Top must-fix-before-real-upload list

In strict priority order. None of these are theoretical — they're code-confirmed.

1. **EXIF GPS strip on every child photo upload** (F). A phone-shot guardian-consented photo today carries GPS lat/long, which the open asset proxy will serve. Real children = real homes. Fix at upload (`src/lib/di-photos.ts`) — strip before the Directus PUT.
2. **Noindex + sitemap-exclude every child profile route** (A). Real names + photos + division of a real child reaching Google's index is the irreversible failure mode. Fix in `src/lib/page-metadata.ts` (add per-route robots override), `src/app/robots.ts` (disallow `/children/`), and `src/app/sitemap.ts` (drop the child enumeration block).
3. **`display_name` policy enforcement at the DI intake form** (B). Make the field's max length the only thing that matters; add helper copy "First name only — do not enter a surname"; add a server-side validator that rejects entries with >1 space or with surname-like tokens. Even better: keep `display_name` for internal use, render `first_name` (new) publicly. **Founder decision needed** (see §4).
4. **Restrict Directus `site_page` write access** (K). Out-of-codebase Directus ops task. Document who currently has write access on `site_page` and either (a) remove write access from non-counsel roles, or (b) require a counsel + admin two-key handshake before flipping `status='published'`. Belt-and-braces in code: add a runtime warning when `getSitePage` returns content for a legal slug. Or: kill the CMS-override path entirely for `/privacy`, `/terms`, `/safeguarding` (the audit-sensitive ones).
5. **Asset proxy gating decision** (F second leg). Even with EXIF stripped, the proxy serves any UUID without a check. **Founder decision needed** (see §4) — keep open (with EXIF strip making it safe), or gate by tier (logged-out gets approved-only intake + main `Photo`; logged-in gets the donor-tier surface).
6. **Wipe all demo/test child data** (P1.0). Before real DI uploads, all current `child` / `child_intake_photo` / `child_update` / `child_moment` / `aid_delivery` / `child_proposal` / `child_document` / `child_reveal` rows must be deleted, and Directus file storage rows orphaned by deletion must be cleaned. Verify by re-running the homepage stats query → expect `0` listed.

Everything past item 6 in this list lives in the phased plan below.

---

## 3. Phased plan

Each phase is "deployable lot" sized (~40–50 minutes). Inside each lot, tasks
that touch money / auth / privacy are flagged `BLAST: ISOLATED` and must be
deployed alone with its own verification step. Tasks marked `BLAST: SAFE_TO_BATCH`
can be combined within a phase.

### P1 — Child safeguarding, before first real upload

> **All P1 lots must be merged + deployed + verified on demo data before
> P1.0 (the data wipe). Real uploads happen AFTER P1.0.**

#### P1.1 — Noindex + sitemap-exclude child profile routes

**Files:**
- `src/app/children/page.tsx:45-50` — add `robots: { index: false, follow: false }` to the metadata. The browse page lists named children; do not let it be indexed.
- `src/app/children/[id]/page.tsx:107-111` — add `robots: { index: false, follow: false }` to the returned metadata.
- `src/lib/page-metadata.ts:81-111` — extend `BuildPageMetadataArgs` with an optional `noindex?: boolean`; when true, set `robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }`.
- `src/app/robots.ts:21-38` — add `"/children"` and `"/children/"` to the disallow array (the auto-allowed `/` blanket no longer covers them).
- `src/app/sitemap.ts:33-49, 92-97` — delete the entire `getActiveChildren()` block; sitemap should NOT list any child URLs.

**Expected behaviour:**
- `GET https://orphangive.org/children` returns `<meta name="robots" content="noindex, nofollow">`.
- `GET https://orphangive.org/children/<uuid>` returns the same.
- `GET https://orphangive.org/robots.txt` shows `Disallow: /children` and `Disallow: /children/`.
- `GET https://orphangive.org/sitemap.xml` does NOT contain any `<loc>https://orphangive.org/children/...</loc>` entries.

**Test cases (curl):**
```bash
curl -sI https://orphangive.org/robots.txt | head -1   # 200
curl -s  https://orphangive.org/robots.txt | grep -E "Disallow: /children"
curl -s  https://orphangive.org/sitemap.xml | grep -c '<loc>.*\/children\/' # expect 0
curl -s  https://orphangive.org/children | grep -i 'name="robots"'
curl -s  https://orphangive.org/children/<seed-child-uuid> | grep -i 'name="robots"'
```

**Acceptance criteria:**
- Google Search Console "Inspect URL" on a child profile reports "Indexing not allowed — noindex tag detected".
- The sitemap contains zero child URLs.

**Blast radius:** `BLAST: SAFE_TO_BATCH`. Pure metadata + sitemap output; no data, no auth, no money.

**Dependencies:** None.

**Lot size:** ~30 min including verification.

---

#### P1.2 — EXIF strip on every photo upload (DI + admin)

**Files:**
- `src/lib/di-photos.ts:114-183` — wrap the binary before the Directus PUT in a `sharp(buffer).rotate().withMetadata({}).toBuffer()` pipeline (or equivalent). Rotate to honour EXIF orientation BEFORE stripping it, otherwise portrait phone photos serve sideways.
- `src/app/api/di/uploads/photo/route.ts` (the wrapper that calls `uploadPhotoForDi`) — same pipeline, before passing to `uploadPhotoForDi`. Verify whether the strip happens in the lib or the route; do it once at the lowest layer.
- Find and patch any admin upload path (`grep -rn "uploadPhoto\\|directus.*files.*POST\\|formData.append" src/`) so admin direct-uploads also go through the strip.
- `package.json` — add `sharp` if not already present (`grep -n "sharp" package.json`).

**Expected behaviour:** Every byte that lands in Directus file storage has its EXIF/IPTC/XMP/GPS chunks removed. Verify by `exiftool` on the file after re-upload.

**Test cases:**
1. Take a phone photo with location enabled; verify `exiftool original.jpg | grep -i gps` shows GPS coords.
2. Upload via DI intake photo upload.
3. Download the same file from `/api/assets/<uuid>` after upload.
4. Run `exiftool downloaded.jpg` — expect **no GPS, no Make, no Model, no DateTime, no Software tags**.
5. Confirm the image still displays correctly and is orientation-correct.

**Acceptance criteria:** No `GPS*` tags, no `Make`, no `Model`, no `DateTimeOriginal` in any file fetched from `/api/assets/`. Re-test specifically against an iPhone HEIC source.

**Blast radius:** `BLAST: ISOLATED`. Touches upload pipeline. Deploy alone, verify with the test photo above, then proceed to P1.3.

**Dependencies:** None.

**Lot size:** ~45 min including the exiftool round-trip verification.

---

#### P1.3 — Tighten display_name at the DI intake form

**Files:**
- `src/components/di/ChildProfileForm.tsx` (or wherever the DI intake form lives — `grep -rn "display_name" src/components/di/`):
  - Add helper text under the field: "**First name only.** Do not enter a surname, second name, or family name. This is what donors will see publicly."
  - Add client-side validation: trim, then reject if any of: more than one whitespace-delimited word AND the second word starts with a capital (heuristic for surname), OR length > 30, OR contains digits.
- Server-side validator at `src/app/api/di/...` (the proposal/draft submit route) — mirror the same check; reject `invalid_input { field: "display_name", message: "..." }`.
- (Optional, founder-deciding) introduce a separate `first_name` column on `child` and source all PUBLIC renders from `first_name` while keeping `display_name` for internal use. **See §4 D1.**

**Expected behaviour:** A DI cannot submit a profile where `display_name = "Rahima Khatun"` — the form rejects it with the helper text. Server reinforces the same rule.

**Test cases:**
1. DI enters "Rahima" → submits → accepted.
2. DI enters "Rahima Khatun" → submits → client error: "First name only. Drop the second word."
3. Bypass client (curl the API directly with "Rahima Khatun") → 400 invalid_input { field: "display_name" }.
4. DI enters "Rahima123" → rejected (digit check).
5. DI enters 35-char string → rejected (length).

**Acceptance criteria:**
- All 5 test cases pass.
- Existing rows with multi-word `display_name` (demo data) are flagged on the admin dashboard for cleanup (separate task — see P1.4).

**Blast radius:** `BLAST: ISOLATED` (data quality + privacy floor). Deploy alone.

**Dependencies:** None.

**Lot size:** ~45 min.

---

#### P1.4 — Sponsor-side public visibility hardening

**Files:**
- `src/components/profile/ProfileHero.tsx:93-95, 127` — fix the "Awaiting sponsorship" hardcoded pill. It currently renders regardless of actual state. Decision: either remove the pill entirely from the PUBLIC view (Tier-1 doesn't need to see availability for the safeguarding model), or make it accurate.
- `src/components/children/BrowseChildCard.tsx:224-237` — same question for the browse card's "Sponsored monthly / Queue full" pills. **Founder decision needed** — see §4 D2: keep public availability indicator, or hide it from logged-out viewers?
- `src/components/children/ChildSponsorBanner.tsx:78-117, 121-136` — donor first-name display via `NameOrAnon`. **Founder decision needed** — see §4 D3: default donor `visibility` to `anonymous` (donor must opt-in to show name) vs current default (whatever it is). Verify current default at `src/lib/sponsorship-data.ts` (search for the default `visibility` value).

**Expected behaviour:** depends on founder decisions, but the testable assertion is: with the chosen default for donor visibility, a freshly-signed-up donor's first-time sponsorship does NOT leak their first name on the public profile until they opt in.

**Test cases:** wait for decisions D2 + D3.

**Blast radius:** `BLAST: ISOLATED`. Donor-facing privacy default change has downstream effects on existing donor `visibility` rows (whether to migrate).

**Dependencies:** Founder decisions D2 + D3.

**Lot size:** ~45 min after decisions.

---

#### P1.5 — Asset proxy gating

**Files:**
- `src/app/api/assets/[id]/route.ts:21-37` — add a check that the requested `id` is referenced by an active, donor-visible context (a `child.Photo` of a `status='active'` child, or an `approved` `child_intake_photo`). Reject if the UUID belongs to a pending/rejected/archived asset OR to admin/DI evidence files.
- Alternative (`BLAST: ISOLATED`, **founder decision** D4): keep the proxy open since EXIF is now stripped (P1.2), accept that any leaked HTML `<img src>` UUID is fetchable. Faster, less code.

**Expected behaviour:** `GET /api/assets/<uuid-of-pending-intake-photo>` returns 404, not the bytes.

**Test cases:**
1. Create a pending intake photo → fetch its UUID from Directus → `curl /api/assets/<uuid>` → expect 404.
2. Approve the photo → re-fetch → expect 200.

**Blast radius:** `BLAST: ISOLATED`. Could break legitimate image references if the gate query is wrong; ship with a feature-flag fallback that logs blocked requests for 24h before enforcing.

**Dependencies:** P1.2 (EXIF strip) shipped first; then P1.5 is the second leg of asset hardening.

**Lot size:** ~45 min if we go with the gate; ~5 min decision if we go open.

---

#### P1.6 — Privacy floor: lock down what the homepage stats query touches

**Files:**
- `src/lib/homepage-data.ts:113-253` — sanity-check that the queries don't accidentally include any name/photo data in the response (they shouldn't — they only count — but verify).

**Expected behaviour:** unchanged. This is a paranoia pass, not a fix.

**Test cases:** Network-tab the homepage; confirm `/_next/data/.../page.json` doesn't include child arrays.

**Blast radius:** `BLAST: SAFE_TO_BATCH`. Verify-only; no code change expected.

**Lot size:** 15 min.

---

#### P1.0 — Demo data wipe (founder gate)

**Trigger:** founder runs this AFTER P1.1–P1.5 are merged + deployed + verified.

**Actions (Directus admin, NOT in this repo):**
1. `DELETE FROM child_reveal;`
2. `DELETE FROM child_proposal;`
3. `DELETE FROM child_intake_photo;`
4. `DELETE FROM child_document;`
5. `DELETE FROM child_update;`
6. `DELETE FROM child_moment;`
7. `DELETE FROM aid_delivery;`
8. `DELETE FROM child;` (or set `status='archived'` for forensic preservation)
9. `DELETE FROM directus_files WHERE id IN (orphaned photo uuids);`
10. Re-run homepage: confirm `listed=0, sponsored=0, waiting=0`.
11. Re-run sitemap: confirm zero child URLs.
12. Confirm Google Search Console has not indexed any demo child URL (one-time check + manual de-index request for any that slipped through pre-fix).

**Verification:** after this, the system has no child data. P1 phase is complete only when this gate has fired AND the four asserts above pass.

---

### P2 — Auth / permission / IDOR / money flow verification

These are post-P1 because the audit's findings here were mostly refuted. The
remaining gaps are around the reveal lifecycle.

#### P2.1 — Revoke reveals on sponsorship cancellation

**Files:**
- `src/lib/reveal-data.ts` — add `revokeRevealsForCancelledSponsorship(sponsorshipId)` helper that flips every `child_reveal` with `sponsorship={sponsorshipId} AND status='approved'` to `status='revoked'` with `revoked_at=now()` and a system-generated note `revoked_reason='sponsorship_cancelled'`.
- `src/app/api/admin/sponsorships/[id]/cancel/route.ts` — call the helper after a successful cancel.
- `src/app/api/webhooks/stripe/route.ts` — call the helper when the webhook transitions a subscription to cancelled (find `status: "cancelled"` write sites).
- Donor-side cancel surface (search for `/api/sponsorships/.*/cancel` in `src/app/api/`) — call there too.

**Expected behaviour:** the moment a sponsorship moves to `cancelled` (admin, donor, or webhook origin), any active reveals attached to it are revoked the same transaction. Donor loses access to Tier-3 fields immediately.

**Test cases:**
1. Create test reveal `approved` on a sponsorship.
2. Cancel the sponsorship (admin).
3. Query `child_reveal` — expect `status='revoked'`.
4. Donor re-fetches `/children/[id]` — Tier-3 fields no longer in payload.
5. Repeat for donor-initiated cancel.
6. Repeat by simulating a Stripe `customer.subscription.deleted` event.

**Acceptance criteria:** all 6 cases revoke. No race with `expire-reveals` cron.

**Blast radius:** `BLAST: ISOLATED`. Touches donor-visible privacy state. Deploy alone.

**Dependencies:** none.

**Lot size:** ~45 min.

---

#### P2.2 — Audit-log every reveal grant + withdraw

**Files:**
- `src/lib/reveal-data.ts:301-335` (`withdrawRevealRequest`) — add `await recordAuditEvent({ action: "donor_withdrew_reveal", actorRole: "donor", recordId: revealId, metadata: { childId } })`.
- The reveal approve/reject route (search `/api/admin/.*reveal` or `/api/.*reveal/decide`) — same audit, action `admin_approved_reveal` / `admin_rejected_reveal`.
- The reveal request route (donor-initiated) — `donor_requested_reveal`.
- `src/lib/audit-labels.ts` — add the four new audit-action enum values + labels.

**Expected behaviour:** every reveal lifecycle event has a row in `audit_event`.

**Test cases:**
1. Donor requests a reveal → query audit_event → expect a `donor_requested_reveal` row with the donor and child IDs.
2. Admin approves → expect a second row.
3. Donor withdraws while pending → expect a third row.

**Acceptance criteria:** 3/3 pass; the `/admin/audit` viewer shows the new events.

**Blast radius:** `BLAST: SAFE_TO_BATCH`. Audit-only writes; can't break a flow.

**Dependencies:** none.

**Lot size:** ~30 min.

---

#### P2.3 — Spot-check audit of remaining `/api/admin/*` and `/api/di/*` routes for role gates

**Files:** every route file under `src/app/api/admin/` and `src/app/api/di/`. Verify each starts with `requireAdminUser()` / `requireDiUser()` (or equivalent).

**Method:**
```bash
for f in $(find src/app/api/admin src/app/api/di -name 'route.ts'); do
  head -50 "$f" | grep -E "requireAdminUser|requireDiUser|getDirectusSession" -q || echo "UNGATED: $f"
done
```

**Expected behaviour:** zero "UNGATED" lines.

**Blast radius:** `BLAST: SAFE_TO_BATCH`. Read-only audit; any failure becomes its own ISOLATED fix lot.

**Dependencies:** none.

**Lot size:** ~30 min audit + variable per-route fix.

---

#### P2.4 — Stripe webhook reverification (no code change expected)

**Files:** `src/app/api/webhooks/stripe/route.ts:884-1006`.

**Method:** confirm by reading + by sending a malformed-signature test event against the deployed endpoint.

**Test cases:**
1. `curl -X POST https://orphangive.org/api/webhooks/stripe -H "stripe-signature: bogus" -d '{"id":"evt_test"}'` → expect 400 "Invalid signature".
2. Resend the same valid event twice via Stripe CLI → second one returns `{received:true, dedup:true}`.

**Blast radius:** `BLAST: SAFE_TO_BATCH` (verification only).

**Dependencies:** Stripe CLI access against prod-like env.

**Lot size:** ~20 min.

---

### P3 — Trust / policy / fee-transparency / broken pages / Directus override cleanup

#### P3.1 — Kill (or gate) the CMS override on legal pages

**Decision A (recommended, safer):** disable the CMS override on the audit-sensitive slugs `privacy`, `terms`, `safeguarding`. Change the page render to ignore any `site_page` row for those slugs.

**Decision B:** keep CMS overrides for those slugs but lock the Directus `site_page` write permission to a counsel-only role. Code change minimal; Directus permissions change in admin UI.

**Files (Decision A):**
- `src/app/privacy/page.tsx:32-45` — remove the `if (page?.content) return <SitePageRenderer />` short-circuit, always render `<LegalPageLayout>`. Same for `/terms`, `/safeguarding`.
- Keep CMS path for `/cookies` and `/refund` (lower legal risk).

**Test cases:**
1. Write a bogus `<script>alert</script>` content to `site_page` slug=privacy → load `/privacy` → expect hardcoded content, not the bogus content.
2. Repeat for `/terms`, `/safeguarding`.

**Blast radius:** `BLAST: ISOLATED` (legal copy). **Founder decision needed** — see §4 D5.

**Dependencies:** D5.

**Lot size:** ~30 min once D5 decided.

---

#### P3.2 — `/transparency` allocation copy finalization

**Files:** `src/app/transparency/page.tsx:1-23` lists TODO markers; lines 109-208 contain the 85/10/5 split copy annotated as draft.

**Action:** either (a) finance signs off on the 85/10/5 numbers and we remove the TODO markers, or (b) the allocation section is replaced with "to be confirmed" copy until finance has the data.

**Founder decision needed** — see §4 D6.

**Blast radius:** `BLAST: SAFE_TO_BATCH` once decided.

**Lot size:** ~30 min.

---

#### P3.3 — Consolidate "support@" / "hello@" to a single inbox

**Files (replace `hello@orphangive.org` with `support@orphangive.org`):**
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/dashboard/profile/ProfileSections.tsx:218, 618, 621`

**Test cases:** grep -rn "hello@" src/ → expect zero matches afterward (except in comments noting the historical alias).

**Blast radius:** `BLAST: SAFE_TO_BATCH`.

**Lot size:** ~15 min.

---

#### P3.4 — "Platform" sweep cleanup

**Files:** `src/app/for-charities/page.tsx:78` — change "Your team learns the **platform**" to "Your team learns the service" (Lot 4 missed this).

**Blast radius:** `BLAST: SAFE_TO_BATCH`.

**Lot size:** ~5 min.

---

#### P3.5 — Add fee transparency to /privacy + /transparency

**Files:**
- `src/app/transparency/page.tsx` — once D6 resolved, add a "Stripe processing fees" line to the allocation explanation.
- `src/app/privacy/page.tsx` — under "How we use it", add a clause stating Stripe processes payments and their fee is deducted before allocation.

**Founder decision needed** — D6.

**Lot size:** ~20 min once decided.

---

### P4 — Contact / reach-out form (Directus-backed)

#### P4.1 — Wire `/contact` form submissions to a Directus `contact_submission` collection

**Files:**
- `src/app/api/contact/route.ts` — confirm what it does today (currently emails support@? writes to Directus?). Read first.
- New Directus collection if missing: `contact_submission(id, name, email, subject, message, status, source, date_created)`.
- `/contact` form page — verify it posts to `/api/contact` and writes the submission.

**Test cases:**
1. Submit a contact form anonymously → expect Directus row created.
2. Logged-in donor submits → expect `donor` FK attached.

**Blast radius:** `BLAST: ISOLATED` (new write path, even if minor).

**Dependencies:** Directus collection migration.

**Lot size:** ~45 min including migration.

---

### P5 — UX / a11y / copy MEDIUM-LOW

These are catch-alls. Each is a SAFE_TO_BATCH micro-task; batch them in two
deployable groups of ~5 items each.

#### P5.1 — Public UX polish lot (batch)

- ProfileHero "Awaiting sponsorship" hardcoded pill (E) — make it state-driven or remove.
- Footer attribution kept as Lot 4 ("Reg. iv-98/2021, Bangladesh") — already done; verify.
- Donate page already noindexed (Lot 4) — verify.
- Donor-side `dashboard/sponsorship/[id]/page.tsx` — confirm donor_text fallback to content is the rendered behaviour (Lot 2 + Lot 3 verified during integration).
- Confirm DI home "Needs your attention" section shows correction-requested reports (Lot 3 verified).

**Lot size:** ~30 min.

---

#### P5.2 — A11y micro-pass

- Run axe on `/`, `/children`, `/children/[id]`, `/donate`, `/about`, `/transparency`, `/privacy`. Fix the cheap wins (alt text, ARIA labels, heading order). Flag structural issues as P6.

**Lot size:** ~45 min.

---

## 4. Open founder decisions

| ID | Decision needed | Default if no answer | Affects lot |
|---|---|---|---|
| **D1** | Do we add a separate `first_name` column on `child` (cleanest), or keep `display_name` and police it at intake (faster)? | Police at intake (P1.3 as written). | P1.3 |
| **D2** | Keep the "Sponsored / Awaiting / Queue full" pill on the public browse + profile, or hide it from logged-out viewers? | Keep, but render only if no PII risk (current). | P1.4 |
| **D3** | Default new donor `visibility = anonymous` (opt-in to show first name) or `named` (opt-in to hide)? Read existing default before deciding migration on existing donors. | Default to `anonymous`; existing rows untouched. | P1.4 |
| **D4** | Asset proxy: stay open after EXIF strip, or gate by donor tier? | Stay open (EXIF strip makes the public photos safe by intent). | P1.5 |
| **D5** | CMS override on /privacy /terms /safeguarding: kill in code, or rely on Directus permission lockdown? | Kill in code for those three slugs; keep for /cookies + /refund. | P3.1 |
| **D6** | Transparency 85/10/5 split: ship now with finance sign-off, or replace with "TBC" copy until finance has data? | Replace with TBC copy until finance signs off. | P3.2 + P3.5 |
| **D7** | Public photos: stay Tier-1 (per guardian consent), or move to Tier-2 (must be signed in to view)? Bigger UX impact; affects FeaturedChildren + browse. | Stay Tier-1. | Hypothetical P1.7 |
| **D8** | Data residency claim: do we add a privacy-policy clause stating where data is stored (Singapore VPS for Directus + Postgres, Vercel-managed regions for the Next app, Resend in EU)? Needed for GDPR transparency. | Add a one-line clause. | New P3.6 |

Tag each as "decided" once you choose, and the corresponding lot ships.

---

## 5. Sequencing & dependency graph

```
P1.0 (data wipe)  ←  triggered AFTER all of:
  ├── P1.1 (noindex + sitemap)            ← independent
  ├── P1.2 (EXIF strip)                   ← independent
  ├── P1.3 (display_name)                 ← independent  (D1)
  ├── P1.4 (sponsor visibility)           ← needs D2 + D3
  └── P1.5 (asset proxy gate)             ← needs P1.2 first; D4 may skip

P2.1 (reveal revoke on cancel)            ← independent of P1
P2.2 (reveal audit log)                   ← independent
P2.3 (admin/DI gate audit)                ← independent
P2.4 (webhook reverify)                   ← independent

P3.1 (CMS legal override)                 ← D5
P3.2 (transparency allocation)            ← D6
P3.3 (hello@ → support@)                  ← independent
P3.4 ("platform" sweep)                   ← independent
P3.5 (fee transparency)                   ← D6 (depends on P3.2)
P3.6 (data residency clause)              ← D8

P4.1 (contact form Directus)              ← independent

P5.1 + P5.2 (UX/a11y)                     ← all of P1 done
```

P1 lots can be shipped in parallel; P1.0 (the wipe) is the gate. P2+P3 lots
ship after P1 in any order, but each ISOLATED lot still verifies alone.

---

## 6. Test cases — payload assertions (the "fetch logged-out, confirm absent" checks)

For each Tier-3 field, verify that an unauthenticated `curl /children/[id]`
response does NOT contain the field. The page is server-rendered, so the
test is: `curl` the page, grep the resulting HTML for the field's marker value.

```bash
# Seed: a child with district='Comilla', school_name='ABC School',
#       guardian_full_name='X Y Z', medical='condition_marker'.
# Then:
curl -s https://orphangive.org/children/<seed-uuid> > /tmp/profile.html
grep -i comilla /tmp/profile.html               # expect: 0 matches
grep -i "ABC School" /tmp/profile.html          # expect: 0 matches
grep -i "X Y Z" /tmp/profile.html               # expect: 0 matches
grep -i condition_marker /tmp/profile.html      # expect: 0 matches
# DOB seed: 2010-07-15
grep -i "2010-07-15" /tmp/profile.html          # expect: 0 matches
grep -i "July 15"    /tmp/profile.html          # expect: 0 matches
```

Same set, but as the logged-in non-sponsor donor (set a session cookie via
the dev login) — district + school may now appear (Tier-2), but guardian
contact, exact DOB, address still 0.

Same set as the sponsoring donor with an approved reveal — guardian name +
address may now appear, but raw DOB still 0 (only year visible).

If any expected-absent field appears in the HTML at the wrong tier, that's
a Tier-3 leak and a CRITICAL find — escalate immediately.

---

## 7. What this plan does NOT cover

These are intentionally out of scope for the audit-driven plan. They'd be
P6+ if the plan extended:

- Performance budgets (bundle size, image lazy-load fine-tuning).
- Full WCAG 2.1 AA audit (P5.2 only does the cheap wins).
- Bengali UI (deferred per Lot 4 QA doc).
- Internal "Inbox" feature.
- Email currency localization.
- bKash / SSLCommerz local payment rails.

The Lot 4 QA doc (`docs/admin-os/05-prelaunch-qa.md`) is the source of truth
for what's deferred at launch.
