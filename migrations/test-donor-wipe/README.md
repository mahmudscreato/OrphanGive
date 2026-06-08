# Test-donor wipe — `wipe-test-donors.sql`

Safely delete **explicitly-listed TEST donors** and all their dependent rows from
the OrphanGive DB, in correct FK dependency order. Launch demo-data cleanup.

**Why a script:** Directus can't delete a donor directly —
`null value in column "donor" of relation "sponsorship" violates not-null constraint`.
Donor FKs default to `ON DELETE SET NULL`, but `sponsorship.donor` (and others) are
`NOT NULL`, so the delete fails. The constraint is **correct** (it protects real
financial records). We work *with* it by deleting children-before-parent in one
transaction. **No schema/constraint change.**

## Safety properties
- **Targets only the emails you list** in the `_target_donor_emails` VALUES block at
  the top of the `.sql`. Never a blanket "delete all donors".
- **Donor-role only.** If any listed email maps to a non-`Donor` user (admin/DI/
  guardian), the script **aborts** and deletes nothing.
- **Dry-run by default.** Without `-v confirm=DELETE` it prints exact COUNTS and
  rolls back — deletes nothing.
- **Transaction-wrapped** (all-or-nothing). If anything outside the known FK tree
  still references the donor, the final delete fails and the whole thing rolls back.
- Prints the **live FK tree** (every FK column referencing `directus_users`) at the
  top so you can confirm the deletion list is complete against the real DB.

## How to run (founder)

1. Edit the `_target_donor_emails` VALUES list in `wipe-test-donors.sql`.
2. **Dry-run first** (counts only, deletes nothing):
   ```bash
   docker exec -i og-database psql -U directus -d directus \
     -v ON_ERROR_STOP=1 < wipe-test-donors.sql
   ```
3. Review the printed counts + FK tree. Then **execute for real**:
   ```bash
   docker exec -i og-database psql -U directus -d directus \
     -v ON_ERROR_STOP=1 -v confirm=DELETE < wipe-test-donors.sql
   ```
   The literal word `DELETE` is the only thing that switches off dry-run.

## Deletion order (leaves → root, all scoped to the target donors)
1. `task_comment_attachment` → 2. `task_comment` → 3. `task` → 4. `payment` →
5. `report` → 6. `aid_delivery` → 7. `donation` → 8. `reveal_request` →
9. `notification` → 10. `cart_session` → 11. `sponsorship` → 12. `audit_log` →
13. `directus_sessions` → 14. `directus_users` (the donor) **last**.

Each delete is guarded by `to_regclass()`, so tables absent in a given environment
are skipped rather than erroring.

## Validation
Verified against a throwaway Postgres 16 container (NOT `og-database`) with stub
tables mirroring the real FKs: dry-run rolls back unchanged; `confirm=DELETE`
removes the test donor + full chain while the real donor, admin, and the real
donor's sponsorship survive; a non-Donor email in the list aborts with no deletes.
