-- ============================================================================
-- OPTIONAL — backfill child_document.uploaded_by (dry-run by default)
-- ============================================================================
--
-- Repairs EXISTING child_document rows whose `uploaded_by` is NULL (the pre-fix
-- data — createDocument never set it). New uploads are fixed in app code
-- (fix/document-uploaded-by); this only heals rows created before that ships.
--
-- NOT required for launch if the current documents are test data that will be
-- re-created. Run it only if you want to preserve attribution + re-enable
-- reject/re-upload notifications for documents uploaded BEFORE the code fix.
--
-- Resolution per null row (first match wins):
--   1. the `di_uploaded_document` audit-log actor for that document (the DI
--      who actually uploaded it — most accurate), else
--   2. the child's `assigned_di` (coarser but correct owner).
-- Rows resolving to neither, or to a user that no longer exists, are LEFT NULL
-- and counted. Only sets uploaded_by to a directus_users row that exists (so
-- the FK can't fail). No schema change.
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
--   DRY-RUN (default — counts by source, writes nothing):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 < backfill-uploaded-by.sql
--
--   EXECUTE (only after reviewing the dry-run):
--     docker exec -i og-database psql -U directus -d directus \
--       -v ON_ERROR_STOP=1 -v confirm=WRITE < backfill-uploaded-by.sql
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?confirm}
\else
  \set confirm DRY_RUN
\endif

SELECT (:'confirm' = 'WRITE') AS will_write \gset

BEGIN;
SET LOCAL app.confirm = :'confirm';

-- Resolve a source uploader for every null-uploaded_by document.
CREATE TEMP TABLE _resolved ON COMMIT DROP AS
SELECT
  cd.id AS document_id,
  cd.child AS child_id,
  audit.actor        AS from_audit,
  ch.assigned_di     AS from_assigned_di,
  COALESCE(audit.actor, ch.assigned_di) AS resolved_uploader
FROM child_document cd
LEFT JOIN child ch ON ch.id = cd.child
LEFT JOIN LATERAL (
  SELECT a.actor
  FROM audit_log a
  WHERE a.collection = 'child_document'
    AND a.record_id = cd.id::text
    AND a.action = 'di_uploaded_document'
    AND a.actor IS NOT NULL
  ORDER BY a.timestamp DESC
  LIMIT 1
) audit ON true
WHERE cd.uploaded_by IS NULL;

DO $$
DECLARE
  v_dry     boolean := current_setting('app.confirm', true) IS DISTINCT FROM 'WRITE';
  v_null    bigint;
  v_audit   bigint;
  v_assigned bigint;
  v_unres   bigint;
  v_writable bigint;
  v_updated bigint;
BEGIN
  SELECT count(*) INTO v_null     FROM _resolved;
  SELECT count(*) INTO v_audit    FROM _resolved WHERE from_audit IS NOT NULL;
  SELECT count(*) INTO v_assigned FROM _resolved WHERE from_audit IS NULL AND from_assigned_di IS NOT NULL;
  SELECT count(*) INTO v_unres    FROM _resolved WHERE resolved_uploader IS NULL;
  -- Only rows whose resolved uploader still exists as a user are writable.
  SELECT count(*) INTO v_writable
  FROM _resolved r
  WHERE r.resolved_uploader IS NOT NULL
    AND EXISTS (SELECT 1 FROM directus_users u WHERE u.id = r.resolved_uploader);

  RAISE NOTICE '=============== uploaded_by BACKFILL ===============';
  RAISE NOTICE 'Mode:                         %', CASE WHEN v_dry THEN 'DRY-RUN (no writes)' ELSE 'EXECUTE (update + commit)' END;
  RAISE NOTICE 'documents with NULL uploaded_by: %', v_null;
  RAISE NOTICE '  resolvable via audit actor:    %', v_audit;
  RAISE NOTICE '  resolvable via assigned_di:    %', v_assigned;
  RAISE NOTICE '  UNRESOLVABLE (left NULL):       %', v_unres;
  RAISE NOTICE '  writable (resolved + user exists): %', v_writable;

  IF NOT v_dry THEN
    UPDATE child_document cd
       SET uploaded_by = r.resolved_uploader
      FROM _resolved r
     WHERE cd.id = r.document_id
       AND r.resolved_uploader IS NOT NULL
       AND EXISTS (SELECT 1 FROM directus_users u WHERE u.id = r.resolved_uploader);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % row(s).', v_updated;
  ELSE
    RAISE NOTICE 'DRY-RUN — no rows updated. To execute: -v confirm=WRITE';
  END IF;
  RAISE NOTICE '===================================================';
END $$;

\if :will_write
  \echo '>>> confirm=WRITE — COMMITTING the backfill.'
  COMMIT;
\else
  \echo '>>> DRY-RUN (default) — ROLLING BACK. Nothing was written.'
  ROLLBACK;
\endif
