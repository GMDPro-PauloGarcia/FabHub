-- ============================================================================
-- Migration 20261124010000 — daily check: Billing collections ↔ the cash sheet
--
-- Why (2026-11-24): Omnivores CE-2026-1069 paid two ₱95,000 invoices with one
-- ₱186,200 cheque (612GTP1B, 2% EWT withheld). Billing recorded ₱190,000, so
-- the deal showed ₱3,800 more collected than reached BPI, and nothing flagged
-- it. Transaction History only shows it to whoever opens the screen.
--
-- What: collections_match_alert(p_send boolean default true) → jsonb
--   Looks at cash client payments in Billing (not bounced, not Offset / Credit
--   Note) credited 3–30 days ago (the sheet gets 3 days to catch up). Payments
--   with the same reference, credit date and bank are one deposit (one cheque
--   for several invoices). A deposit is matched when a Daily Cash Position
--   collection row links any of its payments (🔗, billingPaymentIds), or an
--   untagged row on the same bank within 7 days has exactly its amount.
--   Reports:
--     • unmatched — deposits Billing has and no cash-sheet row matches
--       (the sheet missed it, it was recorded twice, or the amount differs,
--       e.g. EWT recorded as cash);
--     • linked_diff — cash-sheet rows whose linked payments don't add up to
--       the row (the bank and Billing disagree).
--   Posts to the Telegram management chat when there is anything to report
--   (silent otherwise; billing_health_alert already sends the Monday "alive"
--   line). collections_match_alert(false) is a dry run (no Telegram, no log).
--   Runs are logged in ap_health_log (details->>'kind' = 'collections_match').
--   pg_cron 'fabhub-collections-match' at 23:54 UTC = 7:54 AM Asia/Manila.
--
-- Read-only on business tables. cash_positions.manual_collections holds a
-- JSON string (the app stores JSON.stringify), so it is parsed with #>>'{}'.
-- Mirrors reconcileLedger's collection pass (src/data/ledger.js) and the
-- cash-sheet 🔗 (src/views/CollectionLink.jsx): keep them in sync.
-- No DROP statements (apply_migration hangs on them — CLAUDE.md).
-- ============================================================================

