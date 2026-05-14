# OrphanGive — Session 1: First Build (Step-by-Step)

**Goal of this session:** Go from nothing to a working Directus admin panel running at `https://admin.orphangive.org` with all 17 collections, fields, relations, and seed data already in place.

**Time:** Roughly 3 hours, broken into 6 stages. Take breaks. Don't try to do this all at once if you're tired.

**What you need before starting:**

- Your laptop or desktop computer (any Mac, Windows, or Linux)
- A credit/debit card to buy the Hostinger VPS
- Your Hostinger account login (you mentioned the domain is already there)
- A password manager (1Password, Bitwarden, Apple Keychain — anything reliable). You will create three strong passwords today and you must not lose them.
- Roughly 2 GB of free disk space on your laptop (for Node.js + the bootstrap project)
- A web browser (Chrome, Safari, Firefox, anything modern)
- The two folders I gave you, downloaded somewhere you can find:
  - `directus-stack/` — has `docker-compose.yml`, `.env.example`, `Caddyfile`
  - `bootstrap/` — has the schema bootstrap script

**Important mindset:** when something looks confusing or doesn't match this guide exactly, **stop and ask in chat**. Don't guess. Hostinger's UI changes occasionally, and so does Directus, so if a button is named slightly differently, just describe what you see.

---

## Stage 1 — Buy and provision the VPS (15 minutes)

### 1.1 Sign in to Hostinger

Open your browser, go to `https://hpanel.hostinger.com`, sign in.

You'll land on hPanel — Hostinger's control panel.

### 1.2 Buy the VPS

