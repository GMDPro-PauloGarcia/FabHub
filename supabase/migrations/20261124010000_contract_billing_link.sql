-- Contract price ↔ billing schedule link (Paulo, 2026-11-24)
--
-- Audit that day: 20 of 261 awarded deals with billing had milestones that don't
-- add up to the contract (₱1.28M gap: 12 under-billed ₱880K, 8 over-billed
-- ₱401K), 18 of them with an invoice already sent. Most look like set-up errors
-- (a missing retention / final milestone: exactly −10 % / −20 %; VAT-inclusive
-- amounts on a VAT-exclusive contract: +12 %), not award adjustments.
--
-- 1. deals.original_value: the contract before change orders, kept by the server
--    (the app had it on screen only, so it was lost on every reload). It follows
--    every contract change except one that matches a change order on the deal.
--    Backfill: value − signed approved change orders.
-- 2. Once billing has started on a deal (a milestone that isn't Draft/Cancelled,
--    or any payment), only a Manager changes deals.value directly. A change-order
--    approver (can_approve_addendum) may move it by exactly the value of a change
--    order on that deal (the CO roll). Anyone else's change is silently kept
--    (stale full-row saves still work) and logged to audit_log ('blocked').
--    Before billing starts the value moves freely, as it does at award.
--    Every allowed change after billing started is logged ('contract_change').
-- 3. billing_health_check() also reports awarded deals whose milestones don't add
--    up to the contract (gap over ₱1) — the daily Telegram lists them until fixed.
--
-- App mirror: contractLocked / CONTRACT_LOCK_MSG (src/core.js), saveDeal and the
-- "Billing ≠ Contract" panel in BillingView (src/App.jsx). Keep them in sync.

-- ── 1. original_value ────────────────────────────────────────────────────────
alter table public.deals add column if not exists original_value numeric;

update public.deals d
   set original_value = round(d.value - coalesce((
         select sum(case when a.kind = 'Deductive' then -abs(a.value) else abs(a.value) end)
           from public.addenda a
          where a.deal_id = d.id and a.status in ('Approved','Billed','Collected')), 0), 2)
 where d.original_value is null and d.value is not null;

-- ── 2. guard ─────────────────────────────────────────────────────────────────
create or replace function public.deal_billing_started(p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.billing_milestones m
                  where m.deal_id = p_deal
                    and coalesce(m.status, '') not in ('Draft', 'Cancelled'))
      or exists (select 1 from public.billing_payments p
                   join public.billing_milestones m on m.id = p.milestone_id
                  where m.deal_id = p_deal);
$$;
revoke execute on function public.deal_billing_started(uuid) from public, anon, authenticated;

create or replace function public.deals_contract_value_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_delta   numeric;
  v_is_co   boolean;
  v_started boolean;
  v_server  boolean := coalesce(current_setting('request.jwt.claims', true), '') = '';
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.deals x where x.id = new.id) then
      return new;  -- upsert of an existing deal: the UPDATE branch decides
    end if;
    new.original_value := new.value;
    return new;
  end if;

  -- original_value is the server's: a client write never changes it directly
  if not v_server and not public.is_mgr() then
    new.original_value := old.original_value;
  end if;

  if round(coalesce(new.value, 0), 2) = round(coalesce(old.value, 0), 2) then
    return new;
  end if;

  v_delta := round(coalesce(new.value, 0) - coalesce(old.value, 0), 2);
  v_is_co := exists (select 1 from public.addenda a
                      where a.deal_id = old.id and coalesce(a.value, 0) <> 0
                        and abs(abs(v_delta) - abs(a.value)) < 0.01);
  v_started := public.deal_billing_started(old.id);

  if v_started and not v_server and not public.is_mgr()
     and not (v_is_co and public.can_approve_addendum(old.id)) then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('deals', old.id::text, 'blocked',
            jsonb_build_object('ce_no', old.ce_no, 'kept', format('value %s -> %s', old.value, new.value)),
            'Billing has started: only a Manager changes the contract value. Raise a change order instead.',
            public.app_username(), now());
    new.value := old.value;
    return new;
  end if;

  -- the base contract follows every change except a change-order roll
  if not v_is_co then
    new.original_value := round(coalesce(old.original_value, old.value, 0) + v_delta, 2);
  elsif old.original_value is null then
    new.original_value := old.value;
  end if;

  if v_started and not v_server then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('deals', old.id::text, 'contract_change',
            jsonb_build_object('ce_no', old.ce_no, 'from', old.value, 'to', new.value,
                               'change_order', v_is_co, 'original_value', new.original_value),
            case when v_is_co then 'Change order rolled into the contract' else 'Contract value changed by a Manager after billing started' end,
            public.app_username(), now());
  end if;
  return new;
