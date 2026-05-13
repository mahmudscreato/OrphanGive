# Directus email templates — VPS setup

Mahmud — apply this on the VPS during the next deploy. The
brand-aligned password reset email template is checked into the
repo at `directus-templates/email/password-reset.liquid`. For
Directus to actually use it, you need two changes to
`/opt/orphangive/docker-compose.yml` on the VPS.

These changes are NOT in any git branch — they're VPS-side
infrastructure config. Apply manually.

---

## Step 1 — mount the templates directory into the og-directus container

In `/opt/orphangive/docker-compose.yml`, find the `og-directus`
service block. Add the volume mount:

```yaml
  og-directus:
    # ... existing config ...
    volumes:
      # ... existing volumes ...
      - ./directus-templates:/directus/email-templates:ro
```

The `:ro` flag mounts read-only — Directus won't modify the
templates. Updates flow only via `git pull`.

---

## Step 2 — point Directus at the mounted directory

In the same `og-directus` service block, add the env var:

```yaml
  og-directus:
    # ... existing config ...
    environment:
      # ... existing env ...
      EMAIL_TEMPLATES_PATH: /directus/email-templates
```

---

## Step 3 — restart Directus

After saving `docker-compose.yml`:

```sh
cd /opt/orphangive
git pull origin main          # ensure directus-templates/ is present
docker compose up -d og-directus
```

`up -d` (without `--build`) recreates the container with the new
mount + env var without rebuilding the image. Directus reads the
templates at startup.

---

## Step 4 — verify

Trigger a password reset against any donor account. The email
should now render with:

- OrphanGive logo at top (Cloudinary-hosted SVG)
- Cream background (#FBF1E5), white card with rounded corners
- "Reset your password" heading in Georgia serif
- OG-orange (#ED8B3F) pill button
- printAgraphy credit in the footer

If the email looks unbranded (plain Directus default), the most
likely cause is the env var or volume mount not picking up.
Check:

```sh
docker compose exec og-directus env | grep EMAIL_TEMPLATES_PATH
docker compose exec og-directus ls /directus/email-templates/
```

---

## Customising the template later

The template lives at
`directus-templates/email/password-reset.liquid` in the repo.
To change it:

1. Edit the file
2. `git commit + push`
3. On VPS: `git pull` then `docker compose restart og-directus`
4. Trigger a password reset to verify

---

## TODO — fold this into OPS_RUNBOOK.md after Session 30 merges

Once `session-30-ops-docs` lands on main, add a "Customizing
the password reset email" section to `OPS_RUNBOOK.md` under the
"Email operations" heading. Suggested copy:

> **Customizing the password reset email**
>
> The password reset email is sent by Directus, not by the Next.js app. The template lives at `directus-templates/email/password-reset.liquid` in the repository, mounted into the og-directus container at `/directus/email-templates`.
>
> To change the template:
> 1. Edit `directus-templates/email/password-reset.liquid`
> 2. Commit + push
> 3. On VPS: `git pull` then `docker compose restart og-directus`
> 4. Test by triggering a password reset

After folding into OPS_RUNBOOK, this DIRECTUS_EMAIL_TEMPLATES_SETUP.md
file can be deleted (it covers the one-time VPS setup that
doesn't recur).

---

## Why a Liquid template instead of a React Email template

Directus 11 reads `.liquid` templates from `EMAIL_TEMPLATES_PATH`
and renders them server-side using the values it would otherwise
pass to its built-in default. The `{{url}}` placeholder is
Directus's own — it interpolates the password-reset URL Directus
generated during the request.

The OrphanGive React Email templates (`src/emails/`) are sent by
the Next.js app via Resend (welcome, receipts, contact-form
forwards, etc.). The password reset email is the one transactional
email Directus owns end-to-end — this Liquid template is the
right tool for that one path.
