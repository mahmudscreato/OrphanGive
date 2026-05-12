# Merge Playbook — Session 29

This document is the deliverable from Session 29's branch-hygiene
work. It is the proof-of-work plus the runbook Mahmud follows
when he sits down to merge the 8 WIP branches into `main`.

**This file lives on the disposable `consolidation-test` branch.
Delete the branch after merging the real branches into `main`.**

---

## TL;DR

- **7 of 8 branches** are ship-ready and can be merged into `main`
  in the order below.
- **1 branch** (`session-26-legal-pages`) is DEFERRED pending
  Bangladesh-counsel review of the legal page drafts.
- **2 merges have hand-resolvable conflicts** (Session 20 and
  Session 28). The exact conflict files and resolutions are
  documented per-step.
- After all 7 merges, the build is clean. **72 files changed
  from `main`** in total.

---

## Step 1 — branch build verification

| Branch | tsc | build | Notes |
|---|---|---|---|
| session-17-children-list-wip | ✓ | ✓ | clean |
| session-20-tier1-content-pages | ✓ | ✓ | Requires `npm install` first to materialise the @sentry/nextjs dep added on this branch. Without `npm install`, tsc + build both fail with `Cannot find module '@sentry/nextjs'`. **Environmental, not a real branch issue.** |
| session-23-dashboard-visual | ✓ | ✓ | clean |
| session-24-forgot-password | ✓ | ✓ | clean |
| session-25-error-pages | ✓ | ✓ | clean |
| session-26-legal-pages | ✓ | ✓ | clean (but DEFERRED — see below) |
| session-27-perf-audit | ✓ | ✓ | clean |
| session-28-a11y-audit | ✓ | ✓ | clean |

**Run `npm install` after every branch switch** if the branch may
have introduced new dependencies. The merged tree below has
@sentry/nextjs as a dep, so anyone checking out a different branch
afterward should re-install.

---

## Step 2 — conflict map

Files touched by 2+ branches:

| File | Branches | Severity |
|---|---|---|
| `src/app/about/page.tsx` | 17 (rewrite), 20 (helper) | **HARD CONFLICT** — only one version can win |
| `src/app/children/page.tsx` | 17 (rewrite), 20 (helper) | **HARD CONFLICT** |
| `src/app/cookies/page.tsx` | 20 (helper), 26 (full draft) | DEFERRED with Session 26 |
| `src/app/privacy/page.tsx` | 20, 26 | DEFERRED |
| `src/app/refund/page.tsx` | 20, 26 | DEFERRED |
| `src/app/safeguarding/page.tsx` | 20, 26 | DEFERRED |
| `src/app/terms/page.tsx` | 20, 26 | DEFERRED |
| `src/app/faq/page.tsx` | 20 (rewrite), 28 (`<main>`→`<div>`) | **AUTO-MERGE CONFLICT** — Session 20's version doesn't have `<main>` so the swap is a no-op; pick Session 20's content |
| `src/app/stories/page.tsx` | 20, 28 | Same — no-op swap |
| `src/app/forgot-password/page.tsx` | 24 (brand pass), 28 (swap) | **AUTO-MERGE CONFLICT** — keep Session 24 brand pass, re-apply Session 28 swap |
| `src/app/reset-password/page.tsx` | 24, 28 | same |
| `src/app/signin/page.tsx` | 24, 28 | same |
| `src/app/layout.tsx` | 25 (self-hide list), 27 (preconnect), 28 (skip link) | **AUTO-RESOLVES** — git merges all three additions cleanly (different file regions) |
| `package.json` | 20 (+Sentry), 27 (move react-email + @types/bcryptjs to devDeps) | **AUTO-RESOLVES** — JSON edits in different sections |
| `src/components/layout/SiteNav.tsx` | 25 only | Only branch touching it |
| `src/components/layout/SiteFooter.tsx` | 25 only | Only branch touching it |
| `src/app/globals.css` | 28 only | Only branch touching it |

**Touch-only files (no cross-branch conflicts):**
Dashboard pages (Session 23), error.tsx + global-error.tsx
(Session 20), Sentry config files (Session 20), public asset
deletions (Session 27), new pages /contact /help /transparency
/maintenance /offline /not-found.tsx (Sessions 20, 25), new
components in src/components/children + src/components/legal +
src/lib/page-metadata.ts.