create or replace function public.collections_match_alert(p_send boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_from     date := v_today - 30;
  v_to       date := v_today - 3;
  v_unm      jsonb;
  v_diff     jsonb;
  n_unm      int;
  n_diff     int;
  r          jsonb;
  msg        text;
  line       jsonb;
  n          int;
  bot        jsonb;
  token      text;
  chat       text;
  sent       boolean := false;
begin
  with pay as (
    select bp.id::text as pid, bp.amount, coalesce(bp.value_date, bp.date) as d,
           lower(coalesce(bp.bank, '')) as bank,
           coalesce(nullif(upper(regexp_replace(coalesce(bp.ref_no, ''), '\s', '', 'g')), ''), 'ID:' || bp.id::text) as ref,
           dl.ce_no, dl.client, ms.invoice_no
      from billing_payments bp
      join billing_milestones ms on ms.id = bp.milestone_id
      join deals dl on dl.id = ms.deal_id
     where not coalesce(bp.bounced, false)
       and coalesce(bp.payment_method, '') <> 'Offset / Credit Note'
       and coalesce(bp.amount, 0) > 0
       and coalesce(ms.status, '') <> 'Cancelled'
  ), dep as (            -- one deposit = same reference + credit date + bank
    select ref, d, bank, round(sum(amount), 2) as total, array_agg(pid) as pids,
           string_agg(distinct coalesce(ce_no, '?'), ', ') as ce_nos,
           string_agg(distinct coalesce(client, ''), ', ') as clients,
           string_agg(coalesce(invoice_no, '?'), ', ' order by invoice_no) as invoices
      from pay
     group by ref, d, bank
  ), rows as (           -- cash-sheet collection rows near the window
    select cp.date as d, lower(coalesce(e->>'bank', '')) as bank,
           round(coalesce(nullif(regexp_replace(coalesce(e->>'amount', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0), 2) as amount,
           coalesce(e->>'particulars', e->>'note', '') as particulars,
           coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e->'billingPaymentIds') = 'array' then e->'billingPaymentIds' else '[]'::jsonb end)), '{}') as ids,
           coalesce(e->>'notBilling', '') as not_billing
      from cash_positions cp
      cross join lateral jsonb_array_elements(
        case jsonb_typeof(cp.manual_collections)
          when 'string' then coalesce((cp.manual_collections #>> '{}')::jsonb, '[]'::jsonb)
          when 'array'  then cp.manual_collections
          else '[]'::jsonb end) e
     where cp.date between v_from - 7 and v_today
  ), unm as (
    select dep.* from dep
     where dep.d between v_from and v_to
       and not exists (select 1 from rows where rows.ids && dep.pids)
       and not exists (select 1 from rows
                        where cardinality(rows.ids) = 0 and rows.not_billing = ''
                          and abs(rows.d - dep.d) <= 7
                          and (rows.bank = '' or dep.bank = '' or rows.bank = dep.bank)
                          and abs(rows.amount - dep.total) < 0.01)
  ), diff as (
    select rows.d, rows.bank, rows.amount, rows.particulars,
           round(coalesce((select sum(p.amount) from pay p where p.pid = any(rows.ids)), 0), 2) as linked
      from rows
     where cardinality(rows.ids) > 0 and rows.d between v_from and v_today
  )
  select (select count(*) from unm),
         coalesce((select jsonb_agg(jsonb_build_object('date', d, 'bank', bank, 'amount', total, 'ref', ref,
                                     'ce_no', ce_nos, 'client', clients, 'invoices', invoices) order by d desc) from unm), '[]'::jsonb),
         (select count(*) from diff where abs(amount - linked) >= 0.01),
         coalesce((select jsonb_agg(jsonb_build_object('date', d, 'bank', bank, 'amount', amount, 'linked', linked,
                                     'particulars', particulars) order by d desc)
                     from diff where abs(amount - linked) >= 0.01), '[]'::jsonb)
    into n_unm, v_unm, n_diff, v_diff;

  r := jsonb_build_object('kind', 'collections_match', 'ok', n_unm = 0 and n_diff = 0,
                          'from', v_from, 'to', v_to,
                          'unmatched', n_unm, 'linked_diff', n_diff,
                          'unmatched_rows', v_unm, 'diff_rows', v_diff);

  if n_unm > 0 or n_diff > 0 then
    msg := E'⚠️ FabHub: Billing collections vs the Daily Cash Position (' || to_char(v_from, 'Mon DD') || ' – ' || to_char(v_to, 'Mon DD') || ')';
    if n_unm > 0 then
      msg := msg || E'\n• ' || n_unm || ' client payment(s) in Billing with no matching collection on the cash sheet:';
      n := 0;
      for line in select * from jsonb_array_elements(v_unm) loop
        n := n + 1; exit when n > 10;
        msg := msg || E'\n  ' || (line->>'date') || ' ' || upper(coalesce(nullif(line->>'bank', ''), 'no bank')) || ' ₱'
                   || to_char((line->>'amount')::numeric, 'FM999,999,999,990.00') || ' · ' || coalesce(line->>'ce_no', '?')
                   || ' ' || coalesce(line->>'client', '') || ' · ' || coalesce(line->>'invoices', '')
                   || case when line->>'ref' like 'ID:%' then '' else ' · Ref ' || (line->>'ref') end;
      end loop;
      if n_unm > 10 then msg := msg || E'\n  …and ' || (n_unm - 10) || ' more'; end if;
    end if;
    if n_diff > 0 then
      msg := msg || E'\n• ' || n_diff || ' cash-sheet collection(s) whose linked Billing payments don''t add up:';
      n := 0;
      for line in select * from jsonb_array_elements(v_diff) loop
        n := n + 1; exit when n > 10;
        msg := msg || E'\n  ' || (line->>'date') || ' ' || upper(coalesce(nullif(line->>'bank', ''), 'no bank')) || ' bank ₱'
                   || to_char((line->>'amount')::numeric, 'FM999,999,999,990.00') || ' vs Billing ₱'
                   || to_char((line->>'linked')::numeric, 'FM999,999,999,990.00') || ' · ' || left(coalesce(line->>'particulars', ''), 60);
      end loop;
      if n_diff > 10 then msg := msg || E'\n  …and ' || (n_diff - 10) || ' more'; end if;
    end if;
    msg := msg || E'\nUsually: EWT recorded as cash, a deposit missing from the sheet, or a payment recorded twice. Check in Executive › Transactions. Nothing was changed.';
  end if;

  if p_send then
    if msg is not null then
      select value into bot from app_settings where key = 'botsettings';
      token := bot->>'token';
      chat  := bot->'chatIds'->>'management';
      if token is not null and chat is not null then
        perform net.http_post(
          url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body    := jsonb_build_object('chat_id', chat, 'text', msg),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        sent := true;
      else
        r := r || jsonb_build_object('notify_error', 'botsettings token or management chat missing');
      end if;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values ((r->>'ok')::boolean, r || jsonb_build_object('message', msg), sent);
  end if;

  return r || jsonb_build_object('message', msg);
end
$fn$;
revoke execute on function public.collections_match_alert(boolean) from public, anon, authenticated;

-- 23:54 UTC = 7:54 AM Manila, daily. cron.schedule with an existing name updates it.
select cron.schedule('fabhub-collections-match', '54 23 * * *', 'select public.collections_match_alert()');

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- select cron.unschedule('fabhub-collections-match');
-- drop function if exists public.collections_match_alert(boolean);
