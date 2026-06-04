# Task detail comments migration (`task_comment` + attachments)

Creates the internal admin↔DI comment thread for the task detail pages,
with image/PDF attachments. **Internal only — never donor-visible.**

The app code degrades gracefully until this runs: the comment thread
reads are wrapped so an absent collection renders an empty thread (the
detail pages still work). Posting a comment requires the collection, so
run this before relying on the thread.

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
