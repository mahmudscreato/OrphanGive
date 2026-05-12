# OrphanGive — pre-launch checklist

Consolidated from every Session 16–28 ship report's "Decisions
awaiting Mahmud" + "What to flag" sections. Each item carries:
- **Source** — the session that surfaced it
- **Unblock** — who or what is needed to resolve
- **Effort** — rough size: trivial (<30 min), small (<2 hr),
  medium (half-day), large (full day or more)

Work through Section 1 before opening the site to the public.
Sections 2 and 3 should be on the radar but won't block launch
day. Section 4 covers the post-launch operational ramp.

---

## Section 1 — Blockers (must resolve before public launch)

### 1.1  Bangladesh Bank FX clearance for Children's Heaven Trust
- **Source:** Session 26 (`/transparency` placeholder — referenced as TBD)
- **Unblock:** Mahmud + CH Trust finance liaison
- **Effort:** medium (regulatory paperwork — depends on existing status)
- **Why blocking:** Without FX clearance, USD donations to CH Trust may be flagged or held by the Bangladesh banking system. If the clearance isn't in place, every international donation creates an ops fire.

### 1.2  Bangladesh legal counsel review on `session-26-legal-pages`
- **Source:** Session 26 (every drafted legal page carries a "Draft — pending legal review" badge)
- **Unblock:** Bangladesh-based counsel + CH Trust's designated safeguarding officer (for `/safeguarding` specifically)
- **Effort:** large (5 documents × careful review; expect a round-trip)
- **Why blocking:** The 5 legal pages (`/privacy`, `/terms`, `/refund`, `/cookies`, `/safeguarding`) cannot be published as final policy without counsel sign-off. Site currently shows visible "Draft" badges, but those should not be the public-launch state.

### 1.3  Stripe production keys + webhook API version pinning
- **Source:** Ongoing (pre-launch ops hygiene)
- **Unblock:** Mahmud + Stripe dashboard access
- **Effort:** small
- **Verify:**
  - `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are LIVE keys, not TEST
  - Webhook endpoint registered at the production URL
  - Webhook signing secret matches `STRIPE_WEBHOOK_SECRET` in `app.env`
  - Webhook API version pinned (Stripe defaults to "current" — pin to a specific date so behavior doesn't drift mid-launch)

### 1.4  Test data cleanup — distinguish seed from real
- **Source:** Session 22 (cleanup script for 30 legacy rows) + general ops hygiene
- **Unblock:** Mahmud (review the diagnostic output from `scripts/cleanup-legacy-null-schedule.mjs --dry-run`)
- **Effort:** small (dry-run + confirm)
- **Verify:**
  - Run `scripts/cleanup-legacy-null-schedule.mjs --dry-run`, review the table
  - Run with `--confirm` once happy
  - Audit `child` collection for any test profiles that should be flagged inactive before launch
  - Audit `sponsorship` collection for test rows

### 1.5  Color contrast remediation decision (WCAG AA)
- **Source:** Session 28 (8 contrast pairs computed; 6 fail)
- **Unblock:** Mahmud (design call)
- **Effort:** small once decided (token swap + cascade); the **decision** is the long pole
- **Failing pairs:**
  - `white on tangerine` (2.33:1) — primary CTA buttons across the site
  - `white on orange-solid` (2.51:1) — homepage CTAs, ClosingCTA, "Support [name]" buttons
  - `tangerine-deep on cream` (3.00:1) — body inline links (large text passes; body fails)
  - `moss on cream` (3.58:1) — "Sponsored monthly" badge text
- **Recommended:** Option A from Session 28's ship report — switch CTA text from `white` to `ink` (#2A2A2C). Hits 5.91:1 on tangerine, 5.50:1 on orange-solid. Smallest design change, biggest a11y win. **Reply with A/B/C and I'll write the cascade in a follow-up session.**

---

## Section 2 — High-priority (should resolve before launch but not strictly blocking)

### 2.1  NGOAB registration number visible on transparency page
- **Source:** Session 26 + Session 20 (transparency placeholder, "[TBD]" in regulatory block)
- **Unblock:** Mahmud (already have the value: `Reg. iv-98/2021` — just needs to land in CMS or replace the TBD placeholder on the hand-built `/transparency`)
- **Effort:** trivial

### 2.2  External auditor identity confirmed
- **Source:** Session 20 + Session 26 (transparency placeholder)
- **Unblock:** Mahmud + CH Trust finance
- **Effort:** small (could be "TBD pending appointment" until Q1)
- **Acceptable interim:** label as "External auditor: appointment pending Q1 2026 financial year" rather than blank

### 2.3  Stripe statement descriptor verified
- **Source:** Session 19 FAQ #23 ("OrphanGive" vs "CH Trust")
- **Unblock:** Mahmud + Stripe dashboard access
- **Effort:** trivial
- **Why:** the FAQ tells donors what to expect on their card statement; the actual Stripe-configured descriptor must match the FAQ copy

### 2.4  `PASSWORD_RESET_URL_ALLOW_LIST` configured in Directus
- **Source:** Session 24 (forgot-password flow relies on Directus's native reset endpoint)
- **Unblock:** Mahmud + Directus admin access
- **Effort:** trivial
- **Required value:** `https://orphangive.org/reset-password` (plus localhost during dev)
- **Why:** without the allow-list entry, Directus refuses to issue reset emails — the flow silently fails

