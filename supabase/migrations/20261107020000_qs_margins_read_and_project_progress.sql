-- Cost Control (QS) can see project margins; PMs report progress as 30/60/90/100.
-- Decided with Paulo 2026-11-07 (department audit).
--
-- 1. QS (Cost Control: Ardrin Salustiano, Rodney Erpe) get a Budget screen and
--    Project Margins. Margins need costs (supplier bills, payments, subcon work
--    orders) and revenue (client billing milestones and payments), which QS could
--    not read. QS gets READ access to those five tables. No write access is added.
--
-- 2. PM Updates, Blockers and the Scope Changes page are removed from the app;
--    progress is one pick per project: 30, 60, 90 or 100 %.
--    set_project_progress(deal_id, pct) stores it in project_cards.manual_progress
--    (the field Project Cards already shows) with who and when, and logs every
--    change to audit_log (action 'progress'). PMs, Operations and Managers may set
--    it on any project; Coordinators only on projects they coordinate. Operations
--    could not save project cards at all before (not in project_cards_upd).
--
-- Mirrors src/views/ProjectProgress.jsx and the QS nav / Cost Analysis access in
-- src/App.jsx + src/shared.jsx. Idempotent.

-- ── 1. QS reads costs and revenue ────────────────────────────────────────────
alter policy payables_sel on public.payables
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin','QS'));
alter policy payable_payments_sel on public.payable_payments
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin','QS'));
alter policy billing_milestones_sel on public.billing_milestones
  using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','SalesOpsAdmin','QS'));
alter policy billing_payments_sel on public.billing_payments
  using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','SalesOpsAdmin','QS'));
alter policy subcon_work_orders_sel on public.subcon_work_orders
  using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin','QS'));

-- ── 2. progress 30 / 60 / 90 / 100 ───────────────────────────────────────────
alter table public.project_cards add column if not exists progress_set_by text;
alter table public.project_cards add column if not exists progress_set_at timestamptz;

create or replace function public.set_project_progress(p_deal uuid, p_pct integer)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; c public.project_cards; t timestamptz := now();
begin
  if p_pct is null or p_pct not in (30, 60, 90, 100) then
    raise exception 'Progress is 30, 60, 90 or 100 percent' using errcode = '22023';
  end if;
  select name into me from public.user_profiles where username = public.app_username();
  if not (public.has_role('Manager','Operations','ProjectMover')
          or (public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids()))) then
    raise exception 'Only the PM, the coordinator of this project, Operations or a Manager sets progress' using errcode = '42501';
  end if;
  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then raise exception 'No project card for this project' using errcode = 'P0002'; end if;
  update public.project_cards
     set manual_progress = p_pct, progress_set_by = coalesce(me.name, public.app_username()), progress_set_at = t, updated_at = t
   where deal_id = p_deal;
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', p_deal::text, 'progress', jsonb_build_object('manual_progress', p_pct),
          jsonb_build_object('manual_progress', c.manual_progress), null, coalesce(me.name, public.app_username()), t, array['manual_progress']);
  return t;
end $$;

revoke execute on function public.set_project_progress(uuid, integer) from public, anon;
grant execute on function public.set_project_progress(uuid, integer) to authenticated;

-- ROLLBACK
--   alter policy payables_sel on public.payables using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
--   alter policy payable_payments_sel on public.payable_payments using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
--   alter policy billing_milestones_sel on public.billing_milestones using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','SalesOpsAdmin'));
--   alter policy billing_payments_sel on public.billing_payments using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','SalesOpsAdmin'));
--   alter policy subcon_work_orders_sel on public.subcon_work_orders using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
--   revoke execute on function public.set_project_progress(uuid, integer) from authenticated;
--   (progress_set_by / progress_set_at can stay.)
