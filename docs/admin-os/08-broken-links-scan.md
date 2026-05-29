# Broken-link scan — public site, pre-launch

**Authored:** 2026-05-28. Scan covers every `<Link>` / `<a>` / `mailto:` /
internal anchor on every public, non-auth-gated surface plus the shared
layout components (`SiteFooter`, `SiteNav`). Anchors are validated against
actual route files in `src/app/` and against `id=` attributes in the
target component.

## Summary

| Severity | Count | What it means |
|---|---|---|
| HIGH | 4 | Broken in a user-facing public flow. Must fix. |
| MEDIUM | 5 | Visible but recoverable. Should fix. |
| LOW | 6 | Footer / dead code. Cleanup. |
| FOUNDER | 3 | Needs a decision before fixing. |

P3 of this lot fixes HIGH + MEDIUM in code. LOW + FOUNDER items are
catalogued here for separate triage.

---

## HIGH — broken in a user-facing public flow

### H1. Signup terms link → `/legal/terms`
- **`src/app/signup/sign-up-form.tsx:215`** — `<a href="/legal/terms" …>Terms of Service</a>`
- **Problem:** broken — `/legal/terms` does not exist. Canonical is `/terms`. This is the consent checkbox every new donor must accept.
- **Fix:** change to `/terms`. **APPLIED.**

### H2. Signup privacy link → `/legal/privacy`
- **`src/app/signup/sign-up-form.tsx:219`** — `<a href="/legal/privacy" …>Privacy Policy</a>`
- **Problem:** broken — `/legal/privacy` does not exist. Canonical is `/privacy`. Same critical consent gate.
- **Fix:** change to `/privacy`. **APPLIED.**

### H3. Footer "Transparency" → wrong route
- **`src/components/layout/SiteFooter.tsx:36`** — `{ href: "/about", label: "Transparency" }`
- **Problem:** the label says "Transparency" but it routes to `/about`. A dedicated `/transparency` page exists. Footer is on every public page.
- **Fix:** change `href` to `/transparency`. **APPLIED.**

### H4. Help-page topic anchors → `#sponsorship-donation`
- **`src/app/help/page.tsx:78, 88, 98`** — three topic cards link to `/faq#sponsorship-donation`.
- **Problem:** the FAQ group id is `sponsorship`, not `sponsorship-donation` (see `src/app/faq/page.tsx:111`). Clicking lands on `/faq` with no scroll.
- **Fix:** change all three to `/faq#sponsorship`. **APPLIED.**

---

## MEDIUM — visible but recoverable

### M1. error.tsx mailto → `hello@`
- **`src/app/error.tsx:58`** — `<a href="mailto:hello@orphangive.org">`
- **Problem:** non-canonical mailto on the user-visible error page. `hello@` is legacy per Lot 4.
- **Fix:** change to `mailto:support@orphangive.org`. **APPLIED.**

### M2. global-error.tsx mailto → `hello@`
- **`src/app/global-error.tsx:98`** — same as M1, in the root-level error boundary.
- **Fix:** change to `mailto:support@orphangive.org`. **APPLIED.**

### M3. Hero "watch video" anchor → wrong id
- **`src/components/home/Hero.tsx:157`** — `<Link href="#how-it-works-video" aria-label="Watch how OrphanGive works">`
- **Problem:** the HowItWorks section id is `how-it-works`, not `how-it-works-video`. Play button jumps nowhere.
- **Fix:** change to `href="#how-it-works"`. **APPLIED.**

### M4. Footer "Child Protection Policy" duplicate
- **`src/components/layout/SiteFooter.tsx:47`** — `{ href: "/safeguarding", label: "Child Protection Policy" }` appears in the same Trust & Legal column as a "Safeguarding Policy" entry pointing to the same `/safeguarding` route.
- **Problem:** two labels for the same destination clutter the footer.
- **Fix:** remove the duplicate entry. **APPLIED.** (Founder may add a dedicated `/child-protection` policy later — see FOUNDER F4.)

### M5. Footer social-media URLs (best-guess handles)
- **`src/components/layout/SiteFooter.tsx:68, 73, 78, 83`** — `https://www.facebook.com/orphangive`, `…/instagram.com/orphangive`, `…/linkedin.com/company/orphangive`, `…/youtube.com/@orphangive`.
- **Problem:** inline comment (lines 18-19) explicitly says these are "best-guess placeholders". None confirmed to exist.
- **Fix:** **FOUNDER** — confirm each handle; if any don't exist, replace with `#` until they're created. **NOT APPLIED** — needs decision F5.

---

## LOW — dead code / footer / minor

