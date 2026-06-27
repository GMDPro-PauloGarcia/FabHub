-- ============================================================================
-- FabHub — enable Realtime for the tables the app subscribes to
-- ============================================================================
-- The app opens realtime subscriptions for these tables so edits on one device
-- appear on others without a manual refresh. Realtime only fires if the table
-- is in the `supabase_realtime` publication. Adds the 22 subscribed tables
-- (idempotent). Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================================
do $$
declare
  t text;
  subscribed text[] := array[
    'deals','project_cards','project_card_dept_status','project_card_dept_tasks',
    'billing_milestones','billing_payments','addenda','activity_log','job_orders',
    'purchase_requests','material_requests','budget_requests','expenses',
    'subcon_work_orders','inflows','checklists','swatches','ae_updates',
    'project_blockers','inventory_items','stock_movements','design_requests'
  ];
begin
  foreach t in array subscribed loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end if;
  end loop;
end $$;

select schemaname, tablename
from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
order by tablename;
