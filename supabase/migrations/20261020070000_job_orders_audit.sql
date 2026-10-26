-- Audit trail for job_orders (JO = the project code, 20261020020000).
--
-- job_orders had no audit, and job_orders.deal_id is ON DELETE CASCADE, so
-- deleting a deal silently deleted its JO. From now on every delete
-- (including one cascaded from a deal delete) keeps the full row, and every
-- real edit keeps the old row, the new row and the changed fields, in
-- audit_log (same shape as purchase_requests / billing / cash).
-- The Award modal hand-over (trg_job_orders_adopt_auto) shows up as an
-- update whose changed_fields include id.
--
-- Restore a deleted JO (restore its deal first if that was deleted too):
--   insert into public.job_orders
--   select * from jsonb_populate_record(null::public.job_orders,
--     (select snapshot from public.audit_log
--       where table_name = 'job_orders' and action = 'delete'
--         and snapshot->>'jo_no' = 'JO-XXXX'
--       order by performed_at desc limit 1));
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.audit_job_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor   text := coalesce(nullif(public.app_username(), ''), 'unknown');
  changed text[];
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;
    select array_agg(key) into changed
      from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
    insert into public.audit_log
      (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
    values
      (tg_table_name, new.id::text, 'update', to_jsonb(old), to_jsonb(new), changed, actor, 'field edit');
    return new;
  end if;

  insert into public.audit_log
    (table_name, record_id, action, snapshot, performed_by, reason)
  values
    (tg_table_name, old.id::text, lower(tg_op), to_jsonb(old), actor,
     'deleted ' || old.jo_no
     || case when not exists (select 1 from public.deals where id = old.deal_id)
             then ' (its deal was deleted)' else '' end);
  return old;
end;
$$;

revoke execute on function public.audit_job_order_change() from public, anon, authenticated;

create or replace trigger trg_audit_job_order
  after update or delete on public.job_orders
  for each row execute function public.audit_job_order_change();

-- ROLLBACK
-- drop trigger if exists trg_audit_job_order on public.job_orders;
-- drop function if exists public.audit_job_order_change();
