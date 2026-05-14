# START HERE — OrphanGive Build Package

**Hi Mahmud.** This is your complete OrphanGive package. Everything you need to build the platform is in this one folder.

You're not behind. The puzzle feeling is normal — there are several documents and several folders, but they each have a clear, simple job. This file tells you what each one is for, and what to do **right now**.

---

## What's in this package — in plain English

```
orphangive-package/
│
├── START-HERE.md ← (you are reading this)
│
├── 1-documents/ ← reading material. Read in order.
│     ├── orphangive-master-plan-v3.md       (the big picture)
│     ├── orphangive-build-plan.md           (the technical plan)
│     └── session-1-walkthrough.md           (today's step-by-step)
│
├── 2-prototypes/ ← visual mockups. Open in browser.
│     ├── index.html        (start here — links to all 4 pages)
│     ├── 01-homepage.html
│     ├── 02-child-profile.html
│     ├── 03-donor-dashboard.html
│     └── 04-checkout.html
│
├── 3-vps-files/ ← three files that go onto the server.
│     ├── docker-compose.yml
│     ├── Caddyfile
│     └── .env.example
│
└── 4-bootstrap-script/ ← runs from YOUR LAPTOP, sets up Directus.
      ├── README.md
      ├── package.json
      ├── tsconfig.json
      ├── .env.example
      ├── .gitignore
      └── src/
            └── index.ts
```

---

## Two simple rules to keep things clear

**Rule 1 — Two computers are involved:**
- **Your laptop** (where you sit, where Claude Code runs)
- **The server** (a remote computer in Singapore that runs the OrphanGive system 24/7)

You'll switch between them several times. Whenever you're confused, the first question to ask is: **"Where am I — on my laptop or on the server?"**

**Rule 2 — One file at a time:**
Don't try to read everything before starting. The walkthrough tells you exactly when to open each thing. Just follow it line by line.

---

## What each folder is for, exactly

### Folder 1: `1-documents/`
**These are docs for you to read.**

- **orphangive-master-plan-v3.md** — the big-picture document. Explains what we're building, why, the data model, costs, phases. **Already read by you.** Reference whenever you forget the bigger plan.
- **orphangive-build-plan.md** — the technical plan. 3 parts: setting up Directus, building the public website, daily operations. You'll dip into this many times over the coming weeks.
- **session-1-walkthrough.md** — **THIS IS YOUR HOMEWORK.** It's the step-by-step guide for today. Stages 1–6. Open this and follow it line by line.

**Where to read these:** any document reader (your laptop's text editor, GitHub if you push them there, or a Markdown viewer like [stackedit.io](https://stackedit.io) — paste content and read it formatted).

### Folder 2: `2-prototypes/`
**These are the visual mockups of OrphanGive.**

Open `index.html` in any browser. You'll see a navigation page that links to four prototype pages: homepage, child profile, donor dashboard, checkout.

These are HTML files — they don't need a server, they run in your browser straight from your laptop. **Just double-click `index.html`.**

You'll use these later as visual reference when Claude Code builds the real Next.js website. They're already designed exactly how the final site should look.

**You don't need these for Session 1.** Save them for later.

### Folder 3: `3-vps-files/`
**These three files go onto the SERVER (the VPS), not your laptop.**

The Session 1 walkthrough tells you exactly when to copy them across. In summary:

- **docker-compose.yml** — defines the four programs that run on the server (database + cache + Directus + reverse proxy)
- **Caddyfile** — handles HTTPS/SSL automatically
- **.env.example** — template for your secret passwords. You'll copy this to `.env` on the server and fill in your real values.

**You will NOT install anything from this folder on your laptop.** You'll open these files on your laptop just to copy their contents, then paste them into the server's terminal.

### Folder 4: `4-bootstrap-script/`
**This script runs on YOUR LAPTOP** and remotely configures the Directus that's running on the server.

It creates 17 collections, 120 fields, 27 relations, 5 roles, and seed data — all in 30 seconds. Without this script, you'd spend 60–90 minutes clicking buttons in Directus.

You install this once on your laptop, run it once, never touch it again.

The walkthrough's Stage 6 covers running this script.

---

## What to do right now (the only thing)

**Open `1-documents/session-1-walkthrough.md`** in any text reader. That document is your single source of instructions for today.

Follow it from Stage 1 (buy the VPS) to Stage 6 (run the bootstrap script).

When that document tells you to use a file from `3-vps-files/` or `4-bootstrap-script/`, you'll know where to find it.

When you finish — when you can see 17 collections in Directus — come back to chat and tell me. Or send a screenshot.

---

## When you get confused (you will, that's fine)

There are only three things you need to remember:

1. **The walkthrough is your map.** When in doubt, return to `session-1-walkthrough.md` and find your last completed step.

2. **Tell me what you see.** If something doesn't match the walkthrough — a button is named differently, an error appears, a screen looks different — paste the exact words or take a screenshot. I'll help immediately. Don't waste an hour trying to figure it out alone.

3. **Take breaks.** This is a 3-hour journey. After Stage 2 (DNS), pause. After Stage 4 (Directus install), pause. After Stage 6, you're done for the day.

---

## Glossary — words I might use that could confuse you

- **VPS (Virtual Private Server)** — a remote computer you rent. Yours will be in Singapore.
- **Hostinger / hPanel** — the company you bought the VPS from, and their control panel.
- **Domain (orphangive.org)** — the human-friendly address. Already yours.
- **DNS** — the system that translates `orphangive.org` into the VPS IP address.
- **Docker** — software that runs other software in isolated boxes called "containers."
- **Directus** — the headless CMS that becomes your admin panel.
- **Caddy** — tiny program that handles HTTPS/SSL automatically.
- **Postgres** — the database where all data lives.
- **Bootstrap script** — a one-time program that sets up Directus's structure.
- **Browser terminal** — a black command-line window inside hPanel where you type instructions to the server.
- **Local terminal** — the same kind of window, but on your laptop.

---

## A note about pace

Don't try to do everything in one day. A reasonable plan:

- **Today (Day 1):** Stages 1–4 of the walkthrough (buy VPS, DNS, install Directus). Maybe 90 minutes.
- **Tomorrow (Day 2):** Stages 5–6 (log in, run bootstrap). Maybe 45 minutes.
- **This week:** Refine permissions in Directus UI. Invite team members.
- **Next week:** Configure Resend (email) and Cloudinary (file storage).
- **Week 3 onwards:** Start the public website with Claude Code. One prompt per session.

You're not behind anyone. There is no deadline except the one you set. Take care.

---

*Master start guide · OrphanGive build package · May 2026*

*Begin with `1-documents/session-1-walkthrough.md`.*
