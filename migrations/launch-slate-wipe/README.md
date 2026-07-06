# Launch-slate wipe — `wipe-launch-slate.sql`

Delete **all children** and **all Donor-role donors** EXCEPT an explicit keep-list,
plus every dependent row, children-before-parent, in one transaction. Clean slate
for launch. No schema/constraint change. **Founder runs it against `og-database`
(dry-run first); it was validated on a throwaway DB, not run against prod.**

## Keep-lists (hardcoded, editable at the top of the `.sql`)
- **KEEP children** (`child.id`): `bd07e2e8-…242`, `f6075c8c-…2f2`, `6cdff22b-…884`
- **KEEP donors** (email, Donor-role): `anik_jsr@ymail.com`, `asifmdhasan@gmail.com`,
  `childrens.hvn@gmail.com`, `muhammedrashid@gmail.com`, `ri.roseiqbal@gmail.com`

## The key rule (sponsorship is the shared node)
`sponsorship` references **both** `child` (SET NULL, **nullable**) and `donor`
(SET NULL, **NOT NULL**). A sponsorship is deleted if **either** its child **or** its
donor is deleted; it survives only if **both** are kept. Because `sponsorship.child`
is nullable, deleting a child alone would *orphan* the sponsorship (child→NULL) — so
sponsorships are deleted **explicitly** by the union `child ∈ del_child OR donor ∈ del_donor`.

## Safety properties
- **Only `role='Donor'` users are ever deletion candidates.** Administrators, Super
  Admins, and Data Inputters are never touched — this structurally protects
  `system@orphangive.org`, `public-site@orphangive.org`, `mahmuds.creato@` (Super
  Admin), and every DI. A HARD GUARD asserts `del_donor` contains only Donor-role rows.
- **HARD GUARD on keep-children:** if any of the 3 keep-ids doesn't resolve to a real
  `child` row (typo), the script **aborts** and names the offender — otherwise the child
  you meant to keep would fall outside protection and be deleted.
- **Dry-run by default** (counts + kept totals, then ROLLBACK). Real delete only with
  `-v confirm=DELETE`.
- **Transaction-wrapped, all-or-nothing.** Prints the live FK tree for `child` and
  `directus_users` so any unhandled table is visible; if one slips through, the final
  delete fails and the whole thing rolls back.
- `child_proposal` rows targeting a deleted child are **deleted** (not nulled), for a
  clean slate. `audit_log.actor` is **NOT NULL**, so deleted donors' audit rows are
  removed explicitly (a survivor's audit rows, by a non-deleted actor, are untouched).

## How to run (founder)
```bash
# DRY-RUN first (counts only, deletes nothing):
docker exec -i og-database psql -U directus -d directus \
  -v ON_ERROR_STOP=1 < wipe-launch-slate.sql

# EXECUTE for real (after reviewing the dry-run):
docker exec -i og-database psql -U directus -d directus \
  -v ON_ERROR_STOP=1 -v confirm=DELETE < wipe-launch-slate.sql
```

## Deletion order (leaves → root, one transaction)
`task_comment_attachment → task_comment → task → payment → report → aid_delivery →
donation → reveal_request → child_document → child_update → child_intake_photo →
child_moment → child_proposal → notification → cart_session → audit_log →
directus_sessions → sponsorship → child → directus_users`. Each delete is
`to_regclass`-guarded.

## Validation (throwaway Postgres 16, NOT og-database)
Stubbed the real FKs (incl. `sponsorship.child` NULLABLE + `sponsorship.donor` NOT NULL,
NOT-NULL child FKs, `audit_log.actor` NOT NULL), seeded 3 keep + 3 delete children,
5 keep + 2 delete donors, 1 Super Admin, 1 DI, and 4 cross-linked sponsorships
(both-kept, keep-donor→del-child, del-donor→keep-child, both-del):
- **dry-run** → correct per-table counts, ROLLBACK, nothing deleted; both-kept
  sponsorship (and its payment) excluded; `reveal_request=2` proves the union rule.
- **`-v confirm=DELETE`** → leaves-first deletes, no FK violation, COMMIT; survivors =
  3 keep children, 5 keep donors, Super Admin, DI, the both-kept sponsorship + its
  payment, a kept child's document, the Super Admin's audit row.
- **keep-id typo** → abort naming the bad id, nothing deleted.
- **non-Donor** never enters `del_donor` (role-filtered); Super Admin + DI survive.