### 2.5  Contact form backend wiring (Resend or Directus submission)
- **Source:** Session 19 (form is UI-only; submission console-logs + shows success state)
- **Unblock:** Mahmud + me (small backend task)
- **Effort:** small
- **Why:** the contact form currently looks fully functional to the user but doesn't actually send anything. Either wire to Resend (transactional email to a support inbox) or create a Directus `contact_submission` collection.
- **Ethical note:** until wired, the contact page is technically misleading. Either ship it disabled (form fields read-only with a "use email instead" message) or finish the wiring before launch.

### 2.6  Stories newsletter backend wiring
- **Source:** Session 20 (newsletter signup is UI-only)
- **Unblock:** Mahmud + me
- **Effort:** small
- **Status:** `/stories` is placeholder content with a "we'll email you when stories launch" form. Backend is `// TODO: wire to newsletter list`. Either wire to a Resend audience / Klaviyo list / Directus collection, OR remove the form until stories actually launch.

### 2.7  Verify all 4 social URLs work
- **Source:** Session 16 polish (5.10 Fix D)
- **Unblock:** Mahmud (test in browser)
- **Effort:** trivial
- **URLs in footer:**
  - `https://www.facebook.com/orphangive`
  - `https://www.instagram.com/orphangive`
  - `https://www.linkedin.com/company/orphangive`
  - `https://www.youtube.com/@orphangive`
- **Action:** click each. If any returns 404, either claim that handle or remove the icon from the footer before launch (better empty than broken).

### 2.8  Imran Ali photo uploaded to Directus
- **Source:** General content readiness (Imran is one of the verified children whose card renders on the homepage + `/children`)
- **Unblock:** CH Trust field team (consent already documented per the Session 26 safeguarding draft) + Directus upload
- **Effort:** trivial (assuming consent + file in hand)

### 2.9  Email logo URL set (`EMAIL_LOGO_URL` env var)
- **Source:** Session 22 (email brand pass — layout falls back to a text logo when the env var is unset)
- **Unblock:** Mahmud + ops
- **Effort:** trivial
- **Recommended value:** the Cloudinary-hosted long-form logo currently used in `SiteNav.tsx` — `https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_L_SVG_h9uduq.svg`. Set in `/opt/orphangive/app.env`.

---

## Section 3 — Nice-to-have before launch

### 3.1  Hero video URL for play button
- **Source:** Session 16 (Hero has play button; TODO comment in `Hero.tsx`)
- **Unblock:** Mahmud (video production + URL)
- **Effort:** medium (depends on video creation; the wiring itself is small)
- **Current state:** clicking the play button is a no-op. The play icon is purely decorative until wired. Could ship with the button removed if no video is ready.