### L1. FaithSection orphan link → `/zakat-sadaqah`
- **`src/components/home/FaithSection.tsx:35`** — `<Link href="/zakat-sadaqah">Learn more about giving →</Link>`.
- **Problem:** broken (route doesn't exist) AND the file isn't imported by any page. Dead code.
- **Fix:** delete `FaithSection.tsx` (and the other unused home orphans — `Promise.tsx`, `RealMoments.tsx`, `StorySpread.tsx`). Out of P3 scope; do as a small cleanup lot.

### L2. UpdatesSection degenerate template
- **`src/components/profile/UpdatesSection.tsx:138`** — `<Link href={`/children/${first.id ? "" : ""}#updates`} className="hidden" />` — both ternary branches yield `""`, the link is `aria-hidden` + `className="hidden"`.
- **Fix:** delete the dead link. Out of P3 scope.

### L3-L4. Other dead home orphans
- `Promise.tsx`, `RealMoments.tsx`, `StorySpread.tsx` — same as L1.

### L5. Help-page placeholder topic
- **`src/app/help/page.tsx:116`** — "Donor dashboard guide" → `/how-it-works`. Inline TODO comment notes this is a placeholder until a dedicated article ships.
- **Fix:** **FOUNDER** F6 — either soften the title or ship a `/help/donor-dashboard` page.

### L6. dev/email-review preview URL
- **`src/app/dev/email-review/page.tsx:52`** — `https://orphangive.org/auth/reset?token=preview`.
- **Problem:** intentional preview placeholder; the dev-tools page is gated behind `NEXT_PUBLIC_DEV_TOOLS_ENABLED` (returns 404 in prod). Not user-visible.
- **Fix:** no action — listed for completeness.

---

## FOUNDER — needs decision

### F1. Transparency 85/10/5 allocation copy
- **`src/app/transparency/page.tsx:39, 150`** — `ALLOCATIONS` array drives a public funds-split block, inline comment says `TBD-ALLOCATION — confirm with finance team`. **Same item flagged in `docs/admin-os/07-safety-fix-plan.md` as D6.**
- **Decision needed:** finalise the numbers or replace with "TBC" copy until finance signs off.

### F2. Goodverse Foundation statutory registration number
- **`src/app/privacy/page.tsx:74`** and **`src/app/terms/page.tsx:73`** — both legal pages have inline TODO comments referencing the missing registration number.
- **Decision needed:** supply the registration number; insert in both files.

### F3. `/stories/[slug]` route
- **`src/app/stories/page.tsx:98`** — `<Link href={`/stories/${s.slug}`}>` wrapper around each story card.
- **Problem:** `/stories/[slug]` does NOT exist as a route. Currently masked because `getPublishedStories()` returns `[]`. The moment a `story` row is published in Directus, every card 404s.
- **Decision needed:** either create `src/app/stories/[slug]/page.tsx` OR remove the `<Link>` wrapper. Must be resolved before any story is published.

### F4. Separate child-protection vs safeguarding policy
- **`src/components/layout/SiteFooter.tsx:47`** (now removed, see M4) — was the wrapper for a possible standalone "Child Protection" policy.
- **Decision needed:** is `/safeguarding` the canonical policy, or do we want a separate `/child-protection` doc? Choosing "separate" requires drafting + linking a new policy page.

### F5. Social-media handles
- Four footer social links currently point to best-guess handles. See M5.
- **Decision needed:** which handles exist, and which should be hidden until accounts are live?

### F6. Help-page "Donor dashboard guide"
- See L5.
- **Decision needed:** softening the title vs shipping a dedicated `/help/donor-dashboard` page.

---

## What was checked and cleared

- All footer Learn / Trust & Legal / Connect link arrays (except H3 and M4) resolve.
- `SiteNav.tsx` NAV_LINKS (`/children`, `/how-it-works`, `/stories`, `/about`, `/contact`) all resolve.
- Profile components (`ProfileHero`, `SponsorCTA`, `BlurredPhotoModalTrigger`, `IntakePhotoGallery`, `StorySection`) link only to existing routes.
- Browse children components (`ChildCard`, `BrowseChildCard`, `BrowseEmptyState`, `EmptyState`, `BrowseClosingStrip`) — all valid.
- All `mailto:support@orphangive.org` instances (privacy, refund, maintenance, volunteer, for-charities, safeguarding, di/login, contact) are canonical.
- `mailto:childrens.hvn@gmail.com` on `safeguarding/page.tsx:210` is the designated safeguarding lead's direct contact at Children's Heaven Trust — intentional.
- External URLs `https://www.goodverse.org`, `https://childrensheaventrust.org/`, `https://stripe.com/privacy`, `https://www.printagraphy.com` look well-formed; not fetched per scope rules.
- `tel:+8801713086508` on contact page — well-formed Bangladesh mobile.
- Anchors that resolve: `#main-content` (skip-link), `#story`, `#retention`, `#how-it-works`, all `#<faq-group-id>` except `#sponsorship-donation` (fixed in H4).
