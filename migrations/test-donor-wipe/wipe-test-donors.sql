-- ============================================================================
-- OrphanGive — SAFE test-donor wipe (dry-run by default, transaction-wrapped)
-- ============================================================================
--
-- WHY: Directus can't delete a donor directly —
--   ERROR: null value in column "donor" of relation "sponsorship" violates
--          not-null constraint
-- A donor has dependent rows (sponsorships, payments, tasks, reveals, cart,
-- notifications, audit rows…). The donor FKs default to ON DELETE SET NULL,
-- but sponsorship.donor (and other) columns are NOT NULL, so SET NULL fails.
-- The constraint is CORRECT (it protects real financial records). We work
-- WITH it by deleting children-before-parent, in one transaction.
--
-- WHAT THIS DOES:
--   • Targets ONLY the explicitly-listed TEST donor emails below.
--   • Refuses to touch any user that is NOT the 'Donor' role (admins/DI safe).
--   • DRY-RUN BY DEFAULT: prints COUNTS of exactly what it would delete and
--     deletes NOTHING. A real deletion happens ONLY when you pass
--     -v confirm=DELETE (the literal word DELETE).
--   • Deletes strictly leaves-first, wrapped in a TRANSACTION (all-or-nothing).
--   • Does NOT alter schema, constraints, or FK on-delete behaviour.
--
-- DELETION ORDER (leaves → root), all scoped to the target donors:
--    1. task_comment_attachment   (comment → task_comment, CASCADE off task)
--    2. task_comment              (task → task)
--    3. task                      (sponsorship → sponsorship)
--    4. payment                   (sponsorship → sponsorship)
--    5. report                    (sponsorship → sponsorship)
--    6. aid_delivery              (sponsorship → sponsorship)
--    7. donation                  (donor → users  OR  sponsorship → sponsorship)
--    8. reveal_request            (donor → users)
--    9. notification              (recipient → users)
--   10. cart_session              (donor → users; cart items are a JSON field)
--   11. sponsorship               (donor → users)   ← now unblocked
--   12. audit_log                 (actor → users)
--   13. directus_sessions         (user → users)
--   14. directus_users            (the donor row)   ← LAST
--
-- Each delete is guarded by to_regclass(), so a table that doesn't exist in
-- this environment is skipped rather than erroring. Anything still pointing
-- at the donor that ISN'T in this list will make the final delete fail and
-- ROLL THE WHOLE THING BACK (safe) — read the error, tell the maintainer,
-- and the missing table gets added. The FK-DISCOVERY query below prints the
-- live FK tree so you can confirm completeness against THIS database first.
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
--   Pass the TARGET EMAILS at run time with -v emails='a@x.com,b@x.com' (comma-
--   separated; spaces trimmed; empty entries ignored). Nothing is edited into
--   this file. An unset/empty emails variable ABORTS (never runs against "all").
--
--   DRY-RUN (default — counts only, deletes nothing):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 -v emails='a@test.com,b@test.com' < wipe-test-donors.sql
--
--   EXECUTE FOR REAL (only after reviewing the dry-run output):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 -v emails='a@test.com,b@test.com' -v confirm=DELETE < wipe-test-donors.sql
--
--   (The magic word is the literal `DELETE`. Without it, the script always
--    rolls back. Without -v emails=… it aborts before touching anything.)
-- ============================================================================

\set ON_ERROR_STOP on

-- Default to DRY-RUN unless the caller passed -v confirm=DELETE
\if :{?confirm}
\else
  \set confirm DRY_RUN
\endif

-- Default the target-emails variable to empty when -v emails=… is not passed,
-- so :'emails' is always a valid quoted literal (an empty set then ABORTS in
-- the DO block — we never run against an empty/"all" target).
\if :{?emails}
\else
  \set emails ''
\endif

-- ── (read-only) FK-DISCOVERY: every FK in this DB that points at a donor ────
-- Eyeball this against the DELETION ORDER above. If a table.column appears
-- here that the script does NOT handle, stop and report it before executing.
\echo ''
\echo '================ FK columns referencing directus_users ================'
SELECT
  c.conrelid::regclass            AS child_table,
  a.attname                       AS child_column,
  confupdtype                     AS on_update,
  c.confdeltype                   AS on_delete   -- a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f'
  AND c.confrelid = 'directus_users'::regclass
