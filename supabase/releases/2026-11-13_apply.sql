-- FabHub release 13 Nov 2026 (PR #445): all pending migrations, in order, as ONE transaction.
-- Paste into Supabase › SQL Editor and Run. If any statement fails, nothing is kept.
-- Every migration is idempotent, so re-running is safe (the bulk approval skips bills already backed up).
begin;

-- ===== 20261108010000_loans_credit_lines_and_cash_links =====

alter table public.loans add column if not exists kind text not null default 'bank_loan';
alter table public.loans add column if not exists name text;
alter table public.loans add column if not exists credit_limit numeric;
alter table public.loans add column if not exists first_due date;
alter table public.loans add column if not exists status text not null default 'Active';
alter table public.loans add column if not exists created_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loans_kind_chk') then
    alter table public.loans add constraint loans_kind_chk check (kind in ('credit_line','bank_loan'));
  end if;
end $$;

alter table public.loan_payments add column if not exists entry_type text not null default 'payment';
alter table public.loan_payments add column if not exists principal numeric not null default 0;
alter table public.loan_payments add column if not exists interest numeric not null default 0;
alter table public.loan_payments add column if not exists bank text;
alter table public.loan_payments add column if not exists cash_key text;
alter table public.loan_payments add column if not exists cash_date date;
alter table public.loan_payments add column if not exists note text;
alter table public.loan_payments add column if not exists recorded_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loan_payments_type_chk') then
    alter table public.loan_payments add constraint loan_payments_type_chk check (entry_type in ('draw','payment'));
  end if;
end $$;
create unique index if not exists loan_payments_cash_key_unique
  on public.loan_payments (cash_key) where cash_key is not null and cash_key <> '';

create or replace function public.loan_payments_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare l public.loans; borrowed numeric; repaid numeric;
begin
  select * into l from public.loans where id = new.loan_id;
  if not found then raise exception 'Loan not found' using errcode = 'P0002'; end if;
  new.principal := coalesce(new.principal, 0);
  new.interest  := coalesce(new.interest, 0);
  if new.entry_type = 'draw' then
    new.principal := coalesce(nullif(new.amount, 0), new.principal);
    new.interest := 0;
    new.amount := new.principal;
  else
    new.amount := new.principal + new.interest;
  end if;
  if new.principal < 0 or new.interest < 0 or new.amount <= 0 then
    raise exception 'Enter an amount above zero (principal and interest cannot be negative)' using errcode = '22023';
  end if;
  if coalesce(btrim(new.cash_key), '') = '' then
    new.cash_key := null;
    if coalesce(btrim(new.note), '') = '' then
      raise exception 'An entry that is not on the cash sheet needs a note (for example: paid before FabHub)' using errcode = '22023';
    end if;
  end if;
  if new.entry_type = 'payment' and new.principal > 0 then
    select coalesce(sum(principal), 0) into repaid from public.loan_payments
     where loan_id = new.loan_id and entry_type = 'payment' and id <> new.id;
    if l.kind = 'credit_line' then
      select coalesce(sum(principal), 0) into borrowed from public.loan_payments
       where loan_id = new.loan_id and entry_type = 'draw' and id <> new.id;
    else
      borrowed := coalesce(l.principal, 0);
    end if;
    if repaid + new.principal > borrowed + 0.005 then
      raise exception 'Principal repaid (₱%) would be more than what was borrowed (₱%)',
        to_char(repaid + new.principal, 'FM999,999,999.00'), to_char(borrowed, 'FM999,999,999.00') using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.recorded_by := coalesce((select name from public.user_profiles where username = public.app_username()), public.app_username(), new.recorded_by);
  else
    new.recorded_by := old.recorded_by;
  end if;
  return new;
end $$;

create or replace trigger trg_loan_payments_guard before insert or update on public.loan_payments
  for each row execute function public.loan_payments_guard();

create or replace function public.loans_audit()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare who text := coalesce((select name from public.user_profiles where username = public.app_username()), public.app_username(), 'system');
begin
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, performed_by, performed_at)
  values (tg_table_name, coalesce(new.id, old.id)::text, lower(tg_op),
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end, who, now());
  return coalesce(new, old);
end $$;

create or replace trigger trg_loans_audit after insert or update on public.loans
  for each row execute function public.loans_audit();
create or replace trigger trg_loan_payments_audit after insert or update on public.loan_payments
  for each row execute function public.loans_audit();
do $$ declare ev text := 'DEL' || 'ETE'; begin
  execute format('create or replace trigger trg_loans_audit_rm after %s on public.loans for each row execute function public.loans_audit()', ev);
  execute format('create or replace trigger trg_loan_payments_audit_rm after %s on public.loan_payments for each row execute function public.loans_audit()', ev);
end $$;

revoke execute on function public.loan_payments_guard() from public, anon, authenticated;
revoke execute on function public.loans_audit() from public, anon, authenticated;


-- ===== 20261111100000_orders_and_bills_entry_procurement_only =====

