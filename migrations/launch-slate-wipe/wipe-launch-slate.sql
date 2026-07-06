-- ============================================================================
-- OrphanGive — LAUNCH-SLATE WIPE (keep-list; dry-run by default, transactional)
-- ============================================================================
--
-- Deletes ALL children and ALL Donor-role donors EXCEPT an explicit keep-list,
-- plus every dependent row, children-before-parent, in ONE transaction.
-- No schema/constraint change. Founder runs it against og-database; dry-run
-- first. (Written + validated on a throwaway DB; NOT run against prod here.)
--
-- ── KEY RULE (sponsorship is the shared node) ───────────────────────────────
-- sponsorship references BOTH child (SET NULL, NULLABLE) and donor (SET NULL,
-- NOT NULL). A sponsorship must be deleted if EITHER its child OR its donor is
-- deleted; it survives only if BOTH are kept. Because sponsorship.child is
-- NULLABLE, deleting a child alone would NOT remove its sponsorships — it would
-- orphan them (child=NULL) with the donor intact. So we delete sponsorships
-- EXPLICITLY by the union: child ∈ del_child OR donor ∈ del_donor.
--
-- ── SETS ────────────────────────────────────────────────────────────────────
--   del_child = every child whose id is NOT in KEEP children
--   del_donor = every directus_users with role='Donor' whose email is NOT in
--               KEEP donors  (ONLY role='Donor' — never Admin/Super Admin/DI,
--               which structurally protects system@, public-site@, mahmuds@,
--               and every Data Inputter)
--   del_spons = sponsorships where child ∈ del_child OR donor ∈ del_donor
--
-- ── DELETION ORDER (leaves → root), all in one transaction ──────────────────
--    1 task_comment_attachment  (of tasks being deleted)
--    2 task_comment             (of tasks being deleted)
--    3 task                     (child ∈ del_child OR sponsorship ∈ del_spons)
--    4 payment                  (sponsorship ∈ del_spons)
--    5 report                   (child ∈ del_child OR sponsorship ∈ del_spons)
--    6 aid_delivery             (child ∈ del_child OR sponsorship ∈ del_spons)
--    7 donation                 (child ∈ del_child OR spons ∈ del_spons OR donor ∈ del_donor)
--    8 reveal_request           (child ∈ del_child OR donor ∈ del_donor)
--    9 child_document           (child ∈ del_child)
--   10 child_update             (child ∈ del_child)
--   11 child_intake_photo       (child ∈ del_child)   [CASCADE anyway; explicit safe]
--   12 child_moment             (child ∈ del_child)   [CASCADE anyway]
--   13 child_proposal           (target_child ∈ del_child)  [nullable — DELETED for a clean slate]
--   14 notification             (recipient ∈ del_donor)
--   15 cart_session             (donor ∈ del_donor)
--   16 audit_log                (actor ∈ del_donor)   [actor is NOT NULL → must delete]
--   17 directus_sessions        (user ∈ del_donor)
--   18 sponsorship              (id ∈ del_spons)
--   19 child                    (id ∈ del_child)
--   20 directus_users           (id ∈ del_donor)      ← donors LAST
--
-- Nullability notes (verified against the live schema): the NOT-NULL child FKs
-- that would BLOCK a child delete (child_document/child_update/report/
-- reveal_request/aid_delivery) and the NOT-NULL donor FKs that would BLOCK a
-- donor delete (sponsorship.donor/donation.donor/reveal_request.donor/
-- notification.recipient/audit_log.actor) are all removed above before their
-- parent. child_intake_photo/child_moment are CASCADE. Every delete is
-- to_regclass-guarded; anything unhandled that still references a deleted row
-- makes the final delete fail and rolls the WHOLE thing back (safe).
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
--   DRY-RUN (default — counts only, deletes nothing):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 < wipe-launch-slate.sql
--
--   EXECUTE FOR REAL (only after reviewing the dry-run output):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 -v confirm=DELETE < wipe-launch-slate.sql
--
--   (The literal word DELETE is the only thing that switches off dry-run.)
-- ============================================================================

\set ON_ERROR_STOP on

-- Default to DRY-RUN unless the caller passed -v confirm=DELETE
\if :{?confirm}
\else
  \set confirm DRY_RUN
\endif

-- ── (read-only) FK-DISCOVERY — eyeball against the DELETION ORDER above ──────
\echo ''
\echo '=========== FK columns referencing child ==========='
SELECT c.conrelid::regclass AS child_table, a.attname AS col,
  CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
       WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f' AND c.confrelid = 'child'::regclass