### 3.2  Filter UI for `/children` when count exceeds 25
- **Source:** Session 17 (deferred per Mahmud's review decision)
- **Unblock:** me (filtering UI rebuild) when child count grows
- **Effort:** medium
- **Trigger:** active child count exceeds ~25. Currently 10. Not urgent.

### 3.3  Real Lighthouse audit run
- **Source:** Session 27 (static perf audit only — measurement requires real browser)
- **Unblock:** Mahmud or anyone with `npx unlighthouse` running locally against prod
- **Effort:** small (run command + paste results back)
- **Why nice-to-have:** Session 27 applied every low-risk improvement available from static analysis; Lighthouse confirms whether the actual numbers cross the launch thresholds (Performance ≥80, Accessibility ≥90).

### 3.4  Real axe-core audit run
- **Source:** Session 28 (static a11y audit only)
- **Unblock:** Mahmud or anyone with `npx @axe-core/cli` locally
- **Effort:** small
- **Why:** confirm zero critical violations against the production deployment

### 3.5  Framer Motion size reduction or per-component imports
- **Source:** Session 27 (~800KB combined motion-dom + framer-motion)
- **Unblock:** me (separate session — touches every motion-using component)
- **Effort:** medium-to-large
- **Approach:** evaluate `motion/react` (lighter sibling) or switch to per-component `motion.m` imports

### 3.6  Server vs. client component split for homepage components
- **Source:** Session 27 (Hero, StatsBand, FeaturedChildren, AboutSection are `"use client"` for small motion fragments — could extract motion into tiny islands and leave the bulk Server)
- **Unblock:** me (separate session — one component at a time, verify motion still renders)
- **Effort:** medium
- **Payoff:** smaller JS bundle, faster TTI

---

## Section 4 — Post-launch monitoring

### 4.1  Activate Sentry
- **Source:** Session 21 (SDK installed + configured; activation gated on env vars)
- **Unblock:** Mahmud + Sentry account
- **Effort:** trivial (15 min once you have the DSN)
- **Action:**
  1. Create a Sentry project (org: pick a Sentry org under your account)
  2. Copy DSN from Sentry settings
  3. Add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` to `/opt/orphangive/app.env`
  4. Restart the container
  5. Trigger a test error (visit a route that throws or call `Sentry.captureMessage("test")`) — should appear in Sentry within seconds
- **Optional add-ons:** `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` enable source-map upload for prettier stack traces

### 4.2  Run `scripts/cleanup-legacy-null-schedule.mjs`
- **Source:** Session 22 (30 legacy rows from the May 6–7 pre-fix window)
- **Unblock:** Mahmud
- **Effort:** small (dry-run + confirm)
- **Procedure:** see [OPS_RUNBOOK.md](OPS_RUNBOOK.md#run-the-legacy-sponsorship-cleanup) — `--dry-run` first, review the markdown table, then `--confirm` if everything looks right.

### 4.3  BetterStack alert thresholds review
- **Source:** Pre-launch monitoring readiness
- **Unblock:** Mahmud + BetterStack account
- **Effort:** small
- **Verify:**
  - Uptime check on the production URL with appropriate threshold (1 failed check before alerting is too noisy; 3 failed checks is reasonable)
  - Health check on `/api/health` separately from the marketing pages
  - Notification channel — email + phone? Email alone is fragile.

### 4.4  Soft launch — invite 5–10 trusted donors
- **Source:** Mahmud's roadmap
- **Unblock:** Mahmud
- **Effort:** small
- **Why:** the first 48 hours of donor flow surface real-world issues that internal QA misses (browser-specific Stripe quirks, email-client rendering issues, mobile reach-tap problems). Capture feedback explicitly via a follow-up email or short survey.

---

## Cross-cutting items (apply to multiple sections)

These don't fit a single bucket but matter:

- **`partnerships@orphangive.org` mailbox.** Referenced on `/for-charities` and the contact NGO/press card. Confirm the address exists or swap all references to `support@orphangive.org`. (Source: Session 19, Session 20.) Severity: Section 2.
- **Operational SLAs in the legal page drafts.** Session 26 documented commitments like "Photo consent withdrawal honoured within 24 hours" and "Urgent safeguarding concern: action within 48 hours". Confirm with the field team / safeguarding lead that those SLAs are deliverable before counsel sign-off. (Source: Session 26.) Severity: Section 1 (folded into 1.2).
- **Confirm `4.8 million` orphan stat citation date** on `/about` "Why we exist" + homepage StatsBand `bangladesh_total`. (Source: Session 17.5.) Severity: Section 3.
- **Confirm bKash / Nagad on roadmap** (FAQ #20). If not actually on the roadmap, remove the line. (Source: Session 19.) Severity: Section 2.
- **Image alt-text editorial pass** — all `<Image alt="…">` strings across the site. Session 28 flagged that some are generic ("A child supported by OrphanGive"). Owner: Mahmud (content judgment), not me. Severity: Section 3.

---

## How to use this list

Work top-down. Section 1 items are the literal launch gate — every checkbox must be a "done" before you flip the DNS or remove the password-protected reverse-proxy rule. Section 2 items should ideally land before launch but won't strictly block it (with the partial-shipping caveats noted per-item, like 2.5 contact form). Section 3 items can ship as follow-up sessions in the first month. Section 4 items are launch-week and ongoing.

When an item is resolved, change `### N.N` to `### ~~N.N~~ ✓` and add a one-line note on what landed. Tracking in-place keeps the file useful as long-term documentation.