end $$;
revoke execute on function public.deals_contract_value_guard() from public, anon, authenticated;

create or replace trigger trg_deals_contract_value_guard
  before insert or update on public.deals
  for each row execute function public.deals_contract_value_guard();

-- ── 3. health check: billing must add up to the contract ────────────────────
create or replace function public.billing_contract_gaps()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with m as (
    select deal_id, round(sum(amount), 2) as sched
      from public.billing_milestones
     where coalesce(status, '') <> 'Cancelled'
     group by deal_id
  ), g as (
    select d.ce_no, d.client, round(coalesce(d.value, 0), 2) as contract, m.sched,
           round(m.sched - coalesce(d.value, 0), 2) as gap
      from public.deals d
      join m on m.deal_id = d.id
     where d.stage = any (array['06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
                                '10 · Installation','11 · Punchlist','12 · Close-Out','14 · Completed'])
       and not coalesce(d.standby_po, false)
       and not coalesce(d.is_cost_center, false)
       and abs(m.sched - coalesce(d.value, 0)) > 1
  )
  select jsonb_build_object('count', count(*),
           'rows', coalesce(jsonb_agg(to_jsonb(g) order by abs(g.gap) desc), '[]'::jsonb))
    from g;
$$;
revoke execute on function public.billing_contract_gaps() from public, anon, authenticated;

create or replace function public.billing_health_check()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_trig  int;
  v_drift jsonb;
  v_count int;
  v_gaps  jsonb;
begin
  select count(*) into v_trig
    from pg_trigger t
   where not t.tgisinternal and t.tgenabled = 'O'
     and ((t.tgname = 'trg_billing_totals_sync'
           and t.tgrelid in ('public.billing_milestones'::regclass, 'public.billing_payments'::regclass))
       or (t.tgname = 'trg_deals_protect_billing_totals'
           and t.tgrelid = 'public.deals'::regclass));

  with m as (
    select deal_id, round(sum(amount), 2) as inv
      from billing_milestones
     where coalesce(status, '') <> 'Cancelled'
     group by deal_id
  ), p as (
    select ms.deal_id, round(sum(bp.amount), 2) as paid
      from billing_payments bp
      join billing_milestones ms on ms.id = bp.milestone_id
     where coalesce(ms.status, '') <> 'Cancelled'
       and not coalesce(bp.bounced, false)
     group by ms.deal_id
  ), bad as (
    select d.ce_no, d.client,
           coalesce(d.invoiced, 0)    as invoiced,    coalesce(m.inv, 0)  as should_invoiced,
           coalesce(d.amount_paid, 0) as amount_paid, coalesce(p.paid, 0) as should_paid
      from deals d
      join (select distinct deal_id from billing_milestones) x on x.deal_id = d.id
      left join m on m.deal_id = d.id
      left join p on p.deal_id = d.id
     where abs(coalesce(d.invoiced, 0)    - coalesce(m.inv, 0))  >= 0.005
        or abs(coalesce(d.amount_paid, 0) - coalesce(p.paid, 0)) >= 0.005
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(bad) order by ce_no), '[]'::jsonb)
    into v_count, v_drift
    from bad;

  v_gaps := public.billing_contract_gaps();

  return jsonb_build_object(
    'ok',           v_trig = 3 and v_count = 0 and (v_gaps->>'count')::int = 0,
    'triggers',     v_trig,
    'drift',        v_count,
    'rows',         v_drift,
    'contract_gap', (v_gaps->>'count')::int,
    'gap_rows',     v_gaps->'rows');
end
$function$;

create or replace function public.billing_health_alert()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r       jsonb;
  bot     jsonb;
  token   text;
  chat    text;
  msg     text;
  line    jsonb;
  n       int := 0;
  monday  boolean := extract(isodow from now() at time zone 'Asia/Manila') = 1;
  runs    int;
  bad     int;
