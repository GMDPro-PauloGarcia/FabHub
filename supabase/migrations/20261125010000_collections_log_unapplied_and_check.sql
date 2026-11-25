-- ============================================================================
-- Migration 20261125010000 — Collections log: received-before-invoice money
-- and a Manager check on every collection
--
-- Why (Paulo, 2026-11-25): Finance (Jerwin) still keeps collections in a
-- Google Sheet ("SALE AND COLLECTION MONITORING 2026") because Billing makes
-- them find the project, then the invoice, before they can record anything.
-- The sheet has no invoice no., no reference no., the same client under four
-- names, and rows with no client or no date. Billing › Collections now looks
-- like that sheet but saves real Billing payments. Two things it needs from
-- the database:
--
-- 1. unapplied_collections — client money for a project that arrived before
--    GMD issued the invoice (a down payment paid on the PO). Paulo: client
--    project money always ends up on an invoice; reimbursements and money
--    from other sources are not collections and stay on the cash sheet
--    (🔗 "not billing"). So every row names a project, a reference and a
--    reason, does NOT reduce AR, and must be applied to the invoice(s) once
--    they are issued. Open ones older than 7 days go to management on
--    Telegram every morning.
--      record_unapplied_collection(deal, date, amount, method, bank, ref, note)
--      apply_unapplied_collection(id, payment_ids[])  → Applied
--        (the Billing payments recorded for it, on the same project family,
--         adding up to the amount within ₱1, not used by another row)
--      return_unapplied_collection(id, reason)        → Returned (Manager:
--        refunded to the client / wrong project)
--    No client insert/update/delete policies; nothing is deleted; every change
--    goes to audit_log (table_name 'unapplied_collections').
--
-- 2. A Manager check ("Checked by Paolo"): Jerwin enters, a Manager reviews.
--      billing_payments.checked_by / checked_at, unapplied_collections.checked_*
--      check_collections(payment_ids[], unapplied_ids[]) — Manager only, never
--        on a collection they recorded themselves.
--    trg_billing_payments_check_guard keeps checked_* as they are on any
--    other write, and clears them when the amount, date, reference, bank,
--    method, invoice or bounced flag of a checked payment changes (it has to
--    be checked again). Returns early on an upsert's INSERT branch when the
--    row already exists (CLAUDE.md, upserts and triggers).
--
-- unapplied_collections_alert(p_send boolean default true): Open rows older
-- than 7 days, and collections entered 7+ days ago that no Manager has
-- checked, to the management chat. (false) = dry run. Logged in ap_health_log
-- (details->>'kind' = 'unapplied_collections'). pg_cron
-- 'fabhub-unapplied-collections' 23:58 UTC = 7:58 AM Manila, daily.
--
-- App: src/views/CollectionsLog.jsx (Billing › Collections), the
-- "received before invoice" option in src/views/MultiInvoicePay.jsx,
-- COLLECTION_ROLES / unappliedFromSb (src/core.js, src/supabaseClient.js).
-- Keep them in sync. No DROP statements (apply_migration hangs on them).
-- ============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.unapplied_collections (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null references public.deals(id) on delete restrict,
  received_date       date not null,
  amount              numeric(14,2) not null check (amount > 0),
  method              text not null default '',
  bank                text not null default '',
  ref_no              text not null,
  note                text not null,
  status              text not null default 'Open' check (status in ('Open','Applied','Returned')),
  applied_payment_ids uuid[] not null default '{}',
  applied_by          text,
  applied_at          timestamptz,
  return_reason       text,
  returned_by         text,
  returned_at         timestamptz,
  entered_by          text not null,
  entered_username    text,
  created_at          timestamptz not null default now(),
  checked_by          text,
  checked_at          timestamptz
);
create index if not exists unapplied_collections_deal_idx on public.unapplied_collections(deal_id);
create index if not exists unapplied_collections_status_idx on public.unapplied_collections(status);

alter table public.unapplied_collections enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.unapplied_collections'::regclass and polname = 'unapplied_collections_sel') then
    create policy unapplied_collections_sel on public.unapplied_collections for select to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant','Accounting','SalesOpsAdmin'));
  end if;
