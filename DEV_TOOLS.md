# Developer-only tools

Mahmud — surfaces in this app that are gated behind
`NEXT_PUBLIC_DEV_TOOLS_ENABLED=true`. Anything in this file is for
local + staging use only. **Never enable in production.**

`.env.local.example` doesn't exist in this repo (and `.env*` is
gitignored), so the env vars need to be added manually to your
local `.env.local`.

---

## `NEXT_PUBLIC_DEV_TOOLS_ENABLED`

When set to the literal string `true`, the following routes become
reachable. When unset (or set to anything else), they all return
404 / "Not found".

Add to your local `.env.local`:

```
# Session 34 Part C — set to "true" to enable /dev/email-review and
# /api/dev/send-test-email. Leave unset for production.
NEXT_PUBLIC_DEV_TOOLS_ENABLED=true
```

Restart `next dev` after adding (Next.js doesn't pick up new env
vars on hot reload).

### Routes gated by this var

| Route | Purpose |
|---|---|
| `/dev/email-review` | UI page that previews every transactional email + has "Send to mahmud@printagraphy.com" buttons (per template + a "Send ALL"). |
| `/api/dev/send-test-email` (POST) | Backend the page calls. Accepts `{ template: "<id>" }` or `{ template: "ALL" }`. Recipient is hard-coded to `mahmud@printagraphy.com`. |
| `/api/dev/send-test-email` (GET) | Returns the registry of available templates (used by future tooling). |

### Why `NEXT_PUBLIC_*`

The prefix exposes the var to client code. We need that because
the gate is applied in both the server route handler (Node-side)
and the page component (server-rendered) — but if we ever want a
"dev tools enabled" indicator in a client island, the prefix lets
the client see it without an extra round-trip.

The downside is that the var name + value end up in the client
bundle. That's fine for this var — its presence isn't sensitive,
and the actual gate is still enforced on the server (the API route
checks `process.env.NEXT_PUBLIC_DEV_TOOLS_ENABLED` server-side).
Even if a malicious client tries to call the route with the var
spoofed in their bundle, the server-side check on the API route
is what actually blocks the send.

### Production safety

In production:
1. Don't set the env var. The route returns 404, the page returns
   404 via `notFound()`. Both behave as if they don't exist.
2. The Dockerfile build args (`NEXT_PUBLIC_*`) currently do NOT
   include `NEXT_PUBLIC_DEV_TOOLS_ENABLED`, so even an accidental
   prod-side `.env` won't bake the var into the build.
3. If a future CI ever needs a prod build with dev tools (don't),
   it would have to be added explicitly to the Dockerfile build args.

---

## Reviewing transactional emails — quick start

1. Set `NEXT_PUBLIC_DEV_TOOLS_ENABLED=true` in `.env.local`
2. Restart `next dev`
3. Visit `http://localhost:3000/dev/email-review`
4. Each template renders inline in an iframe (so styles don't leak
   into the host page). Below each preview is a "Send" button that
   ships it to `mahmud@printagraphy.com` via Resend, prefixed with
   `[TEST]` in the subject line.
5. The "Send ALL" button at the top fires every template
   sequentially with a 600 ms gap to stay under Resend's 2 req/sec
   free-tier rate limit.

The password reset email is NOT in this list — it's owned by
Directus (see `DIRECTUS_EMAIL_TEMPLATES_SETUP.md`), not Next.js.
The page renders an HTML preview of it for visual check, but to
trigger a real send, hit `/forgot-password` against any donor
account.

---

## TODO — fold into `OPS_RUNBOOK.md`

After Session 30 merges to main, fold this file's content into
`OPS_RUNBOOK.md` under a new "Developer-only routes" section, and
delete this file.