begin
  begin
    r := public.billing_health_check();
  exception when others then
    r := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  if r ? 'error' then
    msg := E'⚠️ FabHub billing health check could not run\n' || (r->>'error')
        || E'\nDeal totals are unverified today. Open a FabHub Claude session to investigate.';
  elsif not (r->>'ok')::boolean then
    msg := E'⚠️ FabHub billing problem';
    if (r->>'triggers')::int <> 3 then
      msg := msg || E'\n• Only ' || (r->>'triggers') || E' of 3 billing triggers are on. '
                 || 'Finance payments may not be updating deal totals (the ₱5.67M bug).';
    end if;
    if (r->>'drift')::int > 0 then
      msg := msg || E'\n• ' || (r->>'drift') || ' deal(s) show wrong invoiced/collected amounts:';
      for line in select * from jsonb_array_elements(r->'rows') loop
        n := n + 1;
        exit when n > 10;
        msg := msg || E'\n  ' || coalesce(line->>'ce_no', '?') || ' ' || coalesce(line->>'client', '')
                   || ': paid ₱' || to_char((line->>'amount_paid')::numeric, 'FM999,999,999,990.00')
                   || ' (should be ₱' || to_char((line->>'should_paid')::numeric, 'FM999,999,999,990.00') || ')'
                   || ', invoiced ₱' || to_char((line->>'invoiced')::numeric, 'FM999,999,999,990.00')
                   || ' (should be ₱' || to_char((line->>'should_invoiced')::numeric, 'FM999,999,999,990.00') || ')';
      end loop;
      if (r->>'drift')::int > 10 then
        msg := msg || E'\n  …and ' || ((r->>'drift')::int - 10) || ' more';
      end if;
    end if;
    if coalesce((r->>'contract_gap')::int, 0) > 0 then
      n := 0;
      msg := msg || E'\n• ' || (r->>'contract_gap') || ' awarded deal(s) whose billing milestones don''t add up to the contract:';
      for line in select * from jsonb_array_elements(r->'gap_rows') loop
        n := n + 1;
        exit when n > 10;
        msg := msg || E'\n  ' || coalesce(line->>'ce_no', '?') || ' ' || coalesce(line->>'client', '')
                   || ': contract ₱' || to_char((line->>'contract')::numeric, 'FM999,999,999,990.00')
                   || ', billing ₱' || to_char((line->>'sched')::numeric, 'FM999,999,999,990.00')
                   || ' (' || case when (line->>'gap')::numeric < 0 then 'under ' else 'over ' end
                   || '₱' || to_char(abs((line->>'gap')::numeric), 'FM999,999,999,990.00') || ')';
      end loop;
      if (r->>'contract_gap')::int > 10 then
        msg := msg || E'\n  …and ' || ((r->>'contract_gap')::int - 10) || ' more';
      end if;
      msg := msg || E'\n  Fix in Billing (the deal shows "Billing ≠ Contract").';
    end if;
    msg := msg || E'\nNothing was changed.';
  elsif monday then
    select count(*), count(*) filter (where not ok) into runs, bad
      from billing_health_log where ran_at > now() - interval '7 days';
    msg := E'✅ FabHub weekly billing check: all OK today (3 triggers, 0 drift, billing = contract). '
        || 'Past 7 days: ' || runs || ' run(s), ' || bad || ' with problems.';
  end if;

  if msg is not null then
    select value into bot from app_settings where key = 'botsettings';
    select value into token from app_secrets where key = 'telegram_bot_token';
    chat  := bot->'chatIds'->>'management';
    if token is not null and chat is not null then
      perform net.http_post(
        url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
        body    := jsonb_build_object('chat_id', chat, 'text', msg),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    else
      r := r || jsonb_build_object('notify_error', 'telegram token (app_secrets) or management chat missing');
    end if;
  end if;

  insert into billing_health_log (ok, triggers, drift, details, notified)
  values (coalesce((r->>'ok')::boolean, false), (r->>'triggers')::int, (r->>'drift')::int,
          r || jsonb_build_object('message', msg),
          msg is not null and token is not null and chat is not null);

  return r || jsonb_build_object('message', msg);
end
$function$;

-- ROLLBACK
-- Restore billing_health_check / billing_health_alert from
-- 20261020015000_billing_health_telegram_alert.sql (and 20261026103448 for the
-- token lookup), then:
--   alter table public.deals disable trigger trg_deals_contract_value_guard;
-- (the column original_value can stay; nothing reads it but the app.)
