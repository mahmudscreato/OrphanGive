# Session 58 — Donations system schema

Creates two new Directus-managed collections that drive the public
donation flows: donor-editable package presets and admin-controlled
FX rates.

| Collection | Purpose |
|---|---|
| `donation_package` | Editable monthly + one-time presets shown on `/sponsor/[childId]` and `/donate`. Lets Mahmud change amounts and copy without a deploy. |
| `currency_rate` | Per-currency BDT conversion rate, padded against FX swings. Source of truth for what donors see and what Stripe charges. |

## Apply path

Two equivalent ways:

### 1. Script (recommended; idempotent + repeatable)

```sh
# From repo root, with NEXT_PUBLIC_DIRECTUS_URL + DIRECTUS_SERVER_TOKEN
# loaded in your shell (the .mjs reads them from process.env).
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/session-58/001-seed-donation-tables.mjs
```

The script:
1. Skips any collection that already exists (safe re-run).
2. Creates the two collections via `POST /collections`.
3. Registers each field via `POST /fields/{collection}`.
4. Inserts seed rows (8 packages + 8 currency rates) **only if the
   collection is empty** so a re-run after admin edits does not
   clobber Mahmud's changes.
5. `POST /utils/cache/clear` at the end so the SDK + API see the new
   collections immediately.

### 2. Manual via Directus Admin UI (fallback / docs)

If the script fails (Directus unreachable, token rejected, etc.),
the field lists below are the spec to register through the Admin UI
at **Settings → Data Model → + Create Collection**, mirroring the
existing manual flow described in `migrations/README.md`.

## Collection: `donation_package`

Primary key: `id` (uuid).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | auto | PK |
| `package_type` | string (dropdown) | yes | `monthly` | One of `monthly`, `one_time` |
| `display_order` | integer | yes | `0` | ASC sort in UI |
| `is_active` | boolean | yes | `true` | Soft on/off |
| `name_en` | string | yes | — | English package name |
| `name_bn` | string | no | null | Bengali name (v2 i18n) |
| `description_en` | text | yes | — | English description |
| `description_bn` | text | no | null | Bengali description (v2 i18n) |
| `amount_bdt` | integer | yes | — | Base amount in whole BDT (e.g. `2000`) |
| `support_types` | json (array of strings) | no | `[]` | Subset of `child.support_type` enum: `education`, `food`, `healthcare`, `clothing`, `general_care`, `other`. Empty array allowed for one-time gifts that aren't child-scoped. |
| `cause_tag` | string | no | null | Free-form tag for one-time campaigns (e.g. `feed-a-child`, `winter-clothing`). Nullable on monthly. |
| `icon` | string | no | null | Lucide icon name (e.g. `BookOpen`, `Apple`) |
| `duration_months` | integer | no | null | **Added by 002.** Null = open-ended monthly subscription. Positive integer = prepaid bundle of N months as a single upfront charge. Only meaningful on `package_type = monthly`. |
| `date_created` | timestamp | auto | — | Directus special field |
| `date_updated` | timestamp | auto | — | Directus special field |

Permissions:
- **public** role: `read` (active rows are public info; UI filters by
  `is_active = true`).
- **administrator** role: full CRUD.

### Seed data — `donation_package`

**Monthly packages (4):**

| display_order | amount_bdt | name_en | description_en | support_types | icon |
|---|---|---|---|---|---|
| 1 | 2000 | Education Support | Covers tuition, books, school supplies, and uniforms. | `["education"]` | `BookOpen` |
| 2 | 3500 | Education + Nutrition | Adds nutritious daily meals to the education package. | `["education","food"]` | `Apple` |
| 3 | 5000 | Comprehensive Care | Education, nutrition, and health checkups for one child. | `["education","food","healthcare"]` | `Heart` |
| 4 | 8000 | Full Family Support | Comprehensive sponsorship including family-level support. | `["education","food","healthcare","general_care"]` | `Users` |

**One-time packages (4):**

| display_order | amount_bdt | name_en | description_en | cause_tag | icon |
|---|---|---|---|---|---|
| 1 | 1500 | Feed a child for a week | One week of nourishing meals for a child in care. | `feed-a-child` | `Utensils` |
| 2 | 3000 | Winter clothing | A warm jacket and winter essentials for the cold season. | `winter-clothing` | `Shirt` |
| 3 | 6000 | Emergency medical aid | Doctor's visit, medicine, and follow-up care. | `emergency-aid` | `Stethoscope` |
| 4 | 12000 | One month of full support | A single gift that covers a child for a full month. | `monthly-one-time` | `Calendar` |