---

## Step 3 — recommended merge order with commands

**Strategy:** merge the branches in dependency order. Each merge
is verified with `tsc --noEmit` + `next build` before proceeding
to the next. **Stop and surface if any step fails.**

### Pre-flight (run once before starting)

```sh
cd /path/to/OrphanGive/public-site
git checkout main
git pull origin main
git fetch origin --all
git status --short        # must show nothing
```

### Merge 1: `session-25-error-pages` — clean fast-forward / simple merge

```sh
git merge --no-ff session-25-error-pages
rm -rf .next && npx tsc --noEmit && npx next build
```

**Expected:** zero conflicts. Adds `not-found.tsx`,
`/maintenance/page.tsx`, `/offline/page.tsx`. Extends the
self-hide list in `SiteNav.tsx` + `SiteFooter.tsx` to also hide
on `/maintenance` and `/offline`.

### Merge 2: `session-23-dashboard-visual` — clean

```sh
git merge --no-ff session-23-dashboard-visual
rm -rf .next && npx tsc --noEmit && npx next build
```

**Expected:** zero conflicts. Touches only `src/app/dashboard/*`
which no other branch modifies.

### Merge 3: `session-24-forgot-password` — clean

```sh
git merge --no-ff session-24-forgot-password
rm -rf .next && npx tsc --noEmit && npx next build
```

**Expected:** zero conflicts. Brand-passes `/signin`,
`/forgot-password`, `/reset-password`.

### Merge 4: `session-17-children-list-wip` — clean

```sh
git merge --no-ff session-17-children-list-wip
rm -rf .next && npx tsc --noEmit && npx next build
```

**Expected:** zero conflicts at this point. Rewrites `/about` and
`/children`, adds the `BrowseChildCard` family, adds the legacy-
sponsorship cleanup script, brand-passes email components.
Importantly: this MUST land before Session 20 so Session 17's
hand-built `/about` is the "ours" version git treats as canonical
when Session 20's conflicting commit comes in.

### Merge 5: `session-20-tier1-content-pages` — **2 conflicts**

```sh
git merge --no-ff session-20-tier1-content-pages
```

**Expected conflicts:**
- `src/app/about/page.tsx`
- `src/app/children/page.tsx`

**Resolution (per Session 17 ship report's documented decision —
hand-built wins):**
```sh
git checkout --ours src/app/about/page.tsx src/app/children/page.tsx
git add src/app/about/page.tsx src/app/children/page.tsx
git commit --no-edit
```

**Then re-install for the new Sentry dep + verify:**
```sh
npm install
rm -rf .next && npx tsc --noEmit && npx next build
```

**Why `--ours`:** Session 17's hand-built `/about` is the
canonical version per the Session 17.5 review answer. Session 20's
change was a CMS-helper application — useful pattern but applied to
a now-superseded `/about`. Same logic for `/children`.

### Merge 6: `session-27-perf-audit` — **package.json auto-merges**

```sh
git merge --no-ff session-27-perf-audit
```

**Expected:** **NO conflicts.** Git auto-merges `package.json` —
Session 20 added `@sentry/nextjs` to `dependencies`; Session 27
moved `react-email` and `@types/bcryptjs` from `dependencies` to
`devDependencies`. These edits sit on different lines and git
handles them.

**Verify both ended up in the right sections:**
```sh
grep -A 1 '"@sentry/nextjs"' package.json     # in "dependencies"
grep -A 1 '"react-email"' package.json        # in "devDependencies"
grep -A 1 '"@types/bcryptjs"' package.json    # in "devDependencies"
```

**Then:**
```sh
npm install      # update lockfile (Session 27 reduces prod surface)
rm -rf .next && npx tsc --noEmit && npx next build
```

### Merge 7: `session-28-a11y-audit` — **5 conflicts**

```sh
git merge --no-ff session-28-a11y-audit
```

**Expected conflicts:**
- `src/app/faq/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/signin/page.tsx`
- `src/app/stories/page.tsx`

`src/app/layout.tsx` **auto-merges** cleanly — Session 27's
preconnect block and Session 28's skip-link are in different
regions of the head/body.

**Resolution:** take the latest rewrites (Session 20 for `/faq` +
`/stories`, Session 24 for the three auth pages), then re-apply
Session 28's `<main>` → `<div>` swap on top:

```sh
git checkout --ours \
  src/app/faq/page.tsx \
  src/app/forgot-password/page.tsx \
  src/app/reset-password/page.tsx \
  src/app/signin/page.tsx \
  src/app/stories/page.tsx

# Re-apply Session 28's main→div swap (no-op for the files that
# don't have <main> anymore, fixes the auth pages that do)
for f in src/app/faq/page.tsx src/app/forgot-password/page.tsx \
         src/app/reset-password/page.tsx src/app/signin/page.tsx \
         src/app/stories/page.tsx; do
  sed -i '' 's|<main |<div |g; s|<main$|<div|g; s|</main>|</div>|g' "$f"
done

git add \
  src/app/faq/page.tsx \
  src/app/forgot-password/page.tsx \
  src/app/reset-password/page.tsx \
  src/app/signin/page.tsx \
  src/app/stories/page.tsx
git commit --no-edit

rm -rf .next && npx tsc --noEmit && npx next build
```

**Why this resolution:** Session 28's intent on these files was
purely the nested-`<main>` cleanup. Sessions 20 and 24 rewrote
the page bodies completely. Combining = keep the rewrite, apply
the cleanup. The sed is idempotent — files that already use
`<div>` (Session 20's rewrites of `/faq` and `/stories`) are
unaffected; the three auth pages still on `<main>` get the swap.

**Note for macOS `sed`:** the `-i ''` syntax is BSD-style.
On Linux/CI, use `sed -i 's|...|...|g'` (no empty quotes).

### After all 7 merges: push main

```sh
git push origin main
```

### Merge 8: `session-26-legal-pages` — **DEFERRED**

Do **NOT** merge until Bangladesh counsel has reviewed every page
of the legal-page drafts. Each page in Session 26 carries a
`// LEGAL DRAFT` top-of-file comment + visible "Draft — pending
legal review" badge. The drafts will conflict with Session 20's
metadata-helper application of the same 5 legal pages
(`/privacy`, `/terms`, `/refund`, `/cookies`, `/safeguarding`).

**When ready to merge Session 26:**
- Session 26's hand-drafted content + LegalPageLayout component
  is the canonical version
- Session 20's helper-application gets superseded
- Resolution: `git checkout --theirs <5 legal page files>` then
  commit (or rebase Session 26 onto post-merge main)
- Remove the visible "Draft" badge on the legal pages after
  counsel sign-off

---

## Step 4 — consolidation-test branch (proof)

This branch on origin (`origin/consolidation-test`) shows that
the merge order above produces a clean build:

```
1babf58  Merge 'session-28-a11y-audit'
2df496d  Merge 'session-27-perf-audit'
947fe15  Merge 'session-20-tier1-content-pages'  (--ours for /about + /children)
7b64dd1  Merge 'session-17-children-list-wip'
253a7a3  Merge 'session-24-forgot-password'
8945d27  Merge 'session-23-dashboard-visual'
[FF]     session-25-error-pages
b2adf6a  Add NEXT_PUBLIC_* build args to Dockerfile  (main)
```

Plus one final `a1b89aa  refresh lockfile after merges` commit.

After all merges, the consolidated build:
- `tsc --noEmit` ✓
- `next build` ✓ — 45+ routes register
- 72 files changed from main

**`consolidation-test` is DISPOSABLE.** Do not merge it to main.
Do not base further work on it. After the real merges are
complete, delete it:

```sh
git push origin --delete consolidation-test
git branch -D consolidation-test
```

---

## Rollback procedure

If any merge breaks `main` after push:

### Option A — revert the last merge (preserves history)

```sh
git revert -m 1 <merge-commit-hash>
git push origin main
```

The `-m 1` flag tells git to revert to the first parent (main's
previous state). Each merge commit has two parents:
- parent 1 = main as it was before the merge
- parent 2 = the WIP branch tip

### Option B — hard reset to the last known good commit (destroys history; only do this in the first few minutes)

```sh
# Find the last good commit
git log --oneline main -10

# Reset and force-push
git reset --hard <good-commit>
git push --force-with-lease origin main
```

**Use Option A unless you're certain no one else has pulled.**

### Option C — emergency redirect to maintenance page

If a deployed build is broken and rollback will take too long:

```sh
# On the VPS, redirect all traffic to /maintenance via your
# reverse-proxy config (Cloudflare worker rule, NGINX rewrite,
# etc.). The /maintenance page is self-contained — see Session 25.
```

---

## Build verification checklist (run after EACH merge)

```sh
rm -rf .next
npx tsc --noEmit       # must exit 0
npx next build         # must complete with route list at the end
```

If `tsc --noEmit` fails with `Cannot find module '@sentry/nextjs'`
or similar dependency errors, run `npm install` first. This is
expected after merging Session 20 (which introduces Sentry) and
after Session 27 (which adjusts lockfile entries).

---

## Files touched summary (after all 7 merges)

72 files changed from `main`. Breakdown:

| Area | Count | Branches |
|---|---|---|
| New pages (contact / help / transparency / not-found / maintenance / offline) | 6 | 20, 25 |
| Rewritten pages (/about, /children, /how-it-works, /faq, /stories, /for-charities, /privacy* etc) | ~12 | 17, 20 |
| Brand-passed pages (/signin, /forgot-password, /reset-password) | 3 | 24 |
| Dashboard pages | 7 | 23 |
| Auth-page `<main>` → `<div>` cleanup | 13 | 28 |
| New shared components (BrowseChildCard, LegalPageLayout (DEFERRED), page-metadata helper) | ~5 | 17, 20 |
| Email components (brand pass) | 2 | 17 |
| Layout / SiteNav / SiteFooter / globals.css | 4 | 25, 27, 28 |
| Config (next.config, package.json, sentry.*.config.ts) | 6 | 20, 27 |
| Public asset cleanup (7 deletions) | 7 | 27 |
| Scripts (cleanup-legacy-null-schedule, diagnostic) | 3 | 17 |

---

## Open items requiring Mahmud's input post-merge

These are decisions called out across the ship reports of the
individual sessions. Listing them here so they don't get lost:

1. **Session 24 — Directus auth follow-ups**:
   - `PASSWORD_RESET_URL_ALLOW_LIST` in Directus env config
     includes the prod `https://orphangive.org/reset-password`?
   - Password-rule tightening (currently min-8 chars only;
     spec wanted "min 8 + letter + number" — needs Directus
     user-policy change)
   - Rate limit: spec wanted 3/hour per email; Directus default
     is 60s cooldown. Adjust `PASSWORD_RESET_RATE_LIMIT` if you
     want stricter.

2. **Session 22 — cleanup script**:
   `scripts/cleanup-legacy-null-schedule.mjs` is committed but
   not executed. Run `--dry-run` first, review the 30-row table,
   then `--confirm` if happy.

3. **Session 22 — Sentry activation**:
   Add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` to
   `/opt/orphangive/app.env` when ready. All Sentry config files
   no-op until the DSN is present.

4. **Session 27 — perf measurement**:
   Run `npx unlighthouse --site <prod-url>` after main is
   updated. Static analysis covered what could be measured
   without a browser; Lighthouse scores need a real run.

5. **Session 28 — contrast remediation**:
   White-on-tangerine CTAs fail WCAG AA (2.33:1). Pick:
   - Option A: switch CTA text to `ink` (5.91:1 passes)
   - Option B: darken `tangerine` background
   - Option C: treat CTAs as large-text only
   Plus body-link colour fix and "Sponsored monthly" badge fix.

6. **Session 26 — legal review**:
   Schedule Bangladesh-counsel walkthrough of all 5 legal page
   drafts before merging the branch. Operational SLAs
   throughout the drafts (refund timing, photo-takedown window,
   safeguarding response time) need ops-team confirmation.

7. **Session 26 — partnership email**:
   `partnerships@orphangive.org` referenced in `/contact` and
   the for-charities CTA. Confirm the mailbox exists or swap
   to `support@orphangive.org`.

---

## Cleanup after real merges land on main

```sh
# Delete the consolidation-test branch (local + remote)
git push origin --delete consolidation-test
git branch -D consolidation-test

# Delete the now-merged WIP branches (local + remote)
for b in session-17-children-list-wip session-20-tier1-content-pages \
         session-23-dashboard-visual session-24-forgot-password \
         session-25-error-pages session-27-perf-audit \
         session-28-a11y-audit; do
  git push origin --delete "$b"
  git branch -D "$b" 2>/dev/null
done

# Keep session-26-legal-pages until counsel review is complete.
```
