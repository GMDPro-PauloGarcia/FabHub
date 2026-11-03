-- ── AP duplicate safety net (2026-11-02, Paulo) ─────────────────────────────
-- Why: AC Box was paid 4× and AMB 3× from the Excel AP; the 26 Oct sheet import
-- spread single checks across unrelated suppliers (87902 Durawood → Grand Jade
-- and Lexton bills, 87937 → six suppliers). Supplier payments had no duplicate
-- check at all, and the bill duplicate warning was app-only and could be
-- clicked past.
--
-- Rules (only for requests from the app, i.e. with a JWT; migrations and the
-- server-side import stay exempt, like the other payable guards):
--   Payments (payable_payments, on insert — payments are never edited):
--     BLOCK  paying more than the bill (total Active cash > bill amount + ₱0.50)
--     REVIEW the same check no. (and bank) already paid a different supplier
--     REVIEW same supplier + same amount paid on another bill within 30 days
--            under a different reference, when either bill has no PO / work
--            order or both are on the same one (one check paying several bills,
--            and repeat purchases on separate POs, are fine)
--   Bills (payables, on insert or when supplier / amount / invoice no. change):
--     BLOCK  same supplier + same supplier invoice no. on another live bill
--     REVIEW a bill with no PO / work order: same supplier + same amount on
--            another live bill created within 60 days
--   REVIEW = refused unless a Manager saves it with dup_override_reason; the
--   override is written to audit_log. Error messages start with
--   'DUPLICATE_BLOCK:' or 'DUPLICATE_REVIEW:' so the app can tell them apart.
-- Daily: ap_health_alert() at 7:52 AM Manila posts problems to the Telegram
-- management chat (only when there are any) and logs every run in ap_health_log.
--
-- Supplier names are free text ("Good Auto" / "GoodAuto"), so suppliers are
-- compared on ap_vendor_key(): the first 8 letters/digits, lower case.
--
-- ROLLBACK:
--   drop trigger if exists trg_payable_payments_dup_guard on public.payable_payments;
--   drop trigger if exists trg_payables_dup_guard on public.payables;
--   select cron.unschedule('fabhub-ap-health');
--   (the columns, functions and ap_health_log are harmless to leave in place)

alter table public.payables         add column if not exists dup_override_reason text;
alter table public.payable_payments add column if not exists dup_override_reason text;

create or replace function public.ap_vendor_key(v text)
returns text language sql immutable set search_path to 'pg_catalog', 'public' as $$
  select left(lower(regexp_replace(coalesce(v, ''), '[^a-zA-Z0-9]', '', 'g')), 8)
$$;

