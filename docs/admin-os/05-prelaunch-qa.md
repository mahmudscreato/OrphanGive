# Pre-launch QA & launch checklist

**Status:** authored for Lot 4 (2026-05-28). Operates as the go/no-go reference
before the public switch-on.
**Scope:** the full donor-to-DI-to-admin accountability spine that has to work
in production, plus the things that genuinely cannot be tested locally, plus
the items we have deliberately deferred.

---

## 1. End-to-end flows that must work on production

Each flow lists: **the steps**, **the expected result**, **known gap/risk**. If
a step is dependent on a branch that hasn't merged yet, it's flagged in §4.

### Flow A — Donor signup → browse → donate → sponsorship created

1. Visitor signs up via `/signup` (verify-email flow).
2. After verification, lands on `/dashboard` in `pending_approval` state.
3. Admin approves the donor in `/admin/donors` (super_admin gate).
4. Donor browses children at `/children`, picks one, clicks Sponsor.
5. Stripe Elements flow on `/sponsor/[childId]` (monthly) or `/donate` (one-time).
6. Webhook (`/api/webhooks/stripe`) writes the `sponsorship` row +
   `payment` row + `audit_event(action=stripe_*)`.
7. `payment_succeeded` triggers the donor receipt email (Resend → verified
   domain) and bumps the sponsorship row to `status='active'`.

**Expected:** sponsorship visible to the donor at
`/dashboard/sponsorship/[id]`. Cause label shown, monthly badge shown,
intent footnote shown, FulfillmentPanel shows "Awaiting field activity"
(phase=in_progress, before first task is filed).

**Known gap / risk:**
- Webhook signature secret must be the live key on prod, not the localhost
  forward key. Belt-and-braces: smoke-test by triggering a $1 charge from a
  real account in test mode after switch-on.
- Welcome email subject / from address: re-confirm against the verified
  Resend domain before launch.

### Flow B — Admin creates a field task

1. Admin opens `/admin/sponsorships/[id]` for an active monthly sponsorship.
2. "Field work" panel → "Create field task" modal — picks a DI assignee from
   the role-filtered list (`listAssignableDIs`).
3. Task type, due date, instructions filled in. Submit.
4. `task` row written; assigned DI sees it on `/di/tasks`.

**Expected:** task appears with DI status `open`. DI home shows "Open tasks"
count tile go up by one.

**Known gap / risk:**
- DI role discovery depends on `readRoles` resolving the role named
  "Data Inputter" — env-specific role names will trip this. Verify by
  checking `getDIRoleId()` cache resolves once on first task creation.

### Flow C — DI files a report (task-linked)

1. DI opens `/di/tasks/[id]`, clicks "File report for this task".
2. Lands on `/di/children/[id]/reports/new?task=<id>` with sponsorship +
   task pre-selected.
3. Composes report (visibility, photo, content, donor_text optional).
4. Submits → `child_update` row written with `status='submitted_by_di'`,
   `linked_task=<id>`. Task flips to `di_status='completed_pending_verification'`.

**Expected:** Task detail page now shows the linked report at the bottom of
the page. Submitting again is blocked (idempotent guard).

**Known gap / risk:** photo upload depends on Directus file storage being
reachable from the Next runtime. Test against the prod Directus before
switch-on.

### Flow D — Admin reviews & approves the report; sends to donor

1. Admin opens `/admin/reviews/reports` — sees the DI's submission.
2. Clicks claim → status becomes `under_admin_review`.
3. Edits `donor_text` (curated copy) if needed; clicks Approve.
4. Status → `approved`. Then clicks "Send to donor".
5. Status → `published`. `report_published` email goes to the donor
   (Resend, verified domain).
6. Audit log writes `admin_approved_report` + `admin_sent_report_to_donor`.

**Expected:** Donor's `/dashboard/sponsorship/[id]` now shows the report
in "Recent updates" with the donor_text (or content fallback). Email lands
with the curated copy.

**Known gap / risk:**
- "Send to donor" lives on the Lot 2 branch (not yet merged) — see merge
  order in §5. Without Lot 2, the lifecycle ends at `approved` and donors
  don't see the update.
- Status display sweep (Lot 3 Job C) — verify every status pill on
  donor + admin + DI surfaces shows a correct human label after Lot 3
  merges.