ORDER BY 1, 2;
\echo ''
\echo '=========== FK columns referencing directus_users (donor-relevant only) ==========='
\echo '(created_by/reviewed_by/assignee/uploaded_by/approved_by/decided_by etc. are DI/admin'
\echo ' columns a donor never populates; directus_* are Directus-internal. Donor-owned ones:'
\echo ' sponsorship.donor, donation.donor, reveal_request.donor, notification.recipient,'
\echo ' cart_session.donor, audit_log.actor, directus_sessions.user.)'
SELECT c.conrelid::regclass AS tbl, a.attname AS col,
  CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
       WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f' AND c.confrelid = 'directus_users'::regclass
  AND a.attname IN ('donor','recipient','actor','user')
ORDER BY 1, 2;
\echo ''

-- Compute a real boolean for the COMMIT/ROLLBACK branch at the end.
SELECT (:'confirm' = 'DELETE') AS will_delete \gset

BEGIN;
SET LOCAL app.confirm = :'confirm';

-- ════════════════════════════════════════════════════════════════════════
--  KEEP-LISTS — the ONLY children / donors that SURVIVE. Edit here.
-- ════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _keep_child (id uuid) ON COMMIT DROP;
INSERT INTO _keep_child (id) VALUES
  ('bd07e2e8-dbaa-4cc7-b361-73bfbb47a242'),
  ('f6075c8c-3e17-4717-ba79-d94cd822b1f2'),
  ('6cdff22b-02eb-41f8-bb4e-66c7b6ed4884');

CREATE TEMP TABLE _keep_donor_email (email text) ON COMMIT DROP;
INSERT INTO _keep_donor_email (email) VALUES
  ('anik_jsr@ymail.com'),
  ('asifmdhasan@gmail.com'),
  ('childrens.hvn@gmail.com'),
  ('muhammedrashid@gmail.com'),
  ('ri.roseiqbal@gmail.com');
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_dry           boolean := current_setting('app.confirm', true) IS DISTINCT FROM 'DELETE';
  v_keep_expected int;
  v_keep_found    int;
  v_missing       text;
  v_nondonor      int;
  v_child_total   int;
  v_child_del     int;
  v_donor_total   int;
  v_donor_del     int;
  v_n             bigint;