create or replace function public.ap_ref_key(v text)
returns text language sql immutable set search_path to 'pg_catalog', 'public' as $$
  select upper(regexp_replace(coalesce(v, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

-- ── Payments ────────────────────────────────────────────────────────────────
create or replace function public.payable_payments_dup_guard()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $$
declare
  v_bill   public.payables;
  v_key    text;
  v_ref    text;
  v_paid   numeric;
  v_hit    text;
  v_review text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if new.status is distinct from 'Active' then return new; end if;

  select * into v_bill from public.payables where id = new.payable_id;
  if not found then return new; end if;
  v_key := public.ap_vendor_key(v_bill.vendor);
  v_ref := public.ap_ref_key(new.ref_no);

  -- BLOCK: more cash than the bill.
  select coalesce(sum(amount), 0) into v_paid
    from public.payable_payments where payable_id = new.payable_id and status = 'Active';
  if v_paid + coalesce(new.amount, 0) > coalesce(v_bill.amount, 0) + 0.5 then
    raise exception 'DUPLICATE_BLOCK: % % is ₱% and ₱% is already paid — ₱% more would overpay it. Check whether this was already paid.',
      coalesce(nullif(v_bill.ap_number, ''), 'This bill'), coalesce(v_bill.vendor, ''),
      to_char(v_bill.amount, 'FM999,999,990.00'), to_char(v_paid, 'FM999,999,990.00'),
      to_char(new.amount, 'FM999,999,990.00');
  end if;

  -- REVIEW: same check number already paid another supplier.
  if v_ref <> '' and coalesce(new.method, '') ilike 'check%' then
    select string_agg(distinct p.vendor || coalesce(' (' || nullif(p.ap_number, '') || ')', ''), ', ') into v_hit
      from public.payable_payments pp join public.payables p on p.id = pp.payable_id
     where pp.status = 'Active' and public.ap_ref_key(pp.ref_no) = v_ref
       and (coalesce(pp.bank, '') = '' or coalesce(new.bank, '') = '' or lower(pp.bank) = lower(new.bank))
       and public.ap_vendor_key(p.vendor) <> v_key;
    if v_hit is not null then
      v_review := format('check %s was already recorded as paying %s', new.ref_no, v_hit);
    end if;
  end if;

  -- REVIEW: same supplier, same amount, another bill, within 30 days, different reference.
  if v_review is null and coalesce(new.kind, 'Payment') = 'Payment' then
    select string_agg(coalesce(nullif(p.ap_number, ''), p.id) || ' on ' || pp.pay_date
                      || coalesce(' (ref ' || nullif(pp.ref_no, '') || ')', ''), ', ') into v_hit
      from public.payable_payments pp join public.payables p on p.id = pp.payable_id
     where pp.status = 'Active' and pp.payable_id <> new.payable_id
       and coalesce(pp.kind, 'Payment') = 'Payment'
       and public.ap_vendor_key(p.vendor) = v_key
       and abs(pp.amount - new.amount) < 0.01
       and abs(coalesce(pp.pay_date, current_date) - coalesce(new.pay_date, current_date)) <= 30
       and (v_ref = '' or public.ap_ref_key(pp.ref_no) <> v_ref)
       -- Separate POs / work orders are separate purchases (Texturia ₱18,000 ×4 in
       -- one day); only a bill without one, or the same PO, is suspicious.
       and (coalesce(v_bill.po_number, '') = '' or coalesce(p.po_number, '') = ''
            or public.ap_ref_key(p.po_number) = public.ap_ref_key(v_bill.po_number));
    if v_hit is not null then
      v_review := format('%s was already paid ₱%s on another bill within 30 days: %s',
                         v_bill.vendor, to_char(new.amount, 'FM999,999,990.00'), v_hit);
    end if;
  end if;

  if v_review is not null then
    if coalesce(trim(new.dup_override_reason), '') = '' or not public.is_mgr() then
      raise exception 'DUPLICATE_REVIEW: Possible double payment — %. Only a Manager can record it, with a reason.', v_review;
    end if;
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by)
    values ('payable_payments', new.id, 'duplicate_override', to_jsonb(new) || jsonb_build_object('flag', v_review),
            new.dup_override_reason, coalesce(nullif(public.app_username(), ''), 'unknown'));
  end if;
  return new;
end $$;

create or replace trigger trg_payable_payments_dup_guard
  before insert on public.payable_payments
  for each row execute function public.payable_payments_dup_guard();

-- ── Bills ───────────────────────────────────────────────────────────────────
create or replace function public.payables_dup_guard()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $$
declare
  v_key    text;
  v_inv    text;
  v_hit    text;
  v_review text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if coalesce(new.status, '') = 'Cancelled' then return new; end if;
  if tg_op = 'UPDATE'
     and new.vendor is not distinct from old.vendor
     and new.amount is not distinct from old.amount
     and new.invoice_number is not distinct from old.invoice_number
     and coalesce(old.status, '') <> 'Cancelled' then
    return new;
  end if;

  v_key := public.ap_vendor_key(new.vendor);
  v_inv := public.ap_ref_key(new.invoice_number);

  -- BLOCK: same supplier invoice entered twice.
  if v_inv <> '' then
    select string_agg(coalesce(nullif(ap_number, ''), id), ', ') into v_hit
      from public.payables
     where id <> new.id and coalesce(status, '') <> 'Cancelled'
       and public.ap_vendor_key(vendor) = v_key and public.ap_ref_key(invoice_number) = v_inv;
    if v_hit is not null then
      raise exception 'DUPLICATE_BLOCK: %''s invoice % is already in FabHub as %. Open that bill instead of entering it again.',
        new.vendor, new.invoice_number, v_hit;
    end if;
  end if;

  -- REVIEW: a bill with no PO / work order, same supplier and amount within 60 days.
  if coalesce(new.po_id, '') = '' and coalesce(new.po_number, '') = '' then
    select string_agg(coalesce(nullif(ap_number, ''), id) || ' (' || coalesce(created_at::text, '?') || ')', ', ') into v_hit
      from public.payables
     where id <> new.id and coalesce(status, '') <> 'Cancelled'
       and public.ap_vendor_key(vendor) = v_key
       and abs(amount - new.amount) < 0.01
       and abs(coalesce(created_at, current_date) - coalesce(new.created_at, current_date)) <= 60;
    if v_hit is not null then
      v_review := format('%s already has a ₱%s bill within 60 days: %s',
                         new.vendor, to_char(new.amount, 'FM999,999,990.00'), v_hit);
    end if;
  end if;

  if v_review is not null then
    if coalesce(trim(new.dup_override_reason), '') = '' or not public.is_mgr() then
      raise exception 'DUPLICATE_REVIEW: Possible duplicate bill — %. Only a Manager can save it, with a reason.', v_review;
    end if;
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by)
    values ('payables', new.id, 'duplicate_override', to_jsonb(new) || jsonb_build_object('flag', v_review),
            new.dup_override_reason, coalesce(nullif(public.app_username(), ''), 'unknown'));
  end if;
  return new;
end $$;

create or replace trigger trg_payables_dup_guard
  before insert or update on public.payables
  for each row execute function public.payables_dup_guard();

-- ── Daily AP health report ──────────────────────────────────────────────────
create table if not exists public.ap_health_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  details jsonb,
  notified boolean not null default false
);
alter table public.ap_health_log enable row level security;
revoke all on public.ap_health_log from public, anon, authenticated;