Note: the brief's `support_types` value `nutrition` doesn't exist in
the current `child.support_type` enum — closest match is `food`.
`family` similarly maps to `general_care`. The script uses the
existing enum values so the array filter on `/children?support=` keeps
working without an enum extension.

## Collection: `currency_rate`

Primary key: `id` (uuid). Natural key: `currency_code` (unique).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | auto | PK |
| `currency_code` | string (3) | yes (unique) | — | ISO 4217 (`USD`, `GBP`, …) |
| `display_name` | string | yes | — | Human label (e.g. `US Dollar`) |
| `symbol` | string | yes | — | UI symbol (e.g. `$`, `£`, `৳`) |
| `bdt_per_unit` | decimal(10,2) | yes | — | How many BDT = 1 unit of this currency. For `BDT` itself: `1.00`. |
| `is_active` | boolean | yes | `true` | Soft on/off |
| `date_updated` | timestamp | auto | — | Directus special field |

Permissions:
- **public** role: `read`.
- **administrator** role: full CRUD.

### Seed data — `currency_rate`

Mahmud's placeholder padded rates; admin-adjustable post-launch.

| code | display_name | symbol | bdt_per_unit |
|---|---|---|---|
| BDT | Bangladeshi Taka | ৳ | 1.00 |
| USD | US Dollar | $ | 110.00 |
| GBP | British Pound | £ | 140.00 |
| SGD | Singapore Dollar | S$ | 82.00 |
| EUR | Euro | € | 120.00 |
| AUD | Australian Dollar | A$ | 72.00 |
| CAD | Canadian Dollar | C$ | 80.00 |
| INR | Indian Rupee | ₹ | 1.31 |

## Notes for code that reads these tables

- `amount_bdt` is **whole BDT** (integer, no paisa). To get the
  donor-facing amount in their currency, compute
  `Math.round(amount_bdt / rate.bdt_per_unit)` (rounded to whole
  units; for currencies with sub-units like USD, the display layer
  formats the integer as e.g. `$18`, not `$18.18`).
- Stripe charges go in the donor's currency. The smallest-unit
  conversion (USD → cents, JPY → yen, GBP → pence) is centralized
  in `src/lib/stripe-currency.ts`.
- All admin-side reads should bypass `is_active` so disabled
  packages remain editable. All public-site reads must filter
  `is_active = true`.

## Migration 002 — sponsorship extensions (Session 58.2)

`migrations/session-58/002-extend-sponsorship-and-package.mjs`.

### `sponsorship` collection changes

| Field | Change | Notes |
|---|---|---|
| `child` | Required → **nullable** | Campaign-style one-time donations (e.g. `feed-a-child`) aren't tied to a specific child. Both Directus `meta.required` + Postgres `NOT NULL` cleared. Existing rows are unaffected (all have `child` set). |
| `cause_tag` | **Added** — string, nullable, max 64 | Denormalized from `donation_package.cause_tag` at checkout time so "show me every feed-a-child gift" is a single-table filter. |
| `donation_package` | **Added** — M2O FK to `donation_package.id`, nullable | Records which preset the donor selected. Null for custom-amount donations. |
| `donor_currency_code` | **Added** — string(3), nullable | ISO 4217 of the currency the donor was actually charged in. Null on legacy rows. |
| `donor_currency_amount` | **Added** — decimal(10,2), nullable | Donor-facing amount (e.g. `14.00` for £14). |
| `bdt_per_unit_at_checkout` | **Added** — decimal(10,2), nullable | Snapshotted FX rate at checkout. If admin changes rates after a charge, the historic row keeps its original rate so finance reconciliation is deterministic. |

### `donation_package` collection changes

| Field | Change | Notes |
|---|---|---|
| `duration_months` | **Added** — integer, nullable | Null = open-ended monthly subscription. Positive integer N = prepaid bundle of N months as a single upfront charge. Only meaningful on `package_type = monthly`. |

### Seed addition

One prepaid-bundle example so the data path is exercised end-to-end:

| display_order | name_en | amount_bdt | duration_months | support_types |
|---|---|---|---|---|
| 5 | 12 months upfront — Education Support | 24000 (= 12 × 2000, no discount) | 12 | `["education"]` |

**No discount/savings copy anywhere.** Description: _"One year of education support, paid in full upfront. Single charge to your card."_ — the value is convenience + commitment, not price.

## Filed for follow-up (NOT in this migration)

- Bengali UI rendering — schema supports `name_bn` / `description_bn`
  but the v1 UI is English-only.
- Per-package illustration assets — v1 uses Lucide icons named in
  the `icon` column.
- Rate-history audit table — not needed for launch; capturing the
  effective rate per payment in Stripe metadata covers reconciliation.
