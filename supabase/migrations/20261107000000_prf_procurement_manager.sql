-- PRF: the Procurement Manager can read PRFs and work the "For Procurement" step.
--
-- Found 2026-11-07 while testing the Order Board (Orders › Order Board): the
-- app gives the Procurement Manager (Marian Prile, role ProcurementManager) the
-- same PRF screens as Procurement, but the database only knew 'Procurement':
--   • prf_can_read() left ProcurementManager out, so the PRF list was empty;
--   • prf_step_block() refused link_prf_po / reject at "For Procurement" with
--     "Only Procurement handles this step".
-- Both now include ProcurementManager. Nothing else changes; the definitions are
-- otherwise those of 20261027120000_prf_workflow.sql. Idempotent (create or
-- replace keeps the existing grants: prf_step_block stays revoked from clients).

create or replace function public.prf_can_read()
returns boolean language sql stable set search_path = public as $$
  select public.has_role('Manager','ProjectMover','Operations','Warehouse','QS','Procurement','ProcurementManager',
                         'Finance','FinanceAssistant','Accounting','SalesOpsAdmin')
$$;

create or replace function public.prf_step_block(r public.prfs)
returns text language plpgsql stable security definer set search_path = public as $$
declare me record;
begin
  select * into me from public.prf_me();
  if lower(r.requested_by) = lower(coalesce(me.o_user,'')) then
    return 'You can''t sign your own PRF';
  end if;
  if r.status = 'For PM Approval' then
    if me.o_role in ('Manager','Operations') or public.prf_is_project_pm(r.deal_id, me.o_name) then return null; end if;
    return 'Only a PM of this project (or Operations / a Manager) approves this step';
  elsif r.status = 'For Warehouse' then
    if public.has_role('Warehouse') then return null; end if;
    return 'Only the Warehouse team signs this step';
  elsif r.status = 'For Cost Control' then
    if public.has_role('QS') then return null; end if;
    return 'Only Cost Control (QS) signs this step';
  elsif r.status = 'For Procurement' then
    if public.has_role('Procurement','ProcurementManager','Manager') then return null; end if;
    return 'Only Procurement handles this step';
  end if;
  return 'This PRF is ' || r.status || ' — there is nothing to sign';
end $$;

-- ROLLBACK (restores 20261027120000 behaviour):
-- create or replace function public.prf_can_read() returns boolean language sql stable set search_path = public as $$
--   select public.has_role('Manager','ProjectMover','Operations','Warehouse','QS','Procurement',
--                          'Finance','FinanceAssistant','Accounting','SalesOpsAdmin') $$;
-- and re-run prf_step_block above with has_role('Procurement','Manager') at "For Procurement".