create or replace function public.ap_health_check()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public' as $$
declare
  v_over jsonb; v_chk jsonb; v_pay jsonb; v_inv jsonb;
begin
  -- Bills paid more than their amount.
  select coalesce(jsonb_agg(x), '[]') into v_over from (
    select p.ap_number, p.vendor, p.amount, s.paid
      from public.payables p
      join (select payable_id, sum(amount) paid from public.payable_payments where status = 'Active' group by 1) s
        on s.payable_id = p.id
     where s.paid > p.amount + 0.5 order by s.paid - p.amount desc limit 20) x;
  -- One check number recorded against different suppliers.
  select coalesce(jsonb_agg(x), '[]') into v_chk from (
    select public.ap_ref_key(pp.ref_no) as check_no,
           string_agg(distinct p.vendor, ' / ') as suppliers, sum(pp.amount) as amount
      from public.payable_payments pp join public.payables p on p.id = pp.payable_id
     where pp.status = 'Active' and coalesce(pp.method, '') ilike 'check%' and public.ap_ref_key(pp.ref_no) <> ''
     group by 1 having count(distinct public.ap_vendor_key(p.vendor)) > 1 limit 20) x;
  -- Same supplier + amount paid on two bills within 30 days under different references (last 90 days).
  select coalesce(jsonb_agg(x), '[]') into v_pay from (
    select distinct on (least(a.id, b.id), greatest(a.id, b.id))
           pa.vendor, a.amount, a.pay_date as date_1, coalesce(a.ref_no, '') as ref_1,
           b.pay_date as date_2, coalesce(b.ref_no, '') as ref_2
      from public.payable_payments a join public.payables pa on pa.id = a.payable_id
      join public.payable_payments b on b.id > a.id and b.payable_id <> a.payable_id
       and b.status = 'Active' and abs(b.amount - a.amount) < 0.01
       and abs(b.pay_date - a.pay_date) <= 30
       and public.ap_ref_key(b.ref_no) is distinct from public.ap_ref_key(a.ref_no)
      join public.payables pb on pb.id = b.payable_id and public.ap_vendor_key(pb.vendor) = public.ap_vendor_key(pa.vendor)
       and (coalesce(pa.po_number, '') = '' or coalesce(pb.po_number, '') = ''
            or public.ap_ref_key(pa.po_number) = public.ap_ref_key(pb.po_number))
     where a.status = 'Active' and a.amount >= 1000 and a.pay_date >= current_date - 90
     limit 20) x;
  -- Open bills with the same supplier + supplier invoice no.
  select coalesce(jsonb_agg(x), '[]') into v_inv from (
    select min(vendor) as vendor, min(invoice_number) as invoice_number, string_agg(ap_number, ', ') as bills
      from public.payables
     where coalesce(status, '') not in ('Cancelled') and public.ap_ref_key(invoice_number) <> ''
     group by public.ap_vendor_key(vendor), public.ap_ref_key(invoice_number) having count(*) > 1 limit 20) x;
  return jsonb_build_object(
    'ok', jsonb_array_length(v_over) + jsonb_array_length(v_chk) + jsonb_array_length(v_pay) + jsonb_array_length(v_inv) = 0,
    'overpaid', v_over, 'check_across_suppliers', v_chk, 'same_amount_payments', v_pay, 'duplicate_invoices', v_inv);