### Flow E — DI gets correction back, fixes & resubmits

1. Admin clicks Request correction (instead of approve) on a report.
2. Status → `correction_requested`; audit row written.
3. DI's `/di` home shows the report in the "Needs your attention" section
   (after Lot 3 merge — Spine 1.2 routed back to DI but Lot 3 surfaces it
   prominently).
4. DI opens the report at `/di/children/[id]/reports/[reportId]/edit`,
   fixes the content, resubmits → status back to `submitted_by_di`.
5. Repeat Flow D from step 2.

**Expected:** Backward loop closes; admin sees re-submission.

**Known gap / risk:** the DI home "Needs your attention" section depends on
Lot 3. Before Lot 3 merges, the only signal a DI has is the report's status
in their submissions list — no top-of-home affordance.

### Flow F — Fulfillment exception: admin sets ON_HOLD; donor sees curated copy

1. Admin opens `/admin/sponsorships/[id]`, AdminFulfillmentPanel.
2. Sets exception = `on_hold`, picks a curated public reason
   (e.g. "Field team scheduling"), writes internal-only privateReason.
3. Resolver derives donor view: phase=`on_hold`, donor sees curated public
   reason, never the privateReason.

**Expected:** `/dashboard/sponsorship/[id]` shows the on-hold treatment
with the curated copy. Internal admin view shows both public + private
reasons.

**Known gap / risk:** depends on donation-lifecycle-3 merging (not yet on
main). Donor-side resolver + panel (donation-lifecycle 1+2) already on
main and verified.

### Flow G — Refund reflection

1. Admin clicks Refund on `/admin/sponsorships/[id]`, picks charge,
   amount, reason. Submits.
2. Stripe creates the refund (real Stripe call). Webhook writes
   `payment.refunded`, bumps `payment.amount_refunded_usd`, audit row.
3. Donor's `/dashboard/sponsorship/[id]` payments list shows the refund
   amount.
4. Donor receives the refund email (Resend).

**Expected:** Refund visible in Stripe dashboard + in the donor's
payments list within ~30s of the webhook.

