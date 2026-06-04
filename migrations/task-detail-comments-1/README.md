# Task detail comments migration (`task_comment` + attachments)

Creates the internal admin↔DI comment thread for the task detail pages,
with image/PDF attachments. **Internal only — never donor-visible.**

The app code degrades gracefully until this runs: the comment thread
reads are wrapped so an absent collection renders an empty thread (the
detail pages still work). Posting a comment requires the collection, so
run this before relying on the thread.

> **⚠️ v2 — fixes the integer-PK bug from the first run. If you already
> ran v1 in production, see [Repairing the broken production
> state](#repairing-the-broken-production-state) below — the corrected
> script self-heals the empty broken collections automatically.**

## Root cause of the v1 failure (and the fix)

The v1 `createCollection` called `POST /collections` **without a
`fields[]` array**. When no `fields[]` is given, Directus auto-scaffolds
a **default auto-increment INTEGER `id`** PK. The script's later explicit
uuid `id` field-add was then skipped (`fieldExists` → "exists"), so:

- `task_comment.id` came out **integer** (not uuid).
- `task_comment_attachment.comment` is **uuid**, intended to FK →
  `task_comment.id` — but uuid ≠ integer, so Postgres/Directus **rejected
  that foreign key (500)**. Attachments couldn't link to comments.
- The `file` FK worked because `directus_files.id` is uuid (types matched).

**The fix (v2):** `createCollection` now passes `fields: [PK]` (the uuid
PK) into `POST /collections`, exactly like the proven bootstrap pattern
(`bootstrap/src/v3-register-collections.ts`), which scaffolds
`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. With matching uuid ids,
the `comment → task_comment` FK is valid.

**Why uuid (not integer):** the app data layer (`src/lib/task-comments.ts`)
treats every id as a string (`CommentRow.id: string`, `m2oId` handling
`string | {id}`, the attachment grouping). uuid satisfies this with **zero
app-code changes**; an integer comment id would return a `number` and
break `m2oId`/grouping. uuid also matches every other PK in the schema
(`task`, `child`, `sponsorship`, …). The write path uses whatever id
Directus returns, so it never assumed uuid — only the read path did.

## What it creates

| Collection | Fields |
|---|---|
| `task_comment` | `id` uuid PK · `task` M2O→task (CASCADE) · `author` M2O→directus_users (SET NULL) · `author_role` varchar(8) `admin\|di` · `body` text · `created_at` timestamptz (date-created) |
| `task_comment_attachment` (junction) | `id` uuid PK · `comment` M2O→task_comment (CASCADE) · `file` M2O→directus_files (CASCADE) |

One comment → many attachments (junction rows). Attachments reuse the
existing Directus file store (uploaded via `uploadDocumentToDirectus`,
image/PDF only, 5 MB, EXIF-stripped).

## Internal-only / fail-closed

Like `safeguarding_report`, this migration grants **no Directus policy
access**. A new collection has zero permissions, so only the app's
full-access `DIRECTUS_SERVER_TOKEN` can read/write. App-side:
- admin routes gated by `requireAdminUser()`
- DI routes gated by `requireDiUser()` + the `getTaskForUser` scope guard
  (a DI can only touch a task assigned to them)

No donor route reads these collections. Attachment files are uploaded
with a "document upload" title marker, so the `/api/assets` proxy
classifies them **private** (session-gated) — see
`src/lib/asset-classifier.ts`.

`author` + `author_role` are always set server-side from the authed
session — never trusted from the client.

## Idempotency / safety

Re-runnable: collections and fields are probe-guarded (`GET /collections`,
`GET /fields`), relations treat a 400 as "already exists". **No
existing-data impact** — both collections are net-new.

## Repairing the broken production state

Production currently has the v1 half-state: both collections exist with
**integer** ids and the `comment → task_comment` FK missing. Both tables
are **empty (0 rows)**, so the corrected script repairs them
automatically — **no manual SQL needed**:

1. At the top of `main()`, for each collection it checks
   `GET /fields/<coll>/id`. If the id type is **not** `uuid` (the bug)
   **and** the collection is **empty** (`GET /items/<coll>?limit=1`), it
   **drops** the collection (`DELETE /collections/<coll>`) — junction
   first, then parent.
2. The corrected create path then remakes both with **uuid** PKs, and all
   relations (including `comment → task_comment`) are created cleanly.

It is **data-safe**: if a broken collection somehow has rows, it
**refuses to drop and aborts** (exit 1) rather than destroy data. On a
fresh DB or an already-fixed DB the repair step is a no-op.

So the founder simply **re-runs the corrected script** (same command as
[Run](#run)). Expected log lines:

```
repair task_comment_attachment   id is 'integer' + empty → dropping to recreate as uuid
drop task_comment_attachment     dropped
repair task_comment              id is 'integer' + empty → dropping to recreate as uuid
drop task_comment                dropped
collection task_comment          created (uuid PK)
...
relation task_comment_attachment.comment → task_comment   created   ← was FAIL 500 in v1
```

### Manual alternative (if you'd rather not auto-drop)

Drop the two empty collections yourself, then run the corrected script
(it will create them fresh):

```sql
-- Both are empty; this loses nothing.
DROP TABLE IF EXISTS task_comment_attachment;
DROP TABLE IF EXISTS task_comment;
DELETE FROM directus_collections WHERE collection IN ('task_comment_attachment','task_comment');
DELETE FROM directus_fields      WHERE collection IN ('task_comment_attachment','task_comment');
DELETE FROM directus_relations   WHERE many_collection IN ('task_comment_attachment','task_comment');
```

(Or via the Directus API: `DELETE /collections/task_comment_attachment`
then `DELETE /collections/task_comment`.) Then re-run the script.

## Run

```
# Local (with .env.local present in repo root):
export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
node migrations/task-detail-comments-1/001-create-task-comment.mjs

# Production (via docker since the host has no node):
cd /opt/orphangive
docker run --rm --network host \
  -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
  -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
  -v "$(pwd)/app/migrations/task-detail-comments-1":/m \
  node:22-alpine \
  node /m/001-create-task-comment.mjs
```

## Verify (post-run)

```sql
\d task_comment
\d task_comment_attachment
-- task_comment: task NOT NULL, author nullable, author_role, body, created_at.
-- task_comment_attachment: comment NOT NULL, file NOT NULL.

SELECT COUNT(*) FROM task_comment;            -- 0 before first post
```

In the app: open a task detail (admin or DI), post a comment with an
image + a PDF attachment, confirm it renders on both sides with the
correct author/role and that the attachments open + download.

## Rollback

```sql
DROP TABLE task_comment_attachment;
DROP TABLE task_comment;
DELETE FROM directus_collections WHERE collection IN ('task_comment_attachment','task_comment');
DELETE FROM directus_fields      WHERE collection IN ('task_comment_attachment','task_comment');
DELETE FROM directus_relations   WHERE many_collection IN ('task_comment_attachment','task_comment');
```