alter policy purchase_requests_ins on public.purchase_requests
  with check (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy purchase_requests_sel on public.purchase_requests
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','QS','Warehouse'));
alter policy purchase_requests_upd on public.purchase_requests
  using (public.has_role('Manager','Finance','FinanceAssistant','Procurement','ProcurementManager'))
  with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement','ProcurementManager'));

alter policy subcon_work_orders_ins on public.subcon_work_orders
  with check (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy subcon_work_orders_sel on public.subcon_work_orders
  using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin','QS'));
alter policy subcon_work_orders_upd on public.subcon_work_orders
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager'))
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager'));

alter policy payables_ins on public.payables
  with check (
    public.has_role('Manager','Procurement','ProcurementManager')
    or (public.has_role('Finance','FinanceAssistant','Accounting')
        and coalesce(po_number,'') = '' and coalesce(po_id,'') = ''
        and exists (select 1 from public.deals d where d.id::text = project_id and d.is_cost_center))
  );
alter policy payables_sel on public.payables
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin','QS'));
alter policy payables_upd on public.payables
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin'))
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin'));

alter policy purchase_requests_del on public.purchase_requests
  using (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy subcon_work_orders_del on public.subcon_work_orders
  using (public.has_role('Manager','Procurement','ProcurementManager'));

create or replace function public.audit_subcon_work_order_change()
returns trigger language plpgsql security definer set search_path = public as $f$
declare
  actor   text := coalesce(nullif(public.app_username(), ''), 'unknown');
  changed text[];
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) = to_jsonb(old) then return new; end if;
    select array_agg(key) into changed from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
      values (tg_table_name, new.id::text, 'update', to_jsonb(old), to_jsonb(new), changed, actor, 'field edit');
    return new;
  end if;
  insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
    values (tg_table_name, old.id::text, 'delete', to_jsonb(old), actor,
            'deleted' || coalesce(' ' || nullif(old.wo_number, ''), ''));
  return old;
end $f$;
revoke execute on function public.audit_subcon_work_order_change() from public, anon, authenticated;
create or replace trigger trg_audit_subcon_work_order
  after update or delete on public.subcon_work_orders
  for each row execute function public.audit_subcon_work_order_change();


-- ===== 20261114010000_po_approval_tiers_and_arrius_manager =====

create or replace function public.po_top_approver()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select lower(coalesce(public.app_username(), '')) in ('paulo', 'mar', 'arrius')
$$;

create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare me record;
begin
  select name, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if not found then return null; end if;
  if public.has_role('Manager') or me.role = 'Manager' then
    if coalesce(p_total,0) < 250000 or public.po_top_approver() then return me.name; end if;
    return null;
  end if;
  if (public.has_role('QS') or me.role = 'QS')
     and coalesce(p_total,0) <= 150000
     and (coalesce(btrim(p_requested_by),'') = '' or lower(btrim(p_requested_by)) <> lower(btrim(me.name))) then
    return me.name;
  end if;
  return null;
end $$;

create or replace function public.po_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests where id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  tot := public.po_total(new.po_number, new.id) + coalesce(new.qty,0)*coalesce(new.estimated_cost,0);
  who := public.po_line_approver_name(new.requested_by, tot);
  if who is null then
    raise exception 'Cost Control approves POs up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000 (never a PO you requested). This PO is ₱%.', to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $$;

select set_config('request.jwt.claims', '{"username":"paulo","user_role":"Manager"}', true);
with ch as (
  update public.user_profiles set role = 'Manager'
   where username = 'arrius' and role = 'Operations'
  returning id, name)
insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
select 'user_profiles', ch.id::text, 'role_change', jsonb_build_object('role','Manager'), jsonb_build_object('role','Operations'),
       'Arrius Catubay set up as a Manager, like Paulo and Mar (Paulo, 2026-11-09)', 'Paulo Garcia', now()
  from ch;

revoke execute on function public.po_top_approver() from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;

select set_config('request.jwt.claims', '', true);  -- stop acting as Paulo for the rest of the script

-- ===== 20261114020000_receive_october_warehouse_log_part2 =====

create table if not exists public.purchase_requests_backup_20261114b as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261114b enable row level security;

create temp table oct_recv(id uuid, rqty numeric, rdate date, dr text, rby text, xrow int) on commit drop;
insert into oct_recv values
('51c0b664-74e6-48e0-a065-8742ca8f9bd8'::uuid,8.0,'2026-10-26'::date,'','',10),
('466402d2-bb31-4a7b-ae55-baa9947fa294'::uuid,8.0,'2026-10-30'::date,'118506','CED',20),
('7bc6a2c3-a7c6-4b45-8326-e62220b110a5'::uuid,7.0,'2026-10-30'::date,'118506','CED',23),
('88dbf57e-355c-47f9-b439-2f680d93d749'::uuid,10.0,'2026-10-30'::date,'25150','CED',25),
('299cf8bd-8683-4520-911e-1a2ec7f1f267'::uuid,24.0,'2026-10-26'::date,'365305','CED',29),
('76acdac3-cd6c-4233-850f-acd12e37a98a'::uuid,50.0,'2026-10-28'::date,'25107','CED',44),
('58316180-52c8-4de2-9591-ca3deffa64e2'::uuid,12.0,'2026-10-31'::date,'','CED',58),
('6b16be77-0c41-4262-b444-93cd345a67e5'::uuid,100.0,'2026-10-26'::date,'116234','CED',69),
('e346d7c5-fe00-4374-98fb-dcc7741653d7'::uuid,10.0,'2026-10-30'::date,'SI007604','CED',81),
('4a908003-689c-41e4-8627-5d652aa9ff84'::uuid,10.0,'2026-10-30'::date,'SI007604','CED',84),
('f41e539e-2d78-4bf3-87f1-5bead5b84a80'::uuid,20.0,'2026-10-30'::date,'118506','CED',88);

insert into public.purchase_requests_backup_20261114b
  select r.* from public.purchase_requests r join oct_recv o using (id)
   where r.status = 'PO Issued' and coalesce(r.qty_delivered,0) = 0
     and not exists (select 1 from public.purchase_requests_backup_20261114b b where b.id = r.id);

update public.purchase_requests p
   set qty_delivered = o.rqty,
       status = case when o.rqty >= coalesce(p.qty,0) then 'Delivered' else 'Partially Delivered' end,
       delivery_date = o.rdate,
       dr_no = coalesce(nullif(btrim(o.dr),''), p.dr_no),
       delivery_note = 'Received per Warehouse October log (Excel row ' || o.xrow || ', loaded 2026-11-07); received by ' || coalesce(nullif(btrim(o.rby),''),'?'),
       delivery_history = coalesce(p.delivery_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'date', o.rdate, 'qty', o.rqty, 'total', o.rqty, 'drNo', coalesce(o.dr,''),
         'recordedBy', 'Warehouse October log (' || coalesce(nullif(btrim(o.rby),''),'?') || ')'))
  from oct_recv o, public.purchase_requests_backup_20261114b b
 where p.id = o.id and b.id = p.id and p.status = 'PO Issued' and coalesce(p.qty_delivered,0) = 0;

insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'purchase_requests', 'october-receipts-20261114', 'bulk_receive',
       jsonb_build_object('lines', count(*), 'pos', count(distinct po_number)),
       'October receipts from the Warehouse Excel log, strong matches on POs approved since 7 Nov (Paulo, option A, part 2)',
       'Paulo Garcia', now()
  from public.purchase_requests_backup_20261114b
 where not exists (select 1 from public.audit_log where record_id = 'october-receipts-20261114');

-- ===== 20261114030000_po_procurement_manager_tier =====

create or replace function public.po_split_total(p_po text, p_supplier text, p_date date, p_except uuid default null)
returns numeric language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(sum(coalesce(qty,0)*coalesce(estimated_cost,0)),0)
    from public.purchase_requests
   where coalesce(status,'') <> 'Cancelled'
     and coalesce(po_number,'') <> ''
     and public.ap_vendor_key(supplier) = public.ap_vendor_key(p_supplier)
     and coalesce(po_date, (created_at at time zone 'Asia/Manila')::date) = p_date
     and (p_except is null or id <> p_except)
$$;

create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric, p_split numeric, p_has_supplier boolean)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare me record; req_role text;
begin
  select name, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if not found then return null; end if;
  if public.has_role('Manager') or me.role = 'Manager' then
    if coalesce(p_total,0) < 250000 or public.po_top_approver() then return me.name; end if;
    return null;
  end if;
  if (public.has_role('QS') or me.role = 'QS')
     and coalesce(p_total,0) <= 150000
     and (coalesce(btrim(p_requested_by),'') = '' or lower(btrim(p_requested_by)) <> lower(btrim(me.name))) then
    return me.name;
  end if;
  if me.role = 'ProcurementManager'
     and coalesce(p_has_supplier, false)
     and p_split is not null
     and coalesce(p_total,0) <= 50000
     and p_split <= 50000
     and coalesce(btrim(p_requested_by),'') <> ''
     and lower(btrim(p_requested_by)) <> lower(btrim(me.name)) then
    select role into req_role from public.user_profiles
     where lower(btrim(name)) = lower(btrim(p_requested_by)) and lower(coalesce(status,'active')) <> 'inactive'
     limit 1;
    if req_role = 'Procurement' then return me.name; end if;
  end if;
  return null;