**Known gap / risk:** depends on Stripe being in live mode and the donor
email helper (Lot 3 Job A — the `readUsers` swap) being merged. Without
Lot 3, the donor-email function throws and the email is lost (Stripe
refund still succeeds; the donor just doesn't get notified).

---

## 2. Things that can ONLY be verified on production

Localhost can't fully validate these. Smoke-test them on the live domain
post-deploy.

- **Stripe webhook signature** against the live signing secret. Localhost
  uses the `stripe listen` forward key, prod uses the configured endpoint
  secret. Mismatch silently drops events.
- **Resend email delivery** on the verified `orphangive.org` domain. DKIM,
  SPF, DMARC alignment all only matter once mail actually leaves the
  domain. Send a smoke-test welcome email to a real Gmail address and
  inspect the headers.
- **OG image rendering** on Facebook / Twitter / LinkedIn / Slack scrapers.
  The Cloudinary OG URL works locally but social scrapers can be picky
  about Content-Type and crop. Use Facebook's [Sharing Debugger] and
  Twitter's [Card Validator] after deploy.
- **JSON-LD validation** by Google's [Rich Results Test]. The Lot 4 NGO
  block validates against schema.org but the live URL is what Google
  actually crawls.
- **Sitemap discovery** — submit `https://orphangive.org/sitemap.xml`
  to Google Search Console + Bing Webmaster Tools.
- **Robots.txt** — confirm `https://orphangive.org/robots.txt` resolves
  with all the Lot 4 disallows present.
- **Geo currency detection** — relies on the request's edge geolocation.
  Localhost always reports US. Test from a UK / EU / BD IP after launch.
- **CDN/asset caching** — Cloudinary + Next/Vercel image cache headers
  only matter at scale.
- **Real Stripe Tax / VAT** if Tax is enabled on the account — only
  exercised on real production charges.

---

## 3. Deferred items (explicit scope at launch)

These are not blockers; they are deliberately out of scope and surfaced
here so launch scope is clear to stakeholders.

- **Finance / Impact module** — fundraising totals, allocation explorer,
  reconciled cash-out reports. Roadmap, not launch.
- **Bengali UI (bn-BD locale)** — content authored in English, donor
  surfaces English-only. The `<html lang>` is hard-coded `en`; flipping
  to bn would require dual-locale routing.
- **Internal "Inbox"** — DI-admin chat / threaded comments per child.
  Not built. Workaround at launch: email + audit log.
- **Email currency localization** — donor emails always state USD even
  when the donor saw GBP/EUR/BDT on-site. Email currency formatter
  pending.
- **bKash / SSLCommerz** local payment rails. Stripe-only at launch.
- **Bengali admin UI**. Admin / DI surfaces English-only.
- **Withdraw / Expire submission statuses** (DI proposals). Production
  schema doesn't have these; the prior Submissions filter pills
  omitted them. Roadmap.
- **DI-side "Sent" tab grouping** for submitted reports. They appear in
  the DI's submissions list, but a dedicated "what's been sent to donors"
  tab is a polish item.

---

## 4. Branch inventory & merge-order recommendation

As of 2026-05-28, the following feature branches are unmerged from main.
Files in **bold** appear on more than one branch (conflict candidates).

| Branch | Scope | Files of note |
|---|---|---|
| `feature/admin-lot1-cohesion` | Admin nav + headers + interactive home dashboard | **AdminSidebar**, admin/page.tsx, admin home tiles, AdminPageHeader, RecentActivityFeed, lib/admin-dashboard |
| `feature/spine-lot2-send-to-donor` | "Send to donor" closes the report spine; email template; donor view | api/admin/reports/[id]/send/route, ReportPublishedEmail, ReportReviewActions, **audit-labels**, **di-audit**, **sponsorship-data**, **dashboard/sponsorship/[id]/page**, **HistoryPanel**, **RecentActivityPanel**, admin-reports |
| `feature/di-lot3-polish` | DI dashboard polish + donor-email helper SDK fix + status display sweep | admin-sponsorship-actions (Job A — `readUsers` swap), status-labels.ts (new), DiPageHeader.tsx (new), di-dashboard-stats, di/page, **admin/sponsorships/[id]/page**, **dashboard/sponsorship/[id]/page**, admin/proposals/[id]/page, ReportForm, IntakePhotoGrid, IntakePhotoBatchReview |
| `feature/donation-lifecycle-3` | Admin fulfillment controls + donations queue + refund reflection | admin/donations/page (new), AdminFulfillmentPanel, **AdminSidebar**, **audit-labels**, **di-audit**, **sponsorship-data**, **admin/sponsorships/[id]/page**, **HistoryPanel**, **RecentActivityPanel**, admin-donations, admin-fulfillment-actions, api/webhooks/stripe |
| `feature/lot4-launch-readiness` | SEO + metadata + Job A on `admin-documents` (`readFiles` swap) + footer attribution + noindex + pre-launch doc | layout.tsx (root metadata is already on main but this lot adds), page.tsx (home JSON-LD + metadata), donate/page metadata, robots, SiteFooter, admin/(authed)/layout, di/(authed)/layout, dashboard/layout, status-quo fixes for "platform" copy, admin-documents (Job A) |

**Recommended merge order**

The merges below are ordered to minimise conflicts (the file that's
changed by multiple branches is rebased on the most recent landed
work).

1. **`feature/donation-lifecycle-3` first.** It's the most foundational
   write-path work still pending (admin fulfillment controls + donations
   queue + refund reflection). It introduces new AdminSidebar entries,
   new audit labels, new sponsorship-data fields. Landing it first
   means subsequent UI lots rebase onto the new ground truth.
2. **`feature/admin-lot1-cohesion` second.** Lot 1 polishes admin nav
   structure including AdminSidebar — needs donation-3's new nav items
   in place before Lot 1 groups them. Conflict zone: AdminSidebar
   (resolve by taking donation-3's sidebar items inside Lot 1's
   grouping wrapper).
3. **`feature/spine-lot2-send-to-donor` third.** Lot 2 closes the report
   loop with "Send to donor" + email + donor view. Conflicts with
   donation-3 on audit-labels, di-audit, sponsorship-data, HistoryPanel,
   RecentActivityPanel — all additive, resolve by taking the union.
4. **`feature/di-lot3-polish` fourth.** DI polish + status display sweep
   + the `readUsers` SDK fix. Conflicts with Lot 2 on
   `dashboard/sponsorship/[id]/page.tsx` (status pill swap vs donor_text
   read change — non-overlapping line ranges, should merge cleanly).
5. **`feature/lot4-launch-readiness` last.** Launch-readiness pass.
   Touches mostly new metadata exports + SiteFooter + noindex on authed
   layouts + the `readFiles` fix in admin-documents. The Lot 3 fix
   (`readUsers` in admin-sponsorship-actions) and Lot 4 fix (`readFiles`
   in admin-documents) are on different files — no conflict.

**Conflict zones to watch when merging**

- **`src/components/admin/AdminSidebar.tsx`** — Lot 1 ↔ donation-3.
  Take donation-3's new entries inside Lot 1's grouping structure.
- **`src/lib/audit-labels.ts`** + **`src/lib/di-audit.ts`** — Lot 2 ↔
  donation-3. Both add new audit-action enum entries; resolve by union.
- **`src/lib/sponsorship-data.ts`** — Lot 2 ↔ donation-3. Both add
  field reads (donor_text, fulfillment columns). Union.
- **`src/app/dashboard/sponsorship/[id]/page.tsx`** — Lot 2 (read
  donor_text preference) ↔ Lot 3 (status pill swap). Different lines,
  should be clean; verify after merge.
- **`src/app/admin/(authed)/sponsorships/[id]/page.tsx`** — Lot 3 ↔
  donation-3. Lot 3 added paymentStatusLabel for the payment row;
  donation-3 added AdminFulfillmentPanel + Refund button wiring.
  Different sections of the same page; verify after merge.
- **`src/components/di/HistoryPanel.tsx`** + **`src/components/di/RecentActivityPanel.tsx`**
  — Lot 2 ↔ donation-3. Both add new audit action label
  cases. Union.

**Verification after each merge**

For each merge: rebuild (`npm run build`), confirm tsc clean, click
through the affected surface(s) on localhost before the next merge.

---

## 5. Pre-deploy checklist (the gate)

Before flipping DNS to the new app:

- [ ] All 5 feature branches in §4 merged in the order above.
- [ ] `npm run build` clean on `main` after the final merge.
- [ ] `tsc --noEmit` clean on `main`.
- [ ] Stripe in live mode; signing secret rotated and stored.
- [ ] Resend domain verified (DKIM, SPF, DMARC green).
- [ ] Verified `https://orphangive.org/robots.txt` resolves with all
      disallows from Lot 4.
- [ ] Verified `https://orphangive.org/sitemap.xml` resolves and
      includes child profile pages.
- [ ] Smoke-test donor signup → approve → donate $1 → see sponsorship.
- [ ] Smoke-test task creation → DI report submit → admin approve →
      send to donor → donor sees update in `/dashboard/sponsorship/[id]`.
- [ ] Smoke-test refund: refund the $1 → donor sees refund in payments.
- [ ] Submit sitemap to Google Search Console + Bing Webmaster.
- [ ] OG image renders on Facebook Sharing Debugger.
- [ ] JSON-LD validates on Google Rich Results Test.

---

## 6. Rollback

If a flow breaks after deploy:

- **Donor flow regression** → roll back to the previous deploy via
  Vercel's instant-rollback. No DB migration to unwind on Lots 1-4
  (only schema migration to ever land on main is donation-lifecycle-1's
  fulfillment columns — already on main, separate concern).
- **Email delivery regression** → re-disable the affected template at
  the route level (set `mail_send=false` env or comment the
  `await sendMail(...)` call). Audit log will show what failed.
- **Webhook regression** → temporarily disable the failing Stripe
  webhook endpoint in the Stripe dashboard. Sponsorship + payment rows
  will be created by the next deploy from the Stripe event log replay.

---

## 7. Related docs

- `docs/email-architecture.md` — Resend templates + cron sender.
- `docs/cron-setup.md` — scheduled jobs (renewal probe etc.).
- `docs/pre-launch-audit.md` — older audit pass; this doc supersedes
  for Lots 1–4. Keep both — the older one has hand-written verification
  notes for the Sessions 60–69 sprint.
- `docs/session-49-donor-surface-audit.md` — donor surface privacy
  audit; still the source of truth for "what does the donor see".

[Sharing Debugger]: https://developers.facebook.com/tools/debug/
[Card Validator]: https://cards-dev.twitter.com/validator
[Rich Results Test]: https://search.google.com/test/rich-results