end $$;
revoke insert, update, delete on public.unapplied_collections from anon, authenticated;
grant select on public.unapplied_collections to authenticated;

-- ── 2. Checked stamp on billing payments ────────────────────────────────────
alter table public.billing_payments add column if not exists checked_by text;
alter table public.billing_payments add column if not exists checked_at timestamptz;

create or replace function public.billing_payments_check_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(current_setting('fabhub.collection_check', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- An upsert of an existing row: its UPDATE branch decides.
    if exists (select 1 from public.billing_payments where id = new.id) then
      return new;
    end if;
    new.checked_by := null;
    new.checked_at := null;
    return new;
  end if;
  if old.checked_at is not null and (
       new.amount is distinct from old.amount
    or new.date is distinct from old.date
    or new.ref_no is distinct from old.ref_no
    or new.bank is distinct from old.bank
    or new.payment_method is distinct from old.payment_method
    or new.milestone_id is distinct from old.milestone_id
    or new.bounced is distinct from old.bounced) then
    new.checked_by := null;
    new.checked_at := null;
    insert into public.audit_log (table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
    values ('billing_payments', old.id::text, 'check_cleared', to_jsonb(new), to_jsonb(old),
            'Changed after a Manager checked it (was checked by ' || coalesce(old.checked_by, '?') || ')',
            coalesce((select p.name from public.user_profiles p where p.username = public.app_username() limit 1), public.app_username()),
            now());
  else
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
  end if;
  return new;
end
$fn$;
revoke execute on function public.billing_payments_check_guard() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_payments_check_guard' and tgrelid = 'public.billing_payments'::regclass) then
    create trigger trg_billing_payments_check_guard
      before insert or update on public.billing_payments
      for each row execute function public.billing_payments_check_guard();
  end if;
end $$;

-- ── 3. Helpers ──────────────────────────────────────────────────────────────
create or replace function public.collection_my_name()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.name from public.user_profiles p where p.username = public.app_username() limit 1),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'name',
                  public.app_username())
$fn$;
revoke execute on function public.collection_my_name() from public, anon, authenticated;

-- The deal itself, its parent and the parent's other children (a payment for a
-- down payment may land on an addendum's invoice of the same PO family).
create or replace function public.collection_deal_family(p_deal uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  with root as (
    select coalesce(d.parent_deal_id, d.id) as id from public.deals d where d.id = p_deal
  )
  select d.id from public.deals d, root
   where d.id = root.id or d.parent_deal_id = root.id
$fn$;
revoke execute on function public.collection_deal_family(uuid) from public, anon, authenticated;

-- ── 4. RPCs ─────────────────────────────────────────────────────────────────
create or replace function public.record_unapplied_collection(
  p_deal uuid, p_date date, p_amount numeric, p_method text, p_bank text, p_ref text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me   text := public.collection_my_name();
  v_deal public.deals%rowtype;
  v_id   uuid;
  v_ref  text := btrim(coalesce(p_ref, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_amt  numeric := round(coalesce(p_amount, 0), 2);
  v_msg  text;
begin
  if not public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin') then
    raise exception 'Only Finance, a Finance Assistant, SalesOpsAdmin or a Manager can record a collection.';
  end if;
  select * into v_deal from public.deals where id = p_deal;
  if not found then raise exception 'Pick the project this money is for.'; end if;
  if coalesce(v_deal.is_cost_center, false) then
    raise exception '% is a GMD cost center, not a client project. Money that is not a client payment goes on the cash sheet only.', v_deal.client;
  end if;
  if not public.is_mgr()
     and nullif(btrim(v_deal.sales_owner), '') is not null
     and lower(btrim(v_deal.sales_owner)) = lower(btrim(coalesce(v_me, ''))) then
    raise exception 'You are the Sales Owner of this project: Finance or a Manager records its collections.';
  end if;
  if v_amt <= 0 then raise exception 'Enter the amount received.'; end if;
  if p_date is null then raise exception 'Enter the date the money was received.'; end if;
  if p_date > (now() at time zone 'Asia/Manila')::date then raise exception 'The date received is in the future.'; end if;
  if v_ref = '' then raise exception 'Enter the cheque / transfer reference.'; end if;
  if length(v_note) < 10 then
    raise exception 'Say why there is no invoice yet (10+ characters), e.g. "50%% DP paid on PO, invoice to follow".';
  end if;
  if exists (select 1 from public.unapplied_collections u
              where u.status <> 'Returned' and u.deal_id in (select public.collection_deal_family(p_deal))
                and lower(u.ref_no) = lower(v_ref) and u.amount = v_amt) then
    raise exception 'This reference and amount are already recorded as received before invoice on this project.';
  end if;

  insert into public.unapplied_collections (deal_id, received_date, amount, method, bank, ref_no, note, entered_by, entered_username)
  values (p_deal, p_date, v_amt, coalesce(p_method, ''), coalesce(p_bank, ''), v_ref, v_note, v_me, public.app_username())
  returning id into v_id;

  insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  select 'unapplied_collections', v_id::text, 'insert', to_jsonb(u), v_note, v_me, now()
    from public.unapplied_collections u where u.id = v_id;

  v_msg := '💵 Collection received BEFORE invoice' || E'\n'
        || 'Project: ' || coalesce(v_deal.ce_no, '') || ' ' || coalesce(v_deal.client, '') || coalesce(' — ' || nullif(v_deal.contact, ''), '') || E'\n'
        || 'Amount: ₱' || to_char(v_amt, 'FM999,999,999,990.00') || ' · ' || upper(coalesce(nullif(p_bank, ''), '—')) || ' · Ref ' || v_ref || E'\n'
        || 'Why no invoice: ' || v_note || E'\n'
        || 'Recorded by: ' || coalesce(v_me, '?') || E'\n'
        || 'Not counted against AR until it is applied to the invoice.';
  begin
    perform public.send_telegram('management', v_msg, null);
  exception when others then null;  -- a Telegram failure never blocks the save
  end;
  return v_id;
end
$fn$;
revoke execute on function public.record_unapplied_collection(uuid, date, numeric, text, text, text, text) from public, anon;
grant execute on function public.record_unapplied_collection(uuid, date, numeric, text, text, text, text) to authenticated;

create or replace function public.apply_unapplied_collection(p_id uuid, p_payment_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me  text := public.collection_my_name();
  v_row public.unapplied_collections%rowtype;
  v_n   int;
  v_sum numeric;
begin
  if not public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin') then
    raise exception 'Only Finance, a Finance Assistant, SalesOpsAdmin or a Manager can apply a collection.';
  end if;
  select * into v_row from public.unapplied_collections where id = p_id for update;
  if not found then raise exception 'Collection not found.'; end if;
  if v_row.status <> 'Open' then raise exception 'This collection is already %.', lower(v_row.status); end if;
  if p_payment_ids is null or cardinality(p_payment_ids) = 0 then
    raise exception 'Record the payment on the invoice(s) first.';
  end if;

  select count(*), coalesce(sum(bp.amount), 0) into v_n, v_sum
    from public.billing_payments bp
    join public.billing_milestones m on m.id = bp.milestone_id
   where bp.id = any(p_payment_ids)
     and not coalesce(bp.bounced, false)
     and m.deal_id in (select public.collection_deal_family(v_row.deal_id));
  if v_n <> cardinality(p_payment_ids) then
    raise exception 'Some of these payments are not on this project''s invoices (or bounced).';
  end if;
  if abs(v_sum - v_row.amount) > 1 then
    raise exception 'The payments add up to ₱%, not the ₱% received.', to_char(v_sum, 'FM999,999,990.00'), to_char(v_row.amount, 'FM999,999,990.00');
  end if;
  if exists (select 1 from public.unapplied_collections u
              where u.id <> p_id and u.status = 'Applied' and u.applied_payment_ids && p_payment_ids) then
    raise exception 'One of these payments is already used by another collection.';
  end if;

  update public.unapplied_collections
     set status = 'Applied', applied_payment_ids = p_payment_ids, applied_by = v_me, applied_at = now()
   where id = p_id;
  insert into public.audit_log (table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
  select 'unapplied_collections', p_id::text, 'applied', to_jsonb(u), to_jsonb(v_row), 'Applied to invoice payment(s)', v_me, now()
    from public.unapplied_collections u where u.id = p_id;
end
$fn$;
revoke execute on function public.apply_unapplied_collection(uuid, uuid[]) from public, anon;
grant execute on function public.apply_unapplied_collection(uuid, uuid[]) to authenticated;

create or replace function public.return_unapplied_collection(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me  text := public.collection_my_name();
  v_row public.unapplied_collections%rowtype;
begin
  if not public.is_mgr() then raise exception 'Only a Manager can close a collection without an invoice.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say what happened to the money (10+ characters), e.g. "refunded to client 12/02, BPI ref …".';
  end if;
  select * into v_row from public.unapplied_collections where id = p_id for update;
  if not found then raise exception 'Collection not found.'; end if;
  if v_row.status <> 'Open' then raise exception 'This collection is already %.', lower(v_row.status); end if;
  update public.unapplied_collections
     set status = 'Returned', return_reason = btrim(p_reason), returned_by = v_me, returned_at = now()
   where id = p_id;
  insert into public.audit_log (table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
  select 'unapplied_collections', p_id::text, 'returned', to_jsonb(u), to_jsonb(v_row), btrim(p_reason), v_me, now()
    from public.unapplied_collections u where u.id = p_id;
end
$fn$;
revoke execute on function public.return_unapplied_collection(uuid, text) from public, anon;
grant execute on function public.return_unapplied_collection(uuid, text) to authenticated;

-- Manager check. Never your own entry. Returns how many rows were stamped.
create or replace function public.check_collections(p_payment_ids uuid[], p_unapplied_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me  text := public.collection_my_name();
  v_own text;
  v_n   int := 0;
  v_k   int;
begin
  if not public.is_mgr() then raise exception 'Only a Manager checks collections.'; end if;
  select string_agg(coalesce(bp.ref_no, bp.id::text), ', ') into v_own
    from public.billing_payments bp
   where bp.id = any(coalesce(p_payment_ids, '{}'))
     and lower(btrim(coalesce(bp.recorded_by, ''))) = lower(btrim(coalesce(v_me, '')));
  if v_own is null then
    select string_agg(u.ref_no, ', ') into v_own
      from public.unapplied_collections u
     where u.id = any(coalesce(p_unapplied_ids, '{}'))
       and lower(btrim(u.entered_by)) = lower(btrim(coalesce(v_me, '')));
  end if;
  if v_own is not null then
    raise exception 'You recorded % yourself: another Manager checks it.', v_own;
  end if;

  perform set_config('fabhub.collection_check', 'on', true);
  update public.billing_payments
     set checked_by = v_me, checked_at = now()
   where id = any(coalesce(p_payment_ids, '{}')) and checked_at is null;
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  update public.unapplied_collections
     set checked_by = v_me, checked_at = now()
   where id = any(coalesce(p_unapplied_ids, '{}')) and checked_at is null;
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  perform set_config('fabhub.collection_check', '', true);

  if v_n > 0 then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('billing_payments', 'collections-check', 'collections_checked',
            jsonb_build_object('payment_ids', coalesce(p_payment_ids, '{}'), 'unapplied_ids', coalesce(p_unapplied_ids, '{}'), 'stamped', v_n),
            'Collections checked', v_me, now());
  end if;
  return v_n;
end
$fn$;
revoke execute on function public.check_collections(uuid[], uuid[]) from public, anon;
grant execute on function public.check_collections(uuid[], uuid[]) to authenticated;

-- ── 5. Daily alert ──────────────────────────────────────────────────────────
create or replace function public.unapplied_collections_alert(p_send boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_open  jsonb;
  n_open  int;
  s_open  numeric;
  n_unchk int;
  s_unchk numeric;
  msg     text;
  line    jsonb;
  n       int;
  r       jsonb;
  bot     jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('date', u.received_date, 'amount', u.amount, 'ref', u.ref_no,
           'ce_no', d.ce_no, 'client', d.client, 'days', v_today - u.received_date) order by u.received_date), '[]'::jsonb),
         count(*), coalesce(sum(u.amount), 0)
    into v_open, n_open, s_open
    from public.unapplied_collections u join public.deals d on d.id = u.deal_id
   where u.status = 'Open' and u.received_date <= v_today - 7;

  select count(*), coalesce(sum(bp.amount), 0) into n_unchk, s_unchk
    from public.billing_payments bp
   where bp.checked_at is null and not coalesce(bp.bounced, false)
     and bp.created_at >= timestamptz '2026-11-25 00:00+08'          -- checks start with this release
     and bp.created_at < now() - interval '7 days';

  r := jsonb_build_object('kind', 'unapplied_collections', 'ok', n_open = 0 and n_unchk = 0,
                          'open_over_7d', n_open, 'open_amount', s_open, 'unchecked_over_7d', n_unchk, 'unchecked_amount', s_unchk, 'open', v_open);

  if n_open > 0 or n_unchk > 0 then
    msg := '⚠️ FabHub: collections waiting';
    if n_open > 0 then
      msg := msg || E'\n• ' || n_open || ' collection(s) received before invoice, ₱' || to_char(s_open, 'FM999,999,999,990.00') || ', still not applied after 7+ days:';
      n := 0;
      for line in select * from jsonb_array_elements(v_open) loop
        n := n + 1; exit when n > 10;
        msg := msg || E'\n  ' || (line->>'date') || ' ₱' || to_char((line->>'amount')::numeric, 'FM999,999,999,990.00')
                   || ' · ' || coalesce(line->>'ce_no', '?') || ' ' || coalesce(line->>'client', '') || ' · Ref ' || (line->>'ref')
                   || ' (' || (line->>'days') || 'd)';
      end loop;
      if n_open > 10 then msg := msg || E'\n  …and ' || (n_open - 10) || ' more'; end if;
      msg := msg || E'\n  Issue the invoice and apply it in Billing › Collections.';
    end if;
    if n_unchk > 0 then
      msg := msg || E'\n• ' || n_unchk || ' collection(s), ₱' || to_char(s_unchk, 'FM999,999,999,990.00')
                 || ', entered 7+ days ago and not yet checked by a Manager (Billing › Collections › Not checked).';
    end if;
  end if;

  if p_send then
    if msg is not null then
      -- pg_cron has no login token, so send_telegram (is_user()) can't be used here.
      select value into bot from app_settings where key = 'botsettings';
      if bot->>'token' is not null and bot->'chatIds'->>'management' is not null then
        perform net.http_post(
          url     := 'https://api.telegram.org/bot' || (bot->>'token') || '/sendMessage',
          body    := jsonb_build_object('chat_id', bot->'chatIds'->>'management', 'text', msg),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        r := r || jsonb_build_object('notified', true);
      else
        r := r || jsonb_build_object('notify_error', 'botsettings token or management chat missing');
      end if;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values ((r->>'ok')::boolean, r || jsonb_build_object('message', msg), coalesce((r->>'notified')::boolean, false));
  end if;
  return r || jsonb_build_object('message', msg);
end
$fn$;
revoke execute on function public.unapplied_collections_alert(boolean) from public, anon, authenticated;

-- 23:58 UTC = 7:58 AM Manila, daily. cron.schedule with an existing name updates it.
select cron.schedule('fabhub-unapplied-collections', '58 23 * * *', 'select public.unapplied_collections_alert()');

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- select cron.unschedule('fabhub-unapplied-collections');
-- drop function if exists public.unapplied_collections_alert(boolean);
-- drop function if exists public.check_collections(uuid[], uuid[]);
-- drop function if exists public.return_unapplied_collection(uuid, text);
-- drop function if exists public.apply_unapplied_collection(uuid, uuid[]);
-- drop function if exists public.record_unapplied_collection(uuid, date, numeric, text, text, text, text);
-- drop function if exists public.collection_deal_family(uuid);
-- drop function if exists public.collection_my_name();
-- drop trigger if exists trg_billing_payments_check_guard on public.billing_payments;
-- drop function if exists public.billing_payments_check_guard();
-- alter table public.billing_payments drop column if exists checked_by, drop column if exists checked_at;
-- drop table if exists public.unapplied_collections;   -- only if it holds no rows you need (audit_log keeps a copy)
