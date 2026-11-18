-- Audit trail for supplier bills, supplier payments and payment runs.
--
-- Paulo, 2026-11-15: "there should be a history for each". Before this:
--   * payable_payments (money paid to suppliers) had no audit at all: a payment
--     could be recorded, edited or cancelled with no record of who or what it was;
--   * payables (bills) kept only special events (renumbering, bulk approval,
--     approval reset, duplicate override); ordinary edits had not been logged
--     since 2026-10-27 and a delete left a row only if the app wrote one;
--   * payment_runs kept who proposed / approved / released on the row, but no history.
-- From now on every insert, real edit and delete on these three tables is kept in
-- audit_log: who (from the login token, not typed), the row before and after, and
-- the fields that changed. Same shape as purchase_requests / subcon_work_orders.
--
-- Also: the app could insert any row into audit_log (policy audit_log_ins was
-- is_user() only), so a forged "edit" entry was possible. The app itself writes
-- only 'delete' (archive before delete) and 'restore' rows; the policy now allows
-- only those, and audit_log_stamp_client sets performed_by / performed_at from the
-- server for rows the app writes. Database functions (security definer) are
-- unaffected.
--
-- Read it: Finance › Accounting home › Audit Trail, or the History button on a
-- bill (Payables › Bills). Query:
--   select performed_at, performed_by, action, reason, changed_fields
--     from audit_log
--    where (table_name = 'payables' and record_id = '<bill id>')
--       or (table_name = 'payable_payments'
--           and '<bill id>' in (snapshot->>'payable_id', old_snapshot->>'payable_id'))
--    order by performed_at;
--
-- Restore a deleted bill or payment:
--   insert into public.payables select * from jsonb_populate_record(null::public.payables,
--     (select snapshot from public.audit_log where table_name = 'payables'
--       and action = 'delete' and record_id = '<id>' order by performed_at desc limit 1));
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.audit_money_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor   text := coalesce(nullif(public.app_username(), ''), 'system');
  changed text[];
  rid     text;
  why     text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
    values (tg_table_name, new.id::text, 'insert', to_jsonb(new), actor,
            case tg_table_name when 'payables' then 'entered'
                               when 'payable_payments' then 'payment recorded'
                               else 'created' end);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- updated_at alone is not a change (stale full-row saves touch it).
    select array_agg(n.key order by n.key) into changed
      from jsonb_each(to_jsonb(new)) n
     where n.key <> 'updated_at'
       and n.value is distinct from (to_jsonb(old) -> n.key);
    if changed is null then
      return new;
    end if;
    -- pg_trigger_depth() > 1: the change came from another trigger, e.g. a
    -- payment recomputing the bill's paid amount and status.
    why := case
      when pg_trigger_depth() > 1 and tg_table_name = 'payables' then 'updated by a payment'
      when tg_table_name = 'payable_payments' and new.status is distinct from old.status
        then 'payment ' || lower(coalesce(new.status, 'changed'))
      when tg_table_name = 'payment_runs' and new.status is distinct from old.status
        then 'run ' || lower(coalesce(new.status, 'changed'))
      else 'field edit' end;
    insert into public.audit_log
      (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
    values
      (tg_table_name, new.id::text, 'update', to_jsonb(old), to_jsonb(new), changed, actor, why);
    return new;
  end if;

  rid := old.id::text;
  insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
  values (tg_table_name, rid, 'delete', to_jsonb(old), actor, 'deleted (recorded by the database)');
  return old;
end;
$$;

revoke execute on function public.audit_money_change() from public, anon, authenticated;

create or replace trigger trg_audit_payables
  after insert or update or delete on public.payables
  for each row execute function public.audit_money_change();

create or replace trigger trg_audit_payable_payments
  after insert or update or delete on public.payable_payments
  for each row execute function public.audit_money_change();

create or replace trigger trg_audit_payment_runs
  after insert or update or delete on public.payment_runs
  for each row execute function public.audit_money_change();

-- Rows the app writes itself: who and when come from the server.
-- current_user is 'authenticated' only for a direct client insert; inside a
-- security definer function it is the function owner, so those keep their values.
create or replace function public.audit_log_stamp_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    new.performed_by := coalesce(nullif(public.app_username(), ''), new.performed_by);
    new.performed_at := now();
    new.created_at   := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_log_stamp_client() from public, anon, authenticated;

create or replace trigger trg_audit_log_stamp_client
  before insert on public.audit_log
  for each row execute function public.audit_log_stamp_client();

alter policy audit_log_ins on public.audit_log
  with check (public.is_user() and action in ('delete', 'restore'));

-- ROLLBACK
-- alter policy audit_log_ins on public.audit_log with check (public.is_user());
-- drop trigger if exists trg_audit_log_stamp_client on public.audit_log;
-- drop function if exists public.audit_log_stamp_client();
-- drop trigger if exists trg_audit_payment_runs on public.payment_runs;
-- drop trigger if exists trg_audit_payable_payments on public.payable_payments;
-- drop trigger if exists trg_audit_payables on public.payables;
-- drop function if exists public.audit_money_change();
-- (audit_log rows written meanwhile are kept; they are history.)
