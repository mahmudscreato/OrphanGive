# Dev setup

## Daily workflow

```sh
./scripts/dev-restart.sh
```

This is the single safe path to start (or restart) the dev environment.
Don't run bare `npm run dev` — it tends to leave orphan processes that
corrupt Turbopack's cache (see `docs/pre-launch-audit.md` if curious).

The script does:

1. Kills any prior `next dev` / `next-server` / `stripe listen`
   processes (yours or Claude Code's, regardless of who owns them).
2. Wipes the dev cache directories (`.next`, `node_modules/.cache`,
   `.turbo`).
3. Boots a single `npm run dev` instance, logs to `/tmp/og-dev.log`,
   waits for "Ready in" before continuing.
4. (If `stripe` CLI is installed and authenticated) spawns
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`,
   logs to `/tmp/og-stripe.log`.
5. Holds the foreground until Ctrl+C, which cleanly tears down both
   children via a SIGINT/SIGTERM trap.

Tail either log in another terminal:

```sh
tail -F /tmp/og-dev.log
tail -F /tmp/og-stripe.log
```

## Prerequisites

- **Node + npm** — installed via your usual route.
- **Stripe CLI** — required for webhooks to deliver to localhost.
  Without it, test checkouts succeed at Stripe but the success page
  hangs on "Still processing" because the activation webhook never
  arrives.

  ```sh
  brew install stripe/stripe-cli/stripe
  stripe login
  ```

  The script's preflight check warns if the CLI is missing or not
  authenticated and proceeds without it (Next dev still runs; non-
  checkout pages still work).

## Environment

`.env.local` keys (see existing file for the actual values):

```
NEXT_PUBLIC_DIRECTUS_URL
DIRECTUS_SERVER_TOKEN
NEXT_PUBLIC_SITE_URL=http://localhost:3000
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
INTERNAL_API_TOKEN
CLOUDINARY_CLOUD_NAME       # required for profile photo uploads
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

`NEXT_PUBLIC_SITE_URL` MUST point at `http://localhost:3000` for the
billing-portal return URL and other absolute-URL assemblies. If the
dev server falls back to :3001 because :3000 is held, post-checkout
redirects break — `dev-restart.sh` prevents this by killing port-3000
holders before booting.

## When something is wrong

Almost every "weird Turbopack error" is one of:

1. Two `next dev` processes racing on the cache → run `dev-restart.sh`.
2. `stripe listen` not running → ditto, or restart it manually.
3. Missing env var → check `.env.local` against the list above.
4. Schema drift in Directus (e.g. a unique constraint that shouldn't
   be there) → see `docs/pre-launch-audit.md`.

For anything else, tail the dev log first:

```sh
tail -F /tmp/og-dev.log | grep --line-buffered -E "Error|⨯|TypeError|500|donor-data"
```