BEGIN
  --------------------------------------------------------------------------
  -- HARD GUARD A: every KEEP child must resolve to a real child row.
  -- A mistyped keep-id would otherwise fall OUTSIDE del_child protection and
  -- the child you meant to keep would be deleted. Abort + name the offenders.
  --------------------------------------------------------------------------
  SELECT count(DISTINCT id) INTO v_keep_expected FROM _keep_child;
  SELECT count(*) INTO v_keep_found FROM child WHERE id IN (SELECT id FROM _keep_child);
  IF v_keep_found < v_keep_expected THEN
    SELECT string_agg(id::text, ', ') INTO v_missing
      FROM _keep_child WHERE id NOT IN (SELECT id FROM child);
    RAISE EXCEPTION
      'ABORT: % of % keep-children do NOT resolve to a real child (typo?): %. Refusing to proceed.',
      v_keep_expected - v_keep_found, v_keep_expected, v_missing;
  END IF;

  --------------------------------------------------------------------------
  -- Build deletion sets (temp tables, reused for counts + deletes).
  --------------------------------------------------------------------------
  CREATE TEMP TABLE _del_child ON COMMIT DROP AS
    SELECT id FROM child WHERE id NOT IN (SELECT id FROM _keep_child);

  CREATE TEMP TABLE _del_donor ON COMMIT DROP AS
    SELECT u.id
    FROM directus_users u
    JOIN directus_roles r ON r.id = u.role
    WHERE r.name = 'Donor'
      AND lower(u.email) NOT IN (SELECT lower(email) FROM _keep_donor_email);

  CREATE TEMP TABLE _del_spons ON COMMIT DROP AS
    SELECT id FROM sponsorship
    WHERE child IN (SELECT id FROM _del_child)
       OR donor IN (SELECT id FROM _del_donor);

  CREATE TEMP TABLE _del_task ON COMMIT DROP AS
    SELECT id FROM task
    WHERE child IN (SELECT id FROM _del_child)
       OR sponsorship IN (SELECT id FROM _del_spons);

  --------------------------------------------------------------------------
  -- HARD GUARD B: del_donor must contain ONLY role='Donor' users. (It is
  -- built from a role='Donor' filter; this asserts nothing slipped through.)
  --------------------------------------------------------------------------
  SELECT count(*) INTO v_nondonor
  FROM _del_donor d
  JOIN directus_users u ON u.id = d.id
  LEFT JOIN directus_roles r ON r.id = u.role
  WHERE coalesce(r.name, '') <> 'Donor';
  IF v_nondonor > 0 THEN
    RAISE EXCEPTION 'ABORT: del_donor contains % non-Donor user(s). Refusing to proceed.', v_nondonor;
  END IF;

  SELECT count(*) INTO v_child_total FROM child;
  SELECT count(*) INTO v_child_del   FROM _del_child;
  SELECT count(*) INTO v_donor_total FROM directus_users u JOIN directus_roles r ON r.id=u.role WHERE r.name='Donor';
  SELECT count(*) INTO v_donor_del   FROM _del_donor;

  RAISE NOTICE '===================== LAUNCH-SLATE WIPE =====================';
  RAISE NOTICE 'Mode:         %', CASE WHEN v_dry THEN 'DRY-RUN (counts only)' ELSE 'EXECUTE (delete + commit)' END;
  RAISE NOTICE 'children:     total=%  KEEP=%  delete=%', v_child_total, v_keep_found, v_child_del;
  RAISE NOTICE 'donors:       total=%  KEEP=%  delete=%', v_donor_total, v_donor_total - v_donor_del, v_donor_del;
  RAISE NOTICE 'sponsorships: delete=% (child OR donor in a delete set)', (SELECT count(*) FROM _del_spons);
  RAISE NOTICE '----- per-table (leaves first; %) -----', CASE WHEN v_dry THEN 'would delete' ELSE 'deleting' END;

  -- 1) task_comment_attachment
  IF to_regclass('public.task_comment_attachment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task_comment_attachment
      WHERE comment IN (SELECT id FROM task_comment WHERE task IN (SELECT id FROM _del_task));
    RAISE NOTICE '  task_comment_attachment : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM task_comment_attachment
        WHERE comment IN (SELECT id FROM task_comment WHERE task IN (SELECT id FROM _del_task));
    END IF;
  END IF;

  -- 2) task_comment
  IF to_regclass('public.task_comment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task_comment WHERE task IN (SELECT id FROM _del_task);
    RAISE NOTICE '  task_comment            : %', v_n;
    IF NOT v_dry THEN DELETE FROM task_comment WHERE task IN (SELECT id FROM _del_task); END IF;
  END IF;

  -- 3) task
  IF to_regclass('public.task') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM task WHERE id IN (SELECT id FROM _del_task);
    RAISE NOTICE '  task                    : %', v_n;
    IF NOT v_dry THEN DELETE FROM task WHERE id IN (SELECT id FROM _del_task); END IF;
  END IF;

  -- 4) payment
  IF to_regclass('public.payment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM payment WHERE sponsorship IN (SELECT id FROM _del_spons);
    RAISE NOTICE '  payment                 : %', v_n;
    IF NOT v_dry THEN DELETE FROM payment WHERE sponsorship IN (SELECT id FROM _del_spons); END IF;
  END IF;

  -- 5) report
  IF to_regclass('public.report') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM report
      WHERE child IN (SELECT id FROM _del_child) OR sponsorship IN (SELECT id FROM _del_spons);
    RAISE NOTICE '  report                  : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM report WHERE child IN (SELECT id FROM _del_child) OR sponsorship IN (SELECT id FROM _del_spons);
    END IF;
  END IF;

  -- 6) aid_delivery
  IF to_regclass('public.aid_delivery') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM aid_delivery
      WHERE child IN (SELECT id FROM _del_child) OR sponsorship IN (SELECT id FROM _del_spons);
    RAISE NOTICE '  aid_delivery            : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM aid_delivery WHERE child IN (SELECT id FROM _del_child) OR sponsorship IN (SELECT id FROM _del_spons);
    END IF;
  END IF;

  -- 7) donation
  IF to_regclass('public.donation') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM donation
      WHERE child IN (SELECT id FROM _del_child)
         OR sponsorship IN (SELECT id FROM _del_spons)
         OR donor IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  donation                : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM donation
        WHERE child IN (SELECT id FROM _del_child)
           OR sponsorship IN (SELECT id FROM _del_spons)
           OR donor IN (SELECT id FROM _del_donor);
    END IF;
  END IF;

  -- 8) reveal_request
  IF to_regclass('public.reveal_request') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM reveal_request
      WHERE child IN (SELECT id FROM _del_child) OR donor IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  reveal_request          : %', v_n;
    IF NOT v_dry THEN
      DELETE FROM reveal_request WHERE child IN (SELECT id FROM _del_child) OR donor IN (SELECT id FROM _del_donor);
    END IF;
  END IF;

  -- 9) child_document
  IF to_regclass('public.child_document') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM child_document WHERE child IN (SELECT id FROM _del_child);
    RAISE NOTICE '  child_document          : %', v_n;
    IF NOT v_dry THEN DELETE FROM child_document WHERE child IN (SELECT id FROM _del_child); END IF;
  END IF;

  -- 10) child_update
  IF to_regclass('public.child_update') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM child_update WHERE child IN (SELECT id FROM _del_child);
    RAISE NOTICE '  child_update            : %', v_n;
    IF NOT v_dry THEN DELETE FROM child_update WHERE child IN (SELECT id FROM _del_child); END IF;
  END IF;

  -- 11) child_intake_photo (CASCADE anyway; explicit is safe)
  IF to_regclass('public.child_intake_photo') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM child_intake_photo WHERE child IN (SELECT id FROM _del_child);
    RAISE NOTICE '  child_intake_photo      : %', v_n;
    IF NOT v_dry THEN DELETE FROM child_intake_photo WHERE child IN (SELECT id FROM _del_child); END IF;
  END IF;

  -- 12) child_moment (CASCADE anyway)
  IF to_regclass('public.child_moment') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM child_moment WHERE child IN (SELECT id FROM _del_child);
    RAISE NOTICE '  child_moment            : %', v_n;
    IF NOT v_dry THEN DELETE FROM child_moment WHERE child IN (SELECT id FROM _del_child); END IF;
  END IF;

  -- 13) child_proposal (target_child nullable → DELETED for a clean slate)
  IF to_regclass('public.child_proposal') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM child_proposal WHERE target_child IN (SELECT id FROM _del_child);
    RAISE NOTICE '  child_proposal          : %', v_n;
    IF NOT v_dry THEN DELETE FROM child_proposal WHERE target_child IN (SELECT id FROM _del_child); END IF;
  END IF;

  -- 14) notification (recipient = donor)
  IF to_regclass('public.notification') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM notification WHERE recipient IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  notification            : %', v_n;
    IF NOT v_dry THEN DELETE FROM notification WHERE recipient IN (SELECT id FROM _del_donor); END IF;
  END IF;

  -- 15) cart_session (donor)
  IF to_regclass('public.cart_session') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM cart_session WHERE donor IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  cart_session            : %', v_n;
    IF NOT v_dry THEN DELETE FROM cart_session WHERE donor IN (SELECT id FROM _del_donor); END IF;
  END IF;

  -- 16) audit_log (actor = donor; actor is NOT NULL so it MUST be deleted)
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM audit_log WHERE actor IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  audit_log               : %', v_n;
    IF NOT v_dry THEN DELETE FROM audit_log WHERE actor IN (SELECT id FROM _del_donor); END IF;
  END IF;

  -- 17) directus_sessions (user = donor)
  IF to_regclass('public.directus_sessions') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM directus_sessions WHERE "user" IN (SELECT id FROM _del_donor);
    RAISE NOTICE '  directus_sessions       : %', v_n;
    IF NOT v_dry THEN DELETE FROM directus_sessions WHERE "user" IN (SELECT id FROM _del_donor); END IF;
  END IF;

  -- 18) sponsorship (id ∈ del_spons) — now unblocked
  IF to_regclass('public.sponsorship') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM sponsorship WHERE id IN (SELECT id FROM _del_spons);
    RAISE NOTICE '  sponsorship             : %', v_n;
    IF NOT v_dry THEN DELETE FROM sponsorship WHERE id IN (SELECT id FROM _del_spons); END IF;
  END IF;

  -- 19) child (id ∈ del_child) — now unblocked
  RAISE NOTICE '  child                   : %', v_child_del;
  IF NOT v_dry THEN DELETE FROM child WHERE id IN (SELECT id FROM _del_child); END IF;

  -- 20) directus_users (donors) — LAST
  RAISE NOTICE '  directus_users (donors) : %', v_donor_del;
  IF NOT v_dry THEN DELETE FROM directus_users WHERE id IN (SELECT id FROM _del_donor); END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'KEEP survivors: % children, % donors', v_keep_found, v_donor_total - v_donor_del;
  IF v_dry THEN
    RAISE NOTICE 'DRY-RUN complete. No rows deleted. To execute: -v confirm=DELETE';
  ELSE
    RAISE NOTICE 'Deletion executed inside the transaction (pending COMMIT).';
  END IF;
END $$;

-- ── COMMIT or ROLLBACK ──────────────────────────────────────────────────────
\if :will_delete
  \echo '>>> confirm=DELETE — COMMITTING the wipe.'
  COMMIT;
\else
  \echo '>>> DRY-RUN (default) — ROLLING BACK. Nothing was deleted.'
  \echo '>>> To execute for real: add  -v confirm=DELETE  to the psql command.'
  ROLLBACK;
\endif