ORDER BY 1, 2;
\echo '(on_delete: n=SET NULL, c=CASCADE, r=RESTRICT, a=NO ACTION)'
\echo ''

-- Compute a real boolean for the COMMIT/ROLLBACK branch at the end.
SELECT (:'confirm' = 'DELETE') AS will_delete \gset

BEGIN;

-- Pass the confirm flag into the DO block via a session GUC.
SET LOCAL app.confirm = :'confirm';

-- ════════════════════════════════════════════════════════════════════════
--  TARGET LIST — comes from the -v emails='a@x.com,b@x.com' command-line var.
--  Split on comma, trim whitespace, drop empty entries, lowercase. Only users
--  with the 'Donor' role are eligible; anything else aborts. :'emails' is psql-
--  quoted, so an email value cannot break out of the string literal.
-- ════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _target_donor_emails (email text) ON COMMIT DROP;
INSERT INTO _target_donor_emails (email)
SELECT lower(btrim(e))
FROM regexp_split_to_table(:'emails', ',') AS e
WHERE btrim(e) <> '';

DO $$
DECLARE
  v_dry    boolean := current_setting('app.confirm', true) IS DISTINCT FROM 'DELETE';
  v_donors uuid[];
  v_spons  uuid[];
  v_tasks  uuid[];
  v_bad    int;
  v_miss   int;
  v_n      bigint;
