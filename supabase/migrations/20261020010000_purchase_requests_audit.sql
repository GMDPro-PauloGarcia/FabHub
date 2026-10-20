-- Audit trail for purchase_requests (PRs and POs).
--
-- purchase_requests had no audit: ~1,000 deletes since May left no record of
-- what was removed or by whom. Seven POs (PO-0354, -0368, -0454, -0517, -0519,
-- -0669, -0670) are gone while their payables still exist. From now on every
-- delete keeps the full row, and every real edit keeps the old row, the new
-- row and the changed fields, in audit_log (same shape as billing / cash).
--
-- Restore a deleted PO:
--   insert into public.purchase_requests
--   select * from jsonb_populate_record(null::public.purchase_requests,
--     (select snapshot from public.audit_log
--       where table_name = 'purchase_requests' and action = 'delete'
--         and snapshot->>'po_number' = 'PO-XXXX'
--       order by performed_at desc limit 1));
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.audit_purchase_request_change()
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
     'deleted' || coalesce(' ' || nullif(old.po_number, ''), ''));
  return old;
end;
$$;

revoke execute on function public.audit_purchase_request_change() from public, anon, authenticated;

create or replace trigger trg_audit_purchase_request
  after update or delete on public.purchase_requests
  for each row execute function public.audit_purchase_request_change();

-- ROLLBACK
-- drop trigger if exists trg_audit_purchase_request on public.purchase_requests;
-- drop function if exists public.audit_purchase_request_change();