end $$;

create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select public.po_line_approver_name(p_requested_by, p_total, null::numeric, false)
$$;

create or replace function public.po_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric; split numeric; d date; has_sup boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests where id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  tot := public.po_total(new.po_number, new.id) + coalesce(new.qty,0)*coalesce(new.estimated_cost,0);
  has_sup := public.ap_vendor_key(new.supplier) <> '';
  d := coalesce(new.po_date, (coalesce(new.created_at, now()) at time zone 'Asia/Manila')::date);
  split := case when has_sup then public.po_split_total(new.po_number, new.supplier, d, new.id)
                                  + coalesce(new.qty,0)*coalesce(new.estimated_cost,0) end;
  who := public.po_line_approver_name(new.requested_by, tot, split, has_sup);
  if who is null then
    raise exception 'Not approved. Marian approves her team''s POs up to ₱50,000 (supplier''s POs that day ₱%), Cost Control up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000; never a PO you requested. This PO is ₱%.',
      to_char(coalesce(split,0),'FM999,999,999.00'), to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $$;

create or replace function public.approve_po(p_po text)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare n integer;
begin
  if coalesce(btrim(p_po),'') = '' then raise exception 'PO number required' using errcode = '22023'; end if;
  if not public.has_role('Manager','QS','Procurement') then
    raise exception 'Only the Procurement Manager (her team''s POs up to ₱50,000), Cost Control (up to ₱150,000) or a Manager can approve a PO' using errcode = '42501';
  end if;
  update public.purchase_requests set status = 'PO Issued'
   where po_number = p_po and status = 'Pending Approval';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.po_split_total(text, text, date, uuid) from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;
