# P1.3 — child.first_name + child_proposal.first_name

## What this adds

A nullable `first_name` text column on both `child` and `child_proposal`. The
field is the **public name**: the only name rendered on Tier-1 surfaces
(homepage cards, /children browse, /children/[id] profile, OG title +
description).

`display_name` stays as the internal record name (admin / DI / dashboard
keep current behaviour).

## Why

The external pre-launch audit (docs/admin-os/07-safety-fix-plan.md, finding
B) confirmed that `display_name` is freeform and rendered on every public
surface. A DI typing "Adnan Khatun" instead of "Adnan" would leak the
surname to search-engine snippets, social previews, and every public card.

Splitting the public name into its own column removes the data-entry
discipline dependency. The codebase data layer projects `first_name` for
Tier-1 viewers and only includes `display_name` in the SQL response for
authenticated tiers.

## Apply

```
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/p1.3-child-first-name/001-add-first-name-fields.mjs
```

Or via Docker (prod):
```
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/migrations/p1.3-child-first-name":/m \
  node:22-alpine \
  node /m/001-add-first-name-fields.mjs
```

Idempotent. Skips fields that already exist. No backfill — existing rows
stay NULL on the new column. The data layer's fallback ("A child")
covers demo rows. Demo data is wiped at P1.0 before real uploads, so
backfill is unnecessary.

## Rollback

```
curl -X DELETE \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  $NEXT_PUBLIC_DIRECTUS_URL/fields/child/first_name
curl -X DELETE \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" \
  $NEXT_PUBLIC_DIRECTUS_URL/fields/child_proposal/first_name
```

This drops the column + value. Pair with `git revert <commit>` to undo
the data layer + form changes.