In the left sidebar, click **VPS**. (If you don't see it: top nav → Hosting → VPS.)

Click **Order VPS** or **Get VPS Hosting**.

You'll see plans laid out. Pick **KVM 2**.

The specs you should see:
- 2 vCPU cores
- 8 GB RAM
- 100 GB NVMe disk
- 8 TB bandwidth
- Roughly $7–9 USD per month, or $80–95 per year if you pay annually

**Choose the annual plan** if you can — it's significantly cheaper, and we're committing to this for at least a year.

Click **Add to Cart** → **Continue to Payment**.

Pay. The next page is the configuration wizard.

### 1.3 Configure the VPS

You'll see a screen asking about location, operating system, and root password.

**Server location:** pick the one nearest to your audience. For Bangladesh, **Singapore** or **India (Mumbai)** is best. Network ping from Dhaka to Singapore is ~50ms — feels instant. Avoid US/Europe locations — they'll feel slower.

**Operating system / template:** look for the **Applications** or **OS with Applications** section. Find **Docker** (it might be listed as "Docker — Ubuntu 22.04" or similar). Pick that one.

> Why Docker? Our entire stack runs in Docker containers. Picking the Docker template means Hostinger pre-installs Docker for us, saving 10 minutes of setup.

**If Docker isn't offered:** pick plain **Ubuntu 22.04 LTS**. We'll install Docker manually in Stage 2 — it adds maybe 5 minutes.

**Hostname:** type `orphangive-vps` (or anything you like — it's just a name).

**Root password:** click **Generate strong password**. **Copy it immediately into your password manager** under the entry name "OrphanGive VPS root". Label it clearly — you will need this several times today.

Click **Save** or **Set up VPS**.

The provisioning screen now shows. Hostinger is creating your server. **This takes 3–5 minutes.** When it finishes, you'll see your VPS listed with:

- A green status indicator
- An **IPv4 address** (looks like `203.0.113.45` — four numbers separated by dots)
- A **panel URL** for managing the VPS

**Copy the IPv4 address into your password manager** under the entry name "OrphanGive VPS IP". You'll need it in the next stage.

---

## Stage 2 — Point the domain to the VPS (10 minutes + waiting)

### 2.1 Open the DNS editor

In hPanel's left sidebar, click **Domains** (not VPS — Domains).

Find `orphangive.org` in your list. Click it.

In the domain's management screen, look for **DNS / Nameservers** or **DNS Zone** in the sidebar. Click it.

You'll see a table of DNS records. There may already be some default entries (a parking page A record, MX records for email, etc.).

### 2.2 Add three A records

We need three records — all pointing to your VPS IP — so that:
- `orphangive.org` (the bare domain) → public website (built later)
- `www.orphangive.org` → public website
- `admin.orphangive.org` → Directus admin panel

Click **Add Record** (or **+ Add new record**).

**Record 1:**
- Type: `A`
- Name (or Host): `@` (the `@` symbol means "the bare domain itself")
- Points to (or Value): your VPS IP address
- TTL: leave default (usually 14400 or "Auto")

Click **Add** or **Save**.

**Record 2:**
- Type: `A`
- Name: `www`
- Points to: same VPS IP
- TTL: default

Click **Add**.

**Record 3:**
- Type: `A`
- Name: `admin`
- Points to: same VPS IP
- TTL: default

Click **Add**.

> If a previous A record exists for `@`, `www`, or `admin` pointing somewhere else (e.g. a Hostinger parking page), edit it instead of adding a duplicate. Change the "Points to" value to your VPS IP.

### 2.3 Delete any conflicting records

Look through the list for any A or AAAA records that might conflict — in particular, any other entry for `@`, `www`, or `admin`. If you see them, delete them.

Don't touch:
- MX records (email routing — leave alone)
- NS records (nameservers — leave alone)
- TXT records (verification/SPF — leave alone)

### 2.4 Wait for DNS propagation

DNS changes take 15 minutes to 2 hours to propagate globally. You don't have to wait idle — you can continue with Stage 3 immediately. We'll only need DNS to be working by Stage 5.

**To check progress:** open a new tab, go to `https://dnschecker.org`. Type `admin.orphangive.org` and click Search. When most of the world map shows green checkmarks pointing at your VPS IP, propagation is done.

---

## Stage 3 — First connection to the VPS (10 minutes)

### 3.1 Open the browser terminal

In hPanel, go back to **VPS**, click your VPS.

In the VPS management screen, look for **Browser Terminal** (it might be under "Tools" or in the top tab bar).

Click it.

A black terminal window opens inside your browser. You're already logged in as `root`. You'll see a prompt that looks like:

```
root@orphangive-vps:~#
```

That `#` at the end is the cursor — it's where you type.

### 3.2 First commands — confirm Docker is installed

Type the following and press Enter:

```bash
docker --version
```

You should see something like `Docker version 24.0.7, build afdd53b`.

```bash
docker compose version
```

You should see something like `Docker Compose version v2.21.0`.

**If both commands work, skip ahead to step 3.3.**

**If you get "command not found":** Docker isn't installed. Run this single command (copy-paste the whole thing):

```bash
curl -fsSL https://get.docker.com | sh
```

Wait 2-3 minutes. When done, run `docker --version` again to confirm.

### 3.3 Create the working folder

```bash
cd /opt
mkdir orphangive
cd orphangive
pwd
```

The last command (`pwd`) prints your current location — should say `/opt/orphangive`. Good.

```bash
ls
```

This shows the folder is empty. Good.

---

## Stage 4 — Install Directus (25 minutes)

This is where we put the three configuration files in place and start the stack.

### 4.1 Create the docker-compose.yml file

In the browser terminal, type:

```bash
nano docker-compose.yml
```

A text editor called **nano** opens inside the terminal. The screen is empty with a status bar at the bottom showing nano commands.

**Now switch to your laptop:** open the `directus-stack/docker-compose.yml` file I gave you, in any text editor (TextEdit on Mac, Notepad on Windows, VS Code if you have it).

**Select all** the contents of that file (`Ctrl+A` on Windows, `Cmd+A` on Mac), then **Copy** (`Ctrl+C` / `Cmd+C`).

**Switch back to the browser terminal**, then paste:
- On Windows: right-click in the terminal, or press `Ctrl+Shift+V`
- On Mac: `Cmd+V`

You should see all the YAML content appear in nano.

**Save and exit nano:**
1. Press `Ctrl+O` (the letter O, not zero) — nano prompts "File Name to Write"
2. Press `Enter` to confirm
3. Press `Ctrl+X` to exit

You're back at the terminal prompt.

Verify:

```bash
ls
```

You should see `docker-compose.yml`. Good.

```bash
cat docker-compose.yml | head -10
```

This shows the first 10 lines of the file — confirms the contents copied correctly.

### 4.2 Create the Caddyfile

```bash
nano Caddyfile
```

Same process as before:
- Open `directus-stack/Caddyfile` on your laptop
- Copy all contents
- Paste into nano
- `Ctrl+O`, `Enter`, `Ctrl+X`

Verify:

```bash
cat Caddyfile | head -5
```

### 4.3 Create the .env file

This is the most important file — it has your secrets.

```bash
nano .env
```

Paste in the contents of `directus-stack/.env.example` from your laptop.

**Now we need to fill in the placeholders.** Don't exit nano yet — we're going to edit the values in place.

### 4.4 Generate KEY and SECRET values

These are random secret strings. Open a **second tab** in your browser, go back to the VPS browser terminal so you have two terminal windows open. Or open a separate browser terminal session via hPanel.

In the second terminal, run:

```bash
openssl rand -hex 32
```

This prints a 64-character random string. Example output: `a3f8c2d9e7b1f4a6d8c3e9b2f5a7c4d6e8b1f3a5c7d9e2b4f6a8c1d3e5b7f9c2`.

**Copy that string.**

Switch back to your **first** terminal (where nano is open with `.env`).

Find the line `KEY=replace-with-output-of-openssl-rand-hex-32` and replace the placeholder with the string you just generated. Use nano's arrow keys to navigate, delete the placeholder text, and paste the new value.

**Switch to the second terminal**, run `openssl rand -hex 32` again to get a *different* random string for SECRET.

Back in the first terminal (nano), replace the SECRET placeholder.

### 4.5 Set the admin email and password

In `.env`:

- `ADMIN_EMAIL=mahmud@orphangive.org` — change to **your real email**, the one you'll use to log in. (This doesn't need to be at orphangive.org yet — use any email you can read mail from.)
- `ADMIN_PASSWORD=use-a-strong-password-from-a-password-manager` — create a strong password in your password manager (16+ characters, mixed case, numbers, symbols), save it under "OrphanGive Directus Admin", then paste it here.

### 4.6 Set the database password

- `DB_PASSWORD=use-another-strong-password` — generate another strong password, save under "OrphanGive Postgres", paste here.

This password is internal — only Directus uses it to talk to the database. You'll rarely need it again, but save it anyway.

### 4.7 Set the public URL

- `PUBLIC_URL=https://admin.orphangive.org` — keep as is. This is the URL where Directus will be accessible.

### 4.8 Email — leave for later

For now, leave these as they are:
- `EMAIL_FROM=OrphanGive <hello@orphangive.org>` — keep
- `RESEND_API_KEY=re_your_resend_api_key_here` — keep the placeholder. Directus will start fine without real email; we'll wire up Resend in a later session.

### 4.9 Storage — leave as local for now

The `STORAGE_LOCATIONS=local` line means Directus stores uploaded files on the VPS itself. We'll switch to Cloudinary later. Leave it as `local`.

### 4.10 Save and exit

`Ctrl+O`, `Enter`, `Ctrl+X`.

Verify the file looks correct (without exposing secrets):

```bash
grep -v "^#" .env | grep -v "^$"
```

This prints all non-empty, non-comment lines. Confirm:
- KEY has a real long random string (not the placeholder)
- SECRET has a different long random string
- ADMIN_EMAIL is your real email
- ADMIN_PASSWORD is a long string
- DB_PASSWORD is a long string

If any of these still say "replace-with..." you missed one. Re-edit with `nano .env`.

### 4.11 Start the stack

Drum roll. In the terminal:

```bash
docker compose up -d
```

What this does:
- Reads `docker-compose.yml`
- Downloads four images: Postgres, Redis, Directus, Caddy (~500 MB total — takes 2–5 minutes the first time)
- Starts all four containers
- The `-d` flag means "run in the background"

You'll see a lot of output — lines like `Pulling postgres`, `Pulling directus`, etc., with progress bars. Eventually:

```
✔ Container og-database  Started
✔ Container og-cache     Started
✔ Container og-directus  Started
✔ Container og-caddy     Started
```

Don't celebrate yet — the containers have started but Directus needs ~60 seconds to set up its database tables on first run.

### 4.12 Watch Directus initialise

```bash
docker compose logs -f directus
```

You'll see Directus's startup log streaming. Watch for these lines:

```
[hh:mm:ss] [info] Database is up to date
[hh:mm:ss] [info] Server started at http://0.0.0.0:8055
```

When you see "Server started at http://0.0.0.0:8055", Directus is ready.

Press `Ctrl+C` to exit the log view (the server keeps running in the background).

### 4.13 Wait for Caddy to get SSL certificate

```bash
docker compose logs caddy
```

Look for lines about Let's Encrypt and certificates. The first time, Caddy talks to Let's Encrypt to get an SSL certificate for `admin.orphangive.org`. **This requires DNS to be propagated** — if it hasn't propagated yet, Caddy will fail and retry.

Look for either:

✓ Success: `certificate obtained successfully` for `admin.orphangive.org`

✗ Failure: `unable to solve challenge` or `no such host`

**If you see failures:** DNS hasn't fully propagated. Wait 30 minutes, then run:

```bash
docker compose restart caddy
docker compose logs caddy
```

Caddy retries automatically every few minutes anyway, so often the fix is just patience.

---

## Stage 5 — First login to Directus (5 minutes)

### 5.1 Visit the admin URL

In your browser, go to:

```
https://admin.orphangive.org
```

What you should see:
- A green padlock in the address bar (SSL is working — thanks Caddy)
- The Directus login screen — clean, dark by default, with email and password fields

If you see a warning about "Connection not private" or "SSL error":
- DNS isn't propagated yet, or
- Caddy hasn't fetched the certificate yet

Wait 15 minutes and retry. Don't click through the warning — fix the underlying issue first.

If the page just doesn't load at all:
- Check `docker compose ps` in the terminal — all four containers should show "running" status
- Check `docker compose logs caddy` for errors

### 5.2 Log in

Email: the `ADMIN_EMAIL` from your `.env` (your real email).

Password: the `ADMIN_PASSWORD` from your `.env`.

Click **Sign In**.

You're in. You'll see Directus's dashboard — it's empty for now. The left sidebar has icons for Content, User Directory, File Library, Settings.

### 5.3 Quick configuration

Click **Settings** (gear icon, bottom left).

In Settings → **Project Settings**:
- Project Name: `OrphanGive`
- Project Color: pick the orange (`#F39322`)
- Save

Click **Settings** → **Project Settings** → upload the `logo-mark.png` file as the project logo (this is the figure-only version of your logo).

Now log out (top right user icon → Sign Out) and log back in. You should see the OrphanGive name and logo in the top corner. Subtle, but it confirms everything is working.

---

## Stage 6 — Run the bootstrap script (30 minutes)

This is where we go from "empty Directus" to "fully configured Directus with all collections, roles, and seed data."

The script runs from **your laptop**, not from the VPS. It connects over the internet to your live Directus.

### 6.1 Install Node.js on your laptop

You probably already have Node from using Claude Code, but let's confirm.

Open a terminal on your laptop:
- Mac: Spotlight → "Terminal"
- Windows: Start menu → "Command Prompt" or "PowerShell"
- Linux: any terminal

Type:

```bash
node --version
```

If you see `v20.x.x` or higher (e.g. `v20.11.0`), you're set. Skip to 6.2.

If you see `v18.x.x` or `v16.x.x`, that's too old — upgrade.

If you see "command not found," install Node:
- Easiest: go to `https://nodejs.org`, download the LTS version, run the installer.
- After install, **close and reopen your terminal**, then run `node --version` again.

### 6.2 Open the bootstrap folder

Find the `bootstrap/` folder I gave you on your laptop. It contains:
- `package.json`
- `tsconfig.json`
- `.env.example`
- `.gitignore`
- `README.md`
- `src/index.ts`

In your terminal, navigate to that folder. For example, if it's on your desktop:

```bash
cd ~/Desktop/bootstrap
```

(On Windows: `cd C:\Users\YourName\Desktop\bootstrap`)

Verify you're in the right place:

```bash
ls
```

You should see those six files (or however your OS lists them).

### 6.3 Install dependencies

```bash
npm install
```

This downloads the libraries the script uses (Directus SDK, dotenv, tsx, TypeScript). Takes 30–90 seconds and creates a `node_modules` folder. It's normal to see a lot of output and possibly a few warnings — those are fine.

When it finishes, you should see something like `added 234 packages in 45s`.

### 6.4 Configure the script

```bash
cp .env.example .env
```

(On Windows Command Prompt: `copy .env.example .env`)

Now edit `.env`:
- Mac/Linux: `nano .env` or open in any text editor
- Windows: open `.env` in Notepad

Set these three values:
- `DIRECTUS_URL=https://admin.orphangive.org`
- `ADMIN_EMAIL=` your real email (same as the Directus admin)
- `ADMIN_PASSWORD=` the Directus admin password (same as in your VPS `.env`)

Save and close.

### 6.5 Run the bootstrap

The moment of truth.

```bash
npm run bootstrap
```

You'll see colourful output streaming by. The script does this:

1. **Logs in to Directus** — confirms credentials work
2. **Phase 1: Collections** — creates 17 collections, each line shows a green ✓
3. **Phase 2: Fields** — creates ~120 fields, one per line, mostly green ✓
4. **Phase 2b: directus_users custom fields** — extends the built-in user collection
5. **Phase 3: Relations** — wires up 27 relations
6. **Phase 4: Roles** — creates 5 new roles
7. **Phase 5–9: Seed data** — adds 8 donation buckets, 1 tenant, 4 add-ons, 7 site copy entries, 4 FAQs

The whole script takes 30–60 seconds.

At the end you'll see:

```
=== Bootstrap complete. ===
```

with a list of next steps.

### 6.6 If something goes wrong

**`401 Unauthorized`** — your `ADMIN_EMAIL` or `ADMIN_PASSWORD` in `bootstrap/.env` is wrong. Triple-check they match the values in your VPS `.env` exactly.

**`getaddrinfo ENOTFOUND admin.orphangive.org`** — DNS hasn't propagated, or Directus isn't running. First, can you log into `https://admin.orphangive.org` in your browser? If not, the issue is DNS or Directus, not the script.

**`Error: Field "xxx" already exists`** — this is fine. The script logs it as `(exists, skipped)` in grey. It happens if you've run the script before.

**Anything else** — copy the full error from the terminal and bring it back to chat. Don't try to debug alone.

### 6.7 Verify in Directus

Open `https://admin.orphangive.org` in your browser. Refresh the page if it's already open.

In the left sidebar, click **Content**.

You should now see 17 collections listed:
- Addon
- Child
- Child Document
- Child Update
- Contact Submission
- Donation
- Donation Bucket
- FAQ
- Notification
- Report
- Reveal Request
- Site Content
- Site Page
- Sponsorship
- Story
- Tenant

Click **Donation Bucket** — you should see 8 entries (Monthly child sponsorship, One-time gift to sponsored child, Clothing gift, Educational supplies, Eid & Ramadan campaign, Medical emergency fund, OrphanGive running costs, General fund).

Click **FAQ** — you should see 4 starter questions.

Click **Site Content** — 7 starter copy entries.

Click **Settings → Roles & Permissions** — you should see 6 roles: Administrator (Super Admin), Admin, Data Inputter, Legal Guardian, Donor, Org Donor.

Everything's there. **You now have a fully configured admin panel.**

---

## What you've achieved today

In one session, you've built:

- A real Linux server in Singapore, owned by you
- DNS pointing your domain at it
- A production-grade web stack with auto-SSL (Postgres + Redis + Directus + Caddy reverse proxy)
- A complete data model with 17 collections, 120 fields, 27 relations
- 6 roles configured (with permissions still to refine)
- Sample data so you can immediately start exploring

Total monthly cost so far: ~$7 (the VPS). Everything else is free open-source software.

---

## What's next (not today, but soon)

**Refine field-level permissions** — Settings → Roles & Permissions → click each role → set per-collection permissions. The Build Plan §1.11 has the matrix. This is genuinely best done in the visual UI, takes 30–45 minutes. Do it in your next session.

**Invite your team** — User Directory → Invite User. Add your CH Trust admin team and data inputters with appropriate roles. They'll get email invitations to set their passwords. (Note: invitations require email to be working — see next item.)

**Configure Resend for email** — Build Plan §1.8. Sign up for Resend, verify your domain, generate an API key, paste into your VPS `.env`, restart Directus. This unlocks invitation emails, password resets, and donor notifications.

**Configure Cloudinary for file storage** — Build Plan §1.7. Sign up, get credentials, update the VPS `.env`, restart. Photos and documents now go to Cloudinary instead of the VPS disk.

**Apply for SSLCommerz** — Build Plan §1.9. Start the application; takes 1–2 weeks of approval.

**Start the public website build** — Open Claude Code in a new project folder, paste Prompt 1 from the Build Plan §2.3.

---

## How to think about pacing

You don't need to do all of the above this week. A reasonable pace:

- **This week:** finish today's session, take a break, come back tomorrow to refine permissions and invite your team
- **Next week:** Configure Resend, Cloudinary, start data entry on real children
- **Week 3 onwards:** start Claude Code prompts for the public website (Prompts 1, 2, 3 in week 3; one prompt per session at most)

Treat this like a marathon. The system will exist whether you build it in 12 weeks or 20. What matters is the children behind it being protected and well-represented when launch happens.

---

## When you get stuck

The single most important habit: **paste the exact error or describe exactly what you see, into chat with me.** Don't paraphrase. Don't try to fix it alone for hours. The fastest path to a working system is good error messages reaching me.

Common stuck moments and what to do:

| Symptom | First thing to try |
|---|---|
| DNS not resolving | Check `dnschecker.org`, wait |
| SSL warning in browser | Wait 15 min, restart Caddy |
| `docker compose up` fails | Run `docker compose logs` and paste output |
| Can't log in to Directus | Verify `ADMIN_EMAIL`/`ADMIN_PASSWORD` in VPS `.env` |
| Bootstrap script errors | Verify `.env` values in bootstrap folder |
| Anything weird | Stop, paste it in chat |

---

## End of Session 1

When you've finished Stage 6 successfully, take a screenshot of your Directus content panel (showing the 17 collections) and send it. It'll mark the moment, and it'll let me confirm everything's healthy before you move on.

Good luck. Take it stage by stage. There's no rush.

— *Session 1 walkthrough · May 2026*
