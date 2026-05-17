# Session 42 — DI Dashboard SETUP-LOCAL

One-time local-environment notes for the DI Dashboard shell. Subsequent
sessions (43–46) layer features on top; the env + auth wiring set up
here is permanent.

## Env vars

The DI Dashboard reuses two env vars already present in
`public-site/.env.local`:

| Var | Set already? | Used by |
|---|---|---|
| `NEXT_PUBLIC_DIRECTUS_URL` | ✓ (set; `http://localhost:8055` locally, `https://admin.orphangive.org` on VPS) | `src/lib/directus.ts`, `src/lib/directus-server.ts`, `src/lib/di-auth.ts` |
| `DIRECTUS_SERVER_TOKEN` | ✓ (set; static admin token) | `src/lib/directus-server.ts:getAdminDirectus()` and the v3 register-collections script |

**Deviation from Session 42 brief:** the brief asked for a new env var
`DIRECTUS_ADMIN_TOKEN`. The codebase already has `DIRECTUS_SERVER_TOKEN`
serving the same purpose (static-token Directus admin client for
server-side reads). Reusing it rather than introducing a parallel name.
If the brief's `DIRECTUS_ADMIN_TOKEN` ever needs to coexist (e.g.
narrower scope), the migration is one rename in `directus-server.ts`.

### How to verify the token works

```bash
# Should return JSON describing the local Directus instance:
curl -s -H "Authorization: Bearer $(grep '^DIRECTUS_SERVER_TOKEN' .env.local | cut -d= -f2)" \
  http://localhost:8055/users/me | head -c 200
```

If you get `{"errors":[{"message":"Invalid user credentials"}]}`, the
token is stale — regenerate via:

1. Open `http://localhost:8055/admin` and log in as the admin user
2. **Settings → Users → [your admin user]**
3. **Token** field → click the regenerate icon → copy the new token
4. Paste into `public-site/.env.local` as the value of
   `DIRECTUS_SERVER_TOKEN=...`
5. Restart `npm run dev` so Next.js re-reads the env

The token IS gitignored (`.env*` rule). Do NOT commit it.

## DI Dashboard auth model

- **Mechanism:** Directus session tokens (per spec v3, NOT Better Auth
  which is for donors).
- **Cookies:** `di_access_token` + `di_refresh_token` — distinct from
  donor cookies (`directus_access_token`, `directus_refresh_token`).
  This avoids cross-pollination if a single browser session ever has
  both a donor and a DI logged in.
- **Login URL:** `http://localhost:3000/di/login`
- **Test user:** `data_in@input.com` (id `07b55095-d316-43b2-869e-8e6b6116a172`),
  role `Data Inputter` (id `156606ee-08ff-4d4a-abd1-be266d095d76`).
  Created during the C1 bootstrap; password is whatever you set there.
  Reset via Directus admin if forgotten.

## DI Dashboard URL layout (Session 42)

| Path | Auth | Purpose |
|---|---|---|
| `/di/login` | public | Login form |
| `/di` (route group `(authed)`) | required | Home/Overview |
| `/api/di/login` | public | POST email+password → sets cookies |
| `/api/di/logout` | required | POST → clears cookies + Directus logout |
| `/api/di/me` | required | GET current DI user metadata |

Sessions 43–46 layer additional `/di/*` pages onto the `(authed)` route
group + additional `/api/di/*` routes onto the same auth pattern.

## Smoke test (post-Session-42)

1. `npm run dev` from `public-site/`
2. Open `http://localhost:3000/di` → should redirect to `/di/login`
3. Log in as `data_in@input.com` (Test Data Inputer)
4. Home should render: greeting, 4 stat tiles (children/tasks/submissions/reports),
   4 quick action cards
5. Resize to mobile (≤768px) — bottom nav should appear, sidebar should disappear
6. Click Sign out (sidebar bottom on desktop) → should clear cookies + redirect to login

## What's NOT set up yet

- No production deployment of the DI Dashboard (Sessions 41-v3 + 42–46
  all branch-only; batch deploy after 46 review)
- No mobile-app build (the dashboard is responsive web, not native)
- No password-reset flow for DI accounts (admin-managed; if a DI forgets,
  admin resets via Directus admin UI)