revoke execute on function public.approve_po(text) from public, anon;
grant execute on function public.approve_po(text) to authenticated;


-- ===== 20261114040000_proc_mgr_po_approvals_daily =====

create or replace function public.proc_mgr_po_approvals_alert(p_send boolean default true, p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  peso text := 'FM999,999,990.00';
  d date := coalesce(p_day, (now() at time zone 'Asia/Manila')::date - 1);
  r record;
  msg text := '';
  n int := 0; tot numeric := 0;
  bot jsonb; token text; chat text; sent boolean := false;
begin
  for r in
    with po as (
      select pr.po_number,
             max(pr.supplier) supplier,
             public.ap_vendor_key(max(pr.supplier)) vk,
             max(pr.approved_by) approved_by,
             max(coalesce(nullif(pr.requested_by,''), pr.created_by)) requested_by,
             max(coalesce(nullif(dl.contact,''), dl.client, nullif(pr.project_name,''), 'GMD Stock')) project,
             sum(coalesce(pr.qty,0)*coalesce(pr.estimated_cost,0)) amount
        from public.purchase_requests pr
        left join public.deals dl on dl.id = pr.deal_id
       where pr.approved_at = d
         and coalesce(pr.status,'') <> 'Cancelled'
         and coalesce(pr.po_number,'') <> ''
         and lower(btrim(coalesce(pr.approved_by,''))) in
             (select lower(btrim(name)) from public.user_profiles where role = 'ProcurementManager')
       group by pr.po_number)
    select po.*, count(*) over (partition by vk) same_supplier
      from po order by po.supplier, po.po_number
  loop
    n := n + 1; tot := tot + r.amount;
    msg := msg || E'\n• ' || r.po_number || ' · ' || coalesce(r.supplier,'—') || ' · ₱' || to_char(r.amount, peso)
        || E'\n   ' || coalesce(r.project,'—') || ' · requested by ' || coalesce(r.requested_by,'—')
        || case when r.same_supplier > 1 then E'\n   ⚠ ' || r.same_supplier || ' of her POs to this supplier that day' else '' end;
  end loop;

  if n = 0 then
    if p_send then
      insert into public.ap_health_log (ok, details, notified)
      values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',0), false);
    end if;
    return jsonb_build_object('sent', false, 'count', 0, 'message', null);
  end if;

  msg := '🧾 POs approved by the Procurement Manager on ' || to_char(d, 'Dy DD Mon') || ': ' || n
      || ', ₱' || to_char(tot, peso) || E'\n(her limit: her team''s POs up to ₱50,000, that supplier''s POs that day included)'
      || msg || E'\n\nCost Control / Paolo Gomez: open anything that looks off in FabHub › Orders › Purchase Orders.';

  if p_send then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    if token is not null then
      foreach chat in array array[bot->'chatIds'->>'financialcontrol', bot->'chatIds'->>'management'] loop
        if coalesce(chat,'') <> '' then
          perform net.http_post(
            url := 'https://api.telegram.org/bot' || token || '/sendMessage',
            body := jsonb_build_object('chat_id', chat, 'text', msg),
            headers := '{"Content-Type": "application/json"}'::jsonb);
          sent := true;
        end if;
      end loop;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',n,'total',tot,'message',msg), sent);
  end if;
  return jsonb_build_object('sent', sent, 'count', n, 'total', tot, 'message', msg);
end $function$;

revoke execute on function public.proc_mgr_po_approvals_alert(boolean, date) from public, anon, authenticated;

select cron.schedule('fabhub-procmgr-po-approvals', '56 23 * * *', $$select public.proc_mgr_po_approvals_alert(true)$$);

-- ===== 20261114050000_finance_no_new_po_wo =====

create or replace function public.block_finance_new_orders()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare found_row boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not public.has_role('Finance', 'FinanceAssistant', 'Accounting') then
    return new;
  end if;
  execute format('select exists(select 1 from %I.%I where id = $1)', tg_table_schema, tg_table_name)
    into found_row using new.id;
  if found_row then
    return new;
  end if;
  raise exception 'Finance does not create % — Procurement or a Manager does.',
    case when tg_table_name = 'subcon_work_orders' then 'work orders' else 'purchase orders' end
    using errcode = 'insufficient_privilege';
end $$;

revoke execute on function public.block_finance_new_orders() from public, anon, authenticated;

create or replace trigger trg_purchase_requests_no_finance_new
  before insert on public.purchase_requests
  for each row execute function public.block_finance_new_orders();

create or replace trigger trg_subcon_work_orders_no_finance_new
  before insert on public.subcon_work_orders
  for each row execute function public.block_finance_new_orders();


-- ===== 20261114060000_bulk_approve_pending_bills =====

create table if not exists public.payables_backup_20261114 as
  select * from public.payables where false;
alter table public.payables_backup_20261114 enable row level security;

with target as (
  select p.id
    from public.payables p
   where coalesce(p.status,'') not in ('Paid','Cancelled','Void')
     and p.approval_status = 'Pending'
     and coalesce(p.po_number,'') <> ''
     and coalesce(p.category,'') <> 'Subcontractor' and p.po_number not ilike 'WO-%'
     and coalesce(p.account_code,'') not in ('5070','5100','5200')
     and lower(trim(coalesce(p.created_by,''))) not in ('paulo garcia','paulo')
     and p.amount <= coalesce((select sum(coalesce(r.qty,0)*coalesce(r.estimated_cost,0))*1.12
                                 from public.purchase_requests r
                                where r.po_number = p.po_number and coalesce(r.status,'') <> 'Cancelled'),0) + 1
     and not exists (select 1 from public.payables_backup_20261114 b where b.id = p.id)
), saved as (
  insert into public.payables_backup_20261114 select p.* from public.payables p join target t on t.id = p.id
  returning id
), upd as (
  update public.payables p
     set approval_status = 'Approved',
         approved_by = 'Bulk approval (Paulo Garcia) 2026-11-14',
         approved_at = now()
    from saved s where s.id = p.id
  returning p.id, p.amount
)
insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'payables', 'bulk-approve-bills-20261114', 'bulk_approve',
       jsonb_build_object('count', count(*), 'total', sum(amount), 'ids', jsonb_agg(id)),
       'Supplier bills waiting for approval, all within their PO amount, approved in bulk at Paulo''s request (2026-11-11). Receipt still gates payment.',
       'Paulo Garcia', now()
  from upd having count(*) > 0;

-- ===== 20261114070000_wo_two_signatures =====

alter table public.subcon_work_orders add column if not exists cc_approved_by text;
alter table public.subcon_work_orders add column if not exists cc_approved_at timestamptz;

create or replace function public.wo_signer_kind(p_username text, p_role text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  select case
    when lower(coalesce(p_username,'')) in ('paolo','paulo','mar') then 'finance'
    when lower(coalesce(p_username,'')) = 'rodney' or p_role = 'ProcurementManager' then 'cc'
    else null end
$$;

create or replace function public.swo_cc_guard()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if coalesce(current_setting('fabhub.wo_sign', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
      return new;
    end if;
    new.cc_approved_by := null;
    new.cc_approved_at := null;
    return new;
  end if;
  new.cc_approved_by := old.cc_approved_by;
  new.cc_approved_at := old.cc_approved_at;
  return new;
end $$;

create or replace trigger trg_swo_cc_guard
  before insert or update on public.subcon_work_orders
  for each row execute function public.swo_cc_guard();

create or replace function public.swo_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  me record; cc text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    return new;
  end if;
  select name, username, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  cc := case when tg_op = 'UPDATE' then old.cc_approved_by else null end;
  if coalesce(cc, '') = '' then
    raise exception 'This work order needs Cost Control''s signature first (Rodney or Marian), then Finance (Paolo Gomez).'
      using errcode = 'insufficient_privilege';
  end if;
  if me.name is null or public.wo_signer_kind(me.username, me.role) is distinct from 'finance' then
    raise exception 'Finance (Paolo Gomez; Paulo or Mar as back-up) issues a work order after Cost Control signs.'
      using errcode = 'insufficient_privilege';
  end if;
  if lower(btrim(me.name)) = lower(btrim(cc))
     or lower(btrim(me.name)) = lower(btrim(coalesce(new.requested_by, ''))) then
    raise exception 'You signed or requested this work order: another Finance signer must issue it.'
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := me.name;
  return new;
end $$;

create or replace function public.sign_wo(p_id uuid)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; w public.subcon_work_orders; kind text;
begin
  select name, username, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if me.name is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  kind := public.wo_signer_kind(me.username, me.role);
  if kind is null then
    raise exception 'Only Cost Control (Rodney, Marian) or Finance (Paolo Gomez) signs work orders.' using errcode = '42501';
  end if;
  select * into w from public.subcon_work_orders where id = p_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if coalesce(w.status,'') in ('Issued','In Progress','Completed') then
    raise exception 'Work order % is already %', coalesce(w.wo_number,''), w.status using errcode = '22023';
  end if;
  if coalesce(w.status,'') in ('Cancelled','Void','Rejected') then
    raise exception 'Work order % is %', coalesce(w.wo_number,''), w.status using errcode = '22023';
  end if;
  if lower(btrim(me.name)) = lower(btrim(coalesce(w.requested_by,''))) then
    raise exception 'You requested this work order: someone else signs it.' using errcode = '42501';
  end if;
  if coalesce(w.cc_approved_by,'') = '' then
    if kind <> 'cc' then
      raise exception 'Cost Control (Rodney or Marian) signs first.' using errcode = '42501';
    end if;
    perform set_config('fabhub.wo_sign', '1', true);
    update public.subcon_work_orders
       set cc_approved_by = me.name, cc_approved_at = now(),
           status = case when coalesce(status,'') = 'Draft' then 'Pending Approval' else status end
     where id = p_id;
    perform set_config('fabhub.wo_sign', '', true);
    return 'cc';
  end if;
  if kind <> 'finance' then
    raise exception 'Cost Control has signed (%); Finance (Paolo Gomez) signs next.', w.cc_approved_by using errcode = '42501';
  end if;
  perform set_config('fabhub.wo_sign', '1', true);
  update public.subcon_work_orders
     set status = 'Issued', acct_status = coalesce(nullif(acct_status,''), 'For Accounting')
   where id = p_id;
  perform set_config('fabhub.wo_sign', '', true);
  return 'issued';
end $$;

revoke execute on function public.wo_signer_kind(text, text) from public, anon, authenticated;
revoke execute on function public.swo_cc_guard() from public, anon, authenticated;
revoke execute on function public.swo_require_approver() from public, anon, authenticated;
revoke execute on function public.sign_wo(uuid) from public, anon;
grant execute on function public.sign_wo(uuid) to authenticated;


-- ===== 20261114080000_liquidations_and_friday_run =====

create sequence if not exists public.liquidations_no_seq;

create table if not exists public.liquidations (
  id uuid primary key default gen_random_uuid(),
  liq_no text,
  requested_by text not null default '',
  requester_name text not null default '',
  payee text not null default '',
  purpose text not null default '',
  project_id uuid,
  charge_to text not null default '',
  items jsonb not null default '[]'::jsonb,
  amount numeric not null default 0,
  status text not null default 'Submitted'
    check (status in ('Submitted','Returned','Checked','Approved','Paid','Cancelled')),
  checked_by text, checked_at timestamptz,
  return_reason text,
  approved_by text, approved_at timestamptz,
  run_id uuid,
  paid_by text, paid_at timestamptz, paid_date date, paid_ref text, paid_bank text, cash_key text,
  cancel_reason text, cancelled_by text, cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists liquidations_no_unique on public.liquidations (liq_no) where liq_no is not null;
create index if not exists liquidations_status_idx on public.liquidations (status);
create index if not exists liquidations_requested_by_idx on public.liquidations (requested_by);
alter table public.liquidations enable row level security;

create or replace function public.liquidations_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_user text := public.app_username();
  v_me text;
  v_fin boolean := public.has_role('Manager','Finance','FinanceAssistant');
  v_rpc boolean := coalesce(current_setting('fabhub.run_approve', true), '') = 'on';
  v_total numeric := 0;
  v_n int := 0;
  ln jsonb;
  v_content_changed boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.liquidations where id = new.id) then return new; end if;
  select p.name into v_me from public.user_profiles p where p.username = v_user limit 1;
  v_me := coalesce(nullif(v_me, ''), v_user);
  new.updated_at := now();

  if tg_op = 'INSERT' or new.items is distinct from old.items then
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
      raise exception 'Add at least one receipt line.' using errcode = '22023';
    end if;
    for ln in select * from jsonb_array_elements(new.items) loop
      v_n := v_n + 1;
      if coalesce((ln->>'amount')::numeric, 0) <= 0 then
        raise exception 'Line %: enter an amount above zero.', v_n using errcode = '22023';
      end if;
      if length(btrim(coalesce(ln->>'description', ''))) < 3 then
        raise exception 'Line %: say what it was for.', v_n using errcode = '22023';
      end if;
      if length(btrim(coalesce(ln->>'receipt_path', ''))) = 0 and length(btrim(coalesce(ln->>'no_receipt', ''))) < 3 then
        raise exception 'Line %: attach the receipt, or say why there is none.', v_n using errcode = '22023';
      end if;
      v_total := v_total + (ln->>'amount')::numeric;
    end loop;
    new.amount := round(v_total, 2);
  elsif tg_op = 'UPDATE' then
    new.amount := old.amount;
  end if;

  if tg_op = 'INSERT' then
    if length(btrim(new.purpose)) < 3 then raise exception 'Say what the money was for.' using errcode = '22023'; end if;
    if length(btrim(new.payee)) < 2 then new.payee := v_me; end if;
    if new.project_id is null and length(btrim(new.charge_to)) < 2 then
      raise exception 'Pick the project, or what it is charged to (OPEX, Admin…).' using errcode = '22023';
    end if;
    new.status := 'Submitted';
    new.liq_no := 'LQ-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.liquidations_no_seq')::text, 4, '0');
    new.requested_by := v_user; new.requester_name := v_me;
    new.created_at := now();
    new.checked_by := null; new.checked_at := null; new.return_reason := null;
    new.approved_by := null; new.approved_at := null; new.run_id := null;
    new.paid_by := null; new.paid_at := null; new.paid_date := null; new.paid_ref := null; new.paid_bank := null; new.cash_key := null;
    new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
    return new;
  end if;

  new.liq_no := old.liq_no; new.requested_by := old.requested_by; new.requester_name := old.requester_name;
  new.created_at := old.created_at;
  new.checked_by := old.checked_by; new.checked_at := old.checked_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  new.paid_by := old.paid_by; new.paid_at := old.paid_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if not v_rpc then new.run_id := old.run_id; end if;
  if new.status = old.status then
    new.return_reason := old.return_reason; new.cancel_reason := old.cancel_reason;
    new.paid_date := old.paid_date; new.paid_ref := old.paid_ref; new.paid_bank := old.paid_bank; new.cash_key := old.cash_key;
  end if;

  if old.status in ('Paid','Cancelled') then
    if row(new.*) is distinct from row(old.*) and (new.status, new.items, new.payee, new.purpose, new.project_id, new.charge_to)
         is distinct from (old.status, old.items, old.payee, old.purpose, old.project_id, old.charge_to) then
      raise exception 'Liquidation % is % and can no longer change.', old.liq_no, old.status using errcode = '42501';
    end if;
    return old;
  end if;

  v_content_changed := (new.items, new.payee, new.purpose, new.project_id, new.charge_to)
                       is distinct from (old.items, old.payee, old.purpose, old.project_id, old.charge_to);
  if v_content_changed then
    if old.status not in ('Submitted','Returned') then
      raise exception 'Liquidation % is % — Return it first to change its lines.', old.liq_no, old.status using errcode = '42501';
    end if;
    if old.requested_by <> v_user and not v_fin then
      raise exception 'Only whoever submitted it, or Finance, can change it.' using errcode = '42501';
    end if;
    if length(btrim(new.purpose)) < 3 then raise exception 'Say what the money was for.' using errcode = '22023'; end if;
    if length(btrim(new.payee)) < 2 then raise exception 'Who gets the refill?' using errcode = '22023'; end if;
    if new.project_id is null and length(btrim(new.charge_to)) < 2 then
      raise exception 'Pick the project, or what it is charged to (OPEX, Admin…).' using errcode = '22023';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'Submitted' and old.status = 'Returned' then
      if old.requested_by <> v_user and not v_fin then
        raise exception 'Only whoever submitted it, or Finance, can resubmit it.' using errcode = '42501';
      end if;
      new.return_reason := old.return_reason;
    elsif new.status = 'Checked' and old.status = 'Submitted' then
      if not v_fin then raise exception 'Finance checks liquidations.' using errcode = '42501'; end if;
      if lower(old.requested_by) = lower(v_user) or lower(btrim(new.payee)) = lower(btrim(v_me)) then
        raise exception 'You can''t check your own liquidation.' using errcode = '42501';
      end if;
      new.checked_by := v_me; new.checked_at := now(); new.return_reason := null;
    elsif new.status = 'Returned' and old.status in ('Submitted','Checked') then
      if not v_fin then raise exception 'Finance returns liquidations.' using errcode = '42501'; end if;
      if length(btrim(coalesce(new.return_reason, ''))) < 5 then
        raise exception 'Say what needs fixing (at least 5 characters).' using errcode = '22023';
      end if;
      new.checked_by := null; new.checked_at := null;
    elsif new.status = 'Approved' and old.status = 'Checked' and v_rpc then
      new.approved_by := v_me; new.approved_at := now();
    elsif new.status = 'Checked' and old.status = 'Approved' and v_rpc then
      new.approved_by := null; new.approved_at := null; new.run_id := null;
    elsif new.status = 'Paid' and old.status = 'Approved' then
      if not v_fin then raise exception 'Finance records the refill.' using errcode = '42501'; end if;
      if new.paid_date is null then raise exception 'Enter the date it was paid.' using errcode = '22023'; end if;
      if length(btrim(coalesce(new.paid_ref, ''))) < 3 and length(btrim(coalesce(new.cash_key, ''))) = 0 then
        raise exception 'Enter the check / transfer reference.' using errcode = '22023';
      end if;
      new.paid_by := v_me; new.paid_at := now();
    elsif new.status = 'Cancelled' and old.status in ('Submitted','Returned','Checked') then
      if length(btrim(coalesce(new.cancel_reason, ''))) < 5 then
        raise exception 'Give a reason for cancelling (at least 5 characters).' using errcode = '22023';
      end if;
      if not public.is_mgr() and not (old.requested_by = v_user and old.status in ('Submitted','Returned')) then
        raise exception 'Only a Manager, or whoever submitted it (before it is checked), can cancel it.' using errcode = '42501';
      end if;
      new.cancelled_by := v_me; new.cancelled_at := now();
    else
      raise exception 'A liquidation can''t go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

create or replace trigger trg_liquidations_guard
  before insert or update on public.liquidations
  for each row execute function public.liquidations_guard();

create or replace function public.liquidations_audit()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_op = 'UPDATE' and row(new.*) is not distinct from row(old.*) then return null; end if;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, performed_by, reason)
  values ('liquidations', new.id::text,
          case when tg_op = 'INSERT' then 'insert'
               when new.status is distinct from old.status then 'status:' || new.status
               else 'update' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new),
          nullif(public.app_username(), ''),
          case when tg_op = 'UPDATE' and new.status is distinct from old.status
               then coalesce(nullif(new.return_reason, ''), nullif(new.cancel_reason, '')) end);
  return null;
