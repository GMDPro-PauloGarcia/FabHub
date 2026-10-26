-- Follow-up to 20261020020000_jo_project_code.sql.
--
-- Backfilled JOs took the column default budget_status 'QS Budget Pending',
-- and the QS dashboard banner counts every JO with that status, so it jumped
-- from 76 to 246. Jobs already at Close-Out / Completed when they were
-- backfilled don't need a QS budget target. Live backfilled jobs (Kickoff to
-- Punchlist) stay pending: they are real jobs QS never saw because they had
-- no JO.
--
-- Idempotent.

update public.job_orders j
   set budget_status = 'Not required (closed before JO)'
  from public.deals d
 where d.id = j.deal_id
   and j.backfilled_at is not null
   and j.budget_status = 'QS Budget Pending'
   and d.stage in ('12 · Close-Out', '14 · Completed');

-- ROLLBACK
-- update public.job_orders set budget_status = 'QS Budget Pending'
--  where budget_status = 'Not required (closed before JO)';