BEGIN
  ----------------------------------------------------------------------------
  -- SAFETY 0: no target emails provided (unset / empty / whitespace) → abort.
  -- Never run against an empty or "all" target.
  ----------------------------------------------------------------------------
  IF (SELECT count(*) FROM _target_donor_emails) = 0 THEN
    RAISE EXCEPTION
      'ABORT: no target emails provided. Pass -v emails=''a@x.com,b@x.com'' (comma-separated).';
  END IF;

  ----------------------------------------------------------------------------
  -- SAFETY 1: any provided email mapping to a NON-Donor user → hard abort.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_bad
  FROM _target_donor_emails e
  JOIN directus_users u ON lower(u.email) = lower(e.email)
  LEFT JOIN directus_roles r ON r.id = u.role
  WHERE coalesce(r.name, '') <> 'Donor';
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'ABORT: % target email(s) map to a NON-Donor user (admin/DI/guardian). Refusing to proceed.', v_bad;
  END IF;

  ----------------------------------------------------------------------------
  -- Resolve target donor ids (Donor role only).
  ----------------------------------------------------------------------------
  SELECT array_agg(u.id) INTO v_donors
  FROM _target_donor_emails e
  JOIN directus_users u ON lower(u.email) = lower(e.email)
  JOIN directus_roles  r ON r.id = u.role
  WHERE r.name = 'Donor';

  IF v_donors IS NULL OR array_length(v_donors, 1) = 0 THEN
    RAISE NOTICE 'No matching Donor-role users for the given emails. Nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_miss
  FROM _target_donor_emails e
  WHERE NOT EXISTS (SELECT 1 FROM directus_users u WHERE lower(u.email) = lower(e.email));
  IF v_miss > 0 THEN
    RAISE NOTICE 'NOTE: % target email(s) matched no user (typo, or already deleted).', v_miss;
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_spons FROM sponsorship WHERE donor = ANY(v_donors);
  SELECT coalesce(array_agg(id), '{}') INTO v_tasks FROM task        WHERE sponsorship = ANY(v_spons);

  RAISE NOTICE '================= TARGET SET =================';
  RAISE NOTICE 'Donors:       %', array_length(v_donors, 1);
  RAISE NOTICE 'Sponsorships: %', coalesce(array_length(v_spons, 1), 0);
  RAISE NOTICE 'Tasks:        %', coalesce(array_length(v_tasks, 1), 0);
  RAISE NOTICE 'Mode:         %', CASE WHEN v_dry THEN 'DRY-RUN (counts only)' ELSE 'EXECUTE (delete + commit)' END;
  RAISE NOTICE '----- counts (leaves first; %) -----', CASE WHEN v_dry THEN 'would delete' ELSE 'deleting' END;

  ----------------------------------------------------------------------------
  -- 1) task_comment_attachment
  ----------------------------------------------------------------------------
  IF to_regclass('public.task_comment_attachment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task_comment_attachment
      WHERE comment IN (SELECT id FROM task_comment WHERE task = ANY(v_tasks));
    RAISE NOTICE '  task_comment_attachment : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM task_comment_attachment
        WHERE comment IN (SELECT id FROM task_comment WHERE task = ANY(v_tasks));
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 2) task_comment
  ----------------------------------------------------------------------------
  IF to_regclass('public.task_comment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task_comment WHERE task = ANY(v_tasks);
    RAISE NOTICE '  task_comment            : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM task_comment WHERE task = ANY(v_tasks);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 3) task
  ----------------------------------------------------------------------------
  IF to_regclass('public.task') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task WHERE sponsorship = ANY(v_spons);
    RAISE NOTICE '  task                    : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM task WHERE sponsorship = ANY(v_spons);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 4) payment
  ----------------------------------------------------------------------------
  IF to_regclass('public.payment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM payment WHERE sponsorship = ANY(v_spons);
    RAISE NOTICE '  payment                 : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM payment WHERE sponsorship = ANY(v_spons);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 5) report
  ----------------------------------------------------------------------------
  IF to_regclass('public.report') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM report WHERE sponsorship = ANY(v_spons);
    RAISE NOTICE '  report                  : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM report WHERE sponsorship = ANY(v_spons);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 6) aid_delivery
  ----------------------------------------------------------------------------
  IF to_regclass('public.aid_delivery') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM aid_delivery WHERE sponsorship = ANY(v_spons);
    RAISE NOTICE '  aid_delivery            : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM aid_delivery WHERE sponsorship = ANY(v_spons);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 7) donation (donor-scoped OR sponsorship-scoped)
  ----------------------------------------------------------------------------
  IF to_regclass('public.donation') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM donation
      WHERE donor = ANY(v_donors) OR sponsorship = ANY(v_spons);
    RAISE NOTICE '  donation                : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM donation WHERE donor = ANY(v_donors) OR sponsorship = ANY(v_spons);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 8) reveal_request
  ----------------------------------------------------------------------------
  IF to_regclass('public.reveal_request') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM reveal_request WHERE donor = ANY(v_donors);
    RAISE NOTICE '  reveal_request          : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM reveal_request WHERE donor = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 9) notification (recipient = donor)
  ----------------------------------------------------------------------------
  IF to_regclass('public.notification') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM notification WHERE recipient = ANY(v_donors);
    RAISE NOTICE '  notification            : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM notification WHERE recipient = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 10) cart_session (cart items live in a JSON column on this row)
  ----------------------------------------------------------------------------
  IF to_regclass('public.cart_session') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM cart_session WHERE donor = ANY(v_donors);
    RAISE NOTICE '  cart_session            : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM cart_session WHERE donor = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 11) sponsorship  (now unblocked — all children removed above)
  ----------------------------------------------------------------------------
  IF to_regclass('public.sponsorship') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM sponsorship WHERE donor = ANY(v_donors);
    RAISE NOTICE '  sponsorship             : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM sponsorship WHERE donor = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 12) audit_log (actor = donor)
  ----------------------------------------------------------------------------
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM audit_log WHERE actor = ANY(v_donors);
    RAISE NOTICE '  audit_log               : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM audit_log WHERE actor = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 13) directus_sessions (user = donor)
  ----------------------------------------------------------------------------
  IF to_regclass('public.directus_sessions') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM directus_sessions WHERE "user" = ANY(v_donors);
    RAISE NOTICE '  directus_sessions       : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM directus_sessions WHERE "user" = ANY(v_donors);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 14) directus_users (the donor rows) — LAST
  ----------------------------------------------------------------------------
  RAISE NOTICE '  directus_users (donors) : %', array_length(v_donors, 1);
  IF NOT v_dry THEN
    DELETE FROM directus_users WHERE id = ANY(v_donors);
  END IF;

  RAISE NOTICE '=============================================';
  IF v_dry THEN
    RAISE NOTICE 'DRY-RUN complete. No rows deleted. To execute: -v confirm=DELETE';
  ELSE
    RAISE NOTICE 'Deletion executed inside the transaction (pending COMMIT).';
  END IF;
END $$;

-- ── COMMIT or ROLLBACK ──────────────────────────────────────────────────────
\if :will_delete
  \echo '>>> confirm=DELETE — COMMITTING the deletion.'
  COMMIT;
\else
  \echo '>>> DRY-RUN (default) — ROLLING BACK. Nothing was deleted.'
  \echo '>>> To execute for real: add  -v confirm=DELETE  to the psql command.'
  ROLLBACK;
\endif