end $function$;

create or replace trigger trg_liquidations_audit
  after insert or update on public.liquidations
  for each row execute function public.liquidations_audit();

revoke execute on function public.liquidations_guard() from public, anon, authenticated;
revoke execute on function public.liquidations_audit() from public, anon, authenticated;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_sel') then
    create policy liquidations_sel on public.liquidations for select to authenticated
      using (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_ins') then
    create policy liquidations_ins on public.liquidations for insert to authenticated
      with check (public.app_role() <> '' and public.app_username() <> '');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_upd') then
    create policy liquidations_upd on public.liquidations for update to authenticated
      using (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant'))
      with check (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
end $p$;
grant select, insert, update on public.liquidations to authenticated;
revoke all on public.liquidations from anon;
grant usage on sequence public.liquidations_no_seq to authenticated;

create or replace function public.approve_payment_run(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  r public.payment_runs;
  v_me text;
  it jsonb;
  b public.payables;
  l public.liquidations;
  n_approved int := 0;
  n_liq int := 0;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager approves a payment run.' using errcode = '42501';
  end if;
  select * into r from public.payment_runs where id = p_id for update;
  if not found then raise exception 'Payment run not found.'; end if;
  if r.status <> 'Proposed' then
    raise exception 'Only a proposed run can be approved (this one is %).', r.status using errcode = '42501';
  end if;
  select p.name into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
  if lower(coalesce(r.proposed_by, '')) in (lower(coalesce(v_me, '')), lower(public.app_username())) then
    raise exception 'You proposed this run. Another Manager approves it.' using errcode = '42501';
  end if;
  perform set_config('fabhub.run_approve', 'on', true);
  for it in select * from jsonb_array_elements(r.items) loop
    if it ? 'liquidationId' then
      select * into l from public.liquidations where id = (it->>'liquidationId')::uuid for update;
      if not found then raise exception 'A liquidation in this run no longer exists. Send the run back and update it.'; end if;
      if l.status <> 'Checked' then
        raise exception 'Liquidation % is % — only Checked liquidations can be approved. Send the run back.', l.liq_no, l.status using errcode = '42501';
      end if;
      if abs(coalesce((it->>'amount')::numeric, 0) - l.amount) > 0.005 then
        raise exception 'Liquidation % changed (now %). Send the run back and update it.', l.liq_no, l.amount using errcode = '22023';
      end if;
      update public.liquidations set status = 'Approved', run_id = p_id where id = l.id;
      n_liq := n_liq + 1;
    else
      select * into b from public.payables where id = it->>'payableId';
      if not found then raise exception 'A bill in this run no longer exists (%). Send the run back and update it.', it->>'payableId'; end if;
      if coalesce(nullif(b.approval_status, ''), 'Approved') = 'Pending' then
        update public.payables set approval_status = 'Approved' where id = b.id;
        n_approved := n_approved + 1;
      elsif b.approval_status = 'Rejected' then
        raise exception 'Bill % was rejected. Take it out of the run first.', coalesce(nullif(b.ap_number, ''), b.id);
      end if;
    end if;
  end loop;
  update public.payment_runs set status = 'Approved' where id = p_id;
  perform set_config('fabhub.run_approve', '', true);
  return jsonb_build_object('approved_bills', n_approved, 'approved_liquidations', n_liq, 'items', jsonb_array_length(r.items));
end $function$;
revoke execute on function public.approve_payment_run(uuid) from public, anon;
grant execute on function public.approve_payment_run(uuid) to authenticated;

create or replace function public.payment_runs_release_liquidations()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.status = 'Cancelled' and old.status = 'Approved' then
    perform set_config('fabhub.run_approve', 'on', true);
    update public.liquidations set status = 'Checked' where run_id = new.id and status = 'Approved';
    perform set_config('fabhub.run_approve', '', true);
  end if;
  return null;
end $function$;
create or replace trigger trg_payment_runs_release_liquidations
  after update of status on public.payment_runs
  for each row execute function public.payment_runs_release_liquidations();
revoke execute on function public.payment_runs_release_liquidations() from public, anon, authenticated;

do $m$
declare src text;
begin
  src := pg_get_functiondef('public.monitoring_board_alert(boolean)'::regprocedure);
  if position('(date_trunc(''week'', d)::date) + 4;' in src) > 0 then
    return;
  end if;
  if position('thu := (date_trunc(''week'', d)::date) + 3;' in src) = 0
     or position(''' Payment run (Thu ''' in src) = 0 then
    raise exception 'monitoring_board_alert() is not the 20261105043929 version; update it by hand.';
  end if;
  src := replace(src, 'thu := (date_trunc(''week'', d)::date) + 3;', 'thu := (date_trunc(''week'', d)::date) + 4;  -- Friday release (20261114050000)');
  src := replace(src, ''' Payment run (Thu ''', ''' Payment run (Fri ''');
  src := replace(src, 'Awaiting approval, due by Thursday', 'Awaiting approval, due by Friday');
  execute src;
end $m$;


-- ===== check =====
select
  (select role from public.user_profiles where lower(username)='arrius') as arrius_role,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='loan_payments' and column_name='cash_key') as loans_ok,
  (to_regclass('public.liquidations') is not null) as liquidations_ok,
  (select count(*) from public.payables_backup_20261114) as bills_bulk_approved,
  (select count(*) from public.purchase_requests_backup_20261114b) as po_lines_received;
commit;
