# OrphanGive — Schema Bootstrap

**Purpose:** Save the 60–90 minutes of clicking through Directus's UI to create 17 collections, all their fields, relations, roles, and seed content. This script does it all in roughly 30 seconds.

## When to run this

Run **after** §1.6 of the Build Plan (you can log in to Directus at `https://admin.orphangive.org`). Run **before** §1.10 (which would otherwise be the manual schema build).

## What it does

Idempotent — safe to run any number of times. Each phase logs:
- Phase 1: Creates 17 collections
- Phase 2: Creates fields on each collection (~120 fields total) plus 12 custom fields on the built-in `directus_users` collection
- Phase 3: Wires up 27 many-to-one relations
- Phase 4: Creates 5 roles (Admin, Data Inputter, Legal Guardian, Donor, Org Donor) — Super Admin is built in
- Phase 5: Seeds 8 donation buckets
- Phase 6: Seeds the founding tenant (Children's Heaven Trust)
- Phase 7: Seeds 4 sample add-ons (Eid clothes, supplies, medical, winter clothing)
- Phase 8: Seeds 7 starter site content entries (homepage hero, promise, faith quote, etc.)
- Phase 9: Seeds 4 starter FAQ entries

Anything that already exists is **skipped** (logged in grey).

## What it does NOT do

- Field-level permissions per role (e.g. donors only see public-safe fields on `child`). Directus's UI is the right place to refine these — it has a visual matrix for it.
- Email templates (configure via Directus → Settings → Project Settings → Email).
- Initial admin user (already created when Directus first started).

## How to run

This runs from your **laptop** (or any computer with Node 20+). It connects over the internet to your live Directus instance.

```bash
# 1. Make sure Directus is running and you can log in to the admin UI
#    at https://admin.orphangive.org

# 2. Install dependencies (first time only)
cd bootstrap
npm install

# 3. Configure
cp .env.example .env
# Edit .env: set DIRECTUS_URL, ADMIN_EMAIL, ADMIN_PASSWORD
# These are the SAME values from your Directus stack's .env file.

# 4. Run
npm run bootstrap
```

You'll see coloured output as each step runs. Greens are new, greys are already-exists, reds are errors.

## Partial runs

If you only want to (re-)apply schema changes without touching data:

```bash
npm run bootstrap:schema
```

If you only want to seed data (assuming schema is already in place):

```bash
npm run bootstrap:seed
```

## Verify it worked

After the script finishes:

1. Open Directus at `https://admin.orphangive.org`
2. Click **Content** in the left nav
3. You should see 17 collections in the sidebar
4. Click **Donation Bucket** — you should see 8 entries
5. Click **Settings → Roles & Permissions** — you should see 6 roles (Super Admin built-in + 5 new)

## Common problems

**`401 Unauthorized`** — your `ADMIN_EMAIL` / `ADMIN_PASSWORD` are wrong. Check your Directus stack `.env`.

**`ECONNREFUSED` or `getaddrinfo ENOTFOUND`** — `DIRECTUS_URL` is wrong, or Directus isn't running, or DNS hasn't propagated yet. Try the URL in a browser first.

**`Field already exists`** — fine, it's skipped. The script is idempotent.

**`A relation column already has a foreign key`** — happens if you run after a partial previous run. Delete the offending collection in Directus UI and re-run, or accept that the relation already exists.

**Anything else** — copy the full error and bring it back to chat.

## After running

1. Open Directus UI → **Settings → Roles & Permissions**
2. Click each new role (Admin, Data Inputter, etc.)
3. Configure their per-collection permissions visually. The Build Plan §1.11 is your reference for which role can read/write what.
4. Most importantly for the **Donor** role: on the `child` collection, set the read permission to allow public-safe fields **but block** every `*_encrypted` field. Click each field individually.

This refinement step is genuinely better done in the UI than in code — you can see the full permissions matrix and confirm visually.