end $$;

create or replace function public.ap_health_alert()
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $$
declare
  r jsonb; bot jsonb; token text; chat text; msg text; line jsonb; n int;
  peso text := 'FM999,999,999,990.00';
begin
  begin r := public.ap_health_check();
  exception when others then r := jsonb_build_object('ok', false, 'error', sqlerrm); end;
  if r ? 'error' then
    msg := E'⚠️ FabHub AP duplicate check could not run\n' || (r->>'error');
  elsif not (r->>'ok')::boolean then
    msg := E'⚠️ FabHub AP: possible duplicate payments — please check';
    if jsonb_array_length(r->'overpaid') > 0 then
      msg := msg || E'\n• Bills paid more than their amount:'; n := 0;
      for line in select * from jsonb_array_elements(r->'overpaid') loop
        n := n + 1; exit when n > 8;
        msg := msg || E'\n  ' || coalesce(line->>'ap_number', '?') || ' ' || coalesce(line->>'vendor', '')
          || ': bill ₱' || to_char((line->>'amount')::numeric, peso) || ', paid ₱' || to_char((line->>'paid')::numeric, peso);
      end loop;
    end if;
    if jsonb_array_length(r->'check_across_suppliers') > 0 then
      msg := msg || E'\n• One check recorded for different suppliers:'; n := 0;
      for line in select * from jsonb_array_elements(r->'check_across_suppliers') loop
        n := n + 1; exit when n > 8;
        msg := msg || E'\n  Check ' || (line->>'check_no') || ': ' || (line->>'suppliers');
      end loop;
    end if;
    if jsonb_array_length(r->'same_amount_payments') > 0 then
      msg := msg || E'\n• Same supplier + same amount paid twice within 30 days:'; n := 0;
      for line in select * from jsonb_array_elements(r->'same_amount_payments') loop
        n := n + 1; exit when n > 8;
        msg := msg || E'\n  ' || (line->>'vendor') || ' ₱' || to_char((line->>'amount')::numeric, peso)
          || ' on ' || (line->>'date_1') || ' and ' || (line->>'date_2');
      end loop;
    end if;
    if jsonb_array_length(r->'duplicate_invoices') > 0 then
      msg := msg || E'\n• Same supplier invoice entered twice:'; n := 0;
      for line in select * from jsonb_array_elements(r->'duplicate_invoices') loop
        n := n + 1; exit when n > 8;
        msg := msg || E'\n  ' || (line->>'vendor') || ' inv ' || (line->>'invoice_number') || ': ' || (line->>'bills');
      end loop;
    end if;
    msg := msg || E'\nNothing was changed. Finance to review in FabHub › Finance › Payables.';
  end if;
  if msg is not null then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    chat := bot->'chatIds'->>'management';
    if token is not null and chat is not null then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || token || '/sendMessage',
        body := jsonb_build_object('chat_id', chat, 'text', msg),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    else
      r := r || jsonb_build_object('notify_error', 'telegram token (app_secrets) or management chat missing');
    end if;
  end if;
  insert into public.ap_health_log (ok, details, notified)
  values (coalesce((r->>'ok')::boolean, false), r || jsonb_build_object('message', msg),
          msg is not null and token is not null and chat is not null);
  return r || jsonb_build_object('message', msg);
end $$;

revoke execute on function public.payable_payments_dup_guard() from public, anon, authenticated;
revoke execute on function public.payables_dup_guard() from public, anon, authenticated;
revoke execute on function public.ap_health_check() from public, anon, authenticated;
revoke execute on function public.ap_health_alert() from public, anon, authenticated;

-- 7:52 AM Manila = 23:52 UTC, two minutes after the billing check.
select cron.schedule('fabhub-ap-health', '52 23 * * *', 'select public.ap_health_alert()');
