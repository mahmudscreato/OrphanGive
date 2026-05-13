# Directus `form_submission` collection — schema setup

Mahmud — create this collection in Directus admin **before**
deploying Session 34. The `/api/contact` route writes a row to
`form_submission` after every successful (or attempted) form
submission. If the collection doesn't exist, those writes fail
silently (logged to stderr). The Resend email path still works,
so the user-facing flow doesn't break — but the audit trail in
Directus admin will be empty until the collection lands.

The Next.js code uses the standard `directus-admin` token so
Mahmud doesn't need to provision a new app token.

---

## Collection

| Field | Description |
|---|---|
| **Name** | `form_submission` |
| **Singleton** | No |
| **Hidden** | No |
| **Note** | "Public form submissions: contact, orphan referrals, volunteer applications. Newest first." |
| **Display template** | `{{submission_type}} — {{submitter_name}} ({{date_created}})` |
| **Sort field** | `date_created` (descending) |

## Fields

| Field name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | yes | auto | Primary key. |
| `submission_type` | string (dropdown) | yes | — | Values: `contact_general`, `orphan_referral`, `volunteer_application`. Use Directus's "Dropdown" interface so admin sees a select. |
| `status` | string (dropdown) | yes | `new` | Values: `new`, `in_progress`, `responded`, `closed`, `spam`. |
| `submitter_name` | string | yes | — | Whatever the user typed in the Name field. |
| `submitter_email` | string | yes | — | Whatever the user typed in the Email field. |
| `submitter_phone` | string | no | — | Volunteer form only; null for contact + orphan referral. |
| `subject` | string | no | — | For `contact_general`: the dropdown label ("Sponsorship question" etc). For `orphan_referral`: synthesised, e.g. `"Orphan referral: <child first name>"`. For `volunteer_application`: synthesised, e.g. `"Volunteer application: <name>"`. |
| `message` | text | no | — | The freeform message field. May be empty for orphan referral / volunteer (those have structured fields instead). |
| `payload_json` | JSON | yes | — | The complete submission payload. Includes the type-specific fields (orphan child details, volunteer skills array, etc). The single source of truth. |
| `admin_notes` | text | no | — | Internal-only — for the ops team to track follow-up. |
| `date_created` | datetime | yes | auto | System field. Automatically set by Directus on insert. |
| `date_updated` | datetime | yes | auto | System field. Automatically set on update. |

## Permissions

Use Directus admin's "Roles & Permissions" to set:

| Role | Create | Read | Update | Delete |
|---|---|---|---|---|
| **Public** | ✓ | ✗ | ✗ | ✗ |
| **Donor (authenticated)** | ✗ | ✗ | ✗ | ✗ |
| **Administrator** | ✓ | ✓ | ✓ | ✓ |

The Public CREATE permission is what allows the `/api/contact`
route to write rows using the unauthenticated public role
(server-to-Directus call still goes through Directus's auth, but
the public role is what executes the insert).

**Important:** Set Public CREATE permission to all fields EXCEPT
`status` and `admin_notes`. Those should be admin-only writable —
the public can only set the submission data, not the workflow
state.

## Indexes

For query performance once the table grows beyond a few hundred
rows:

- Index on `submission_type` (for filtering by form type)
- Index on `status` (for "what's new" queries)
- Index on `date_created` (already indexed by default in most
  Directus setups; verify)

In Directus admin, indexes are configured under **Settings →
Data Model → form_submission → [field] → Database Column → Index**.

---

## After creating the collection

1. Restart `og-directus` so it picks up the new schema:
   ```sh
   docker compose restart og-directus
   ```
2. Submit a test form on `/contact` (general) — verify a row
   appears in `form_submission` with `submission_type=contact_general`
3. Submit a test "I know an orphan" referral — verify
   `submission_type=orphan_referral` and the `payload_json`
   contains the `orphan` sub-object with the child fields
4. Submit a test volunteer application — verify
   `submission_type=volunteer_application` and `payload_json`
   contains `skills`, `availability`, etc

If a row doesn't appear:
- Check the Next.js app logs (`docker compose logs app | grep form_submission`)
- Verify the public role has CREATE permission on the collection
- Verify the collection name is exactly `form_submission` (not `form_submissions`)

---

## Why payload_json on top of the structured fields

Two reasons:

1. **Schema flexibility.** Form fields will evolve over time
   (e.g. when the volunteer form adds a "language preferences"
   checkbox). The `payload_json` field captures the full
   submission as it was, so we never lose data on schema drift.

2. **Audit completeness.** The structured fields surface the
   common cases for searching + filtering in admin. `payload_json`
   is the source of truth for the full original submission —
   useful for incident response or when answering a "what
   exactly did they submit" question.

---

## Reading rows from the admin panel

Navigate to **Content → form_submission** in Directus admin.
Sort defaults to newest-first. Use the **Filter** sidebar to
narrow by `submission_type` or `status`.

Common ops queries:
- All new contact-form messages: filter `status=new` AND
  `submission_type=contact_general`
- All orphan referrals from the last 30 days: filter
  `submission_type=orphan_referral`, sort by `date_created`
  descending
- All marked spam: filter `status=spam` (cleanup batch)
