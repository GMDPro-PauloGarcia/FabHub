-- ── Monday monitoring-board summary on Telegram (2026-11-05, Paulo) ─────────
-- Applied to production 2026-11-05 (version 20261105043929) after a dry run; pg_cron job fabhub-monitoring-board, Mondays 00:12 UTC = 8:12 AM Manila.
-- "Mon: 4-week cash forecast / stock review" in GMD Monitoring Flow (Nov 2026).
-- Every Monday 8:12 AM Manila (pg_cron fabhub-monitoring-board) this posts the
-- desk's main traffic lights to the management chat, so red items reach the
-- Monday review with an owner. The full board is FabHub › Finance › Monitoring
-- Board; thresholds are the flow's proposals (keep in sync with THRESHOLDS in
-- src/views/MonitoringBoard.jsx).
--   • This week's payment run: status, total vs operating cash on the latest
--     Daily Cash Position (BPI + Metrobank + BDO ending)
--   • Overdue supplier bills (watch 1–7 days, act > 7 days)
--   • Bills still awaiting approval that are due by Thursday
--   • Approvals reset last week (amount / supplier changed after approval)
--   • Supplier payments in the last 7 days outside an approved run (off-cycle)
--   • Client collections overdue 30+ days (escalate)
--   • Client 2307s not received for last quarter
-- monitoring_board_alert(false) is a dry run (returns the message, sends nothing).
-- Runs are logged in ap_health_log (details->>'kind' = 'monitoring_board').
--
-- ROLLBACK:
--   select cron.unschedule('fabhub-monitoring-board');

create or replace function public.monitoring_board_alert(p_send boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  peso text := 'FM999,999,999,990.00';
  d date := (now() at time zone 'Asia/Manila')::date;
  thu date;
  q_start date; q_end date; q_label text;
  r record;
  v_run_status text; v_run_total numeric := 0; v_run_n int := 0;
  v_cash numeric; v_cash_date date;
  v_od_n int; v_od_amt numeric; v_od_days int;
  v_pend_n int; v_pend_amt numeric;
  v_reset int; v_off int;
  v_col_n int; v_col_amt numeric;
  v_2307 int; v_2307_amt numeric;
  light text; msg text; k int;
  bot jsonb; token text; chat text; sent boolean := false;
begin
  thu := (date_trunc('week', d)::date) + 3;
  q_end := (date_trunc('quarter', d)::date) - 1;
  q_start := date_trunc('quarter', q_end)::date;
  q_label := to_char(q_start, 'YYYY') || '-Q' || extract(quarter from q_start);

  -- Payment run
  select status, coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(items) i), 0), jsonb_array_length(items)
    into v_run_status, v_run_total, v_run_n
    from public.payment_runs where release_date = thu and status <> 'Cancelled'
   order by created_at desc limit 1;
  if v_run_status is null then
    select coalesce(sum(amount - coalesce(paid_amount, 0)), 0), count(*) into v_run_total, v_run_n
      from public.payables
     where status not in ('Paid','Cancelled','Void') and amount - coalesce(paid_amount, 0) > 0.005 and due_date <= thu;
  end if;
  select coalesce(bpi_end, 0) + coalesce(metrobank_end, 0) + coalesce(bdo_end, 0), date
    into v_cash, v_cash_date
    from public.cash_positions where date <= d order by date desc limit 1;

  -- Overdue supplier bills
  select count(*), coalesce(sum(amount - coalesce(paid_amount, 0)), 0), coalesce(max(d - due_date), 0)
    into v_od_n, v_od_amt, v_od_days
    from public.payables
   where status not in ('Paid','Cancelled','Void') and amount - coalesce(paid_amount, 0) > 0.005 and due_date < d;

  -- Awaiting approval, due by Thursday
  select count(*), coalesce(sum(amount - coalesce(paid_amount, 0)), 0) into v_pend_n, v_pend_amt
    from public.payables
   where status not in ('Paid','Cancelled','Void') and amount - coalesce(paid_amount, 0) > 0.005
     and coalesce(nullif(approval_status, ''), 'Approved') = 'Pending' and due_date <= thu;

  select count(*) into v_reset from public.audit_log
   where table_name = 'payables' and action = 'approval_reset' and performed_at >= now() - interval '7 days';

  select count(*) into v_off from public.payable_payments pp
   where pp.status = 'Active' and pp.created_at >= now() - interval '7 days'
     and not exists (select 1 from public.payment_runs pr, jsonb_array_elements(pr.items) i
                      where pr.status in ('Approved','Released') and i->>'payableId' = pp.payable_id);

  -- Client collections overdue 30+ days
  with bal as (
    select m.id, m.deal_id, m.invoice_no, m.name, m.due_date,
           coalesce(nullif(m.net_receivable, 0), m.amount)
             - coalesce((select sum(p.amount) from public.billing_payments p where p.milestone_id = m.id and not coalesce(p.bounced, false)), 0) as b
      from public.billing_milestones m
     where coalesce(m.status, '') not in ('Cancelled','Draft') and m.due_date < d - 30)
  select count(*), coalesce(sum(b), 0) into v_col_n, v_col_amt from bal where b > 0.5;

  -- Client 2307s for last quarter not received
  with owed as (
    select m.deal_id, sum(m.ewt * least(1, p.amount / nullif(coalesce(nullif(m.net_receivable, 0), m.amount), 0))) as ewt
      from public.billing_milestones m join public.billing_payments p on p.milestone_id = m.id
     where coalesce(m.ewt, 0) > 0 and not coalesce(p.bounced, false)
       and coalesce(p.value_date, p.date) between q_start and q_end
     group by m.deal_id)
  select count(*), coalesce(sum(ewt), 0) into v_2307, v_2307_amt from owed o
   where not exists (select 1 from public.bir_2307 b where b.direction = 'receive' and b.quarter = q_label
                       and b.deal_id = o.deal_id and b.status in ('Received','Not required'));

  -- Message
  msg := '🚦 FabHub monitoring board, ' || to_char(d, 'Dy DD Mon YYYY');
  light := case when v_cash is null then '⚪' when v_cash >= v_run_total then '🟢' when v_cash > 0 then '🟡' else '🔴' end;
  msg := msg || E'\n\n' || light || ' Payment run (Thu ' || to_char(thu, 'DD Mon') || '): '
      || coalesce(v_run_status, 'not started') || ', ' || v_run_n || ' bill(s), ₱' || to_char(v_run_total, peso)
      || E'\n   Cash ' || coalesce('₱' || to_char(v_cash, peso) || ' (' || to_char(v_cash_date, 'DD Mon') || ')', 'not on a cash position');
  light := case when v_od_n = 0 then '🟢' when v_od_days <= 7 then '🟡' else '🔴' end;
  msg := msg || E'\n' || light || ' Overdue supplier bills: ' || v_od_n
      || case when v_od_n > 0 then ', ₱' || to_char(v_od_amt, peso) || ', oldest ' || v_od_days || ' days' else '' end;
  if v_pend_n > 0 then
    msg := msg || E'\n🟡 Awaiting approval, due by Thursday: ' || v_pend_n || ', ₱' || to_char(v_pend_amt, peso);
  end if;
  if v_reset > 0 then
    msg := msg || E'\n🟡 Approvals reset last week (amount or supplier changed): ' || v_reset;
  end if;
  if v_off > 0 then
    msg := msg || E'\n🟡 Supplier payments outside an approved run (7 days): ' || v_off;
  end if;
  light := case when v_col_n = 0 then '🟢' else '🔴' end;
  msg := msg || E'\n' || light || ' Client collections overdue 30+ days: ' || v_col_n
      || case when v_col_n > 0 then ', ₱' || to_char(v_col_amt, peso) else '' end;
  if v_col_n > 0 then
    k := 0;
    for r in
      with bal as (
        select m.deal_id, m.invoice_no, m.name, m.due_date,
               coalesce(nullif(m.net_receivable, 0), m.amount)
                 - coalesce((select sum(p.amount) from public.billing_payments p where p.milestone_id = m.id and not coalesce(p.bounced, false)), 0) as b
          from public.billing_milestones m
         where coalesce(m.status, '') not in ('Cancelled','Draft') and m.due_date < d - 30)
      select bal.*, coalesce(nullif(dl.contact, ''), dl.client) proj from bal left join public.deals dl on dl.id = bal.deal_id
       where b > 0.5 order by b desc limit 5
    loop
      msg := msg || E'\n   • ' || coalesce(r.proj, '—') || ' ' || coalesce(nullif(r.invoice_no, ''), r.name, '')
          || ' ₱' || to_char(r.b, peso) || ', due ' || to_char(r.due_date, 'DD Mon');
    end loop;
  end if;
  light := case when v_2307 = 0 then '🟢' when v_2307 <= 2 then '🟡' else '🔴' end;
  msg := msg || E'\n' || light || ' Client 2307s not received for ' || q_label || ': ' || v_2307
      || case when v_2307 > 0 then ', ₱' || to_char(v_2307_amt, peso) || ' EWT' else '' end;
  msg := msg || E'\n\nThresholds are the monitoring flow''s proposals. Full board: FabHub › Finance › Monitoring Board.';

  if p_send then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    chat := bot->'chatIds'->>'management';
    if token is not null and chat is not null then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || token || '/sendMessage',
        body := jsonb_build_object('chat_id', chat, 'text', msg),
        headers := '{"Content-Type": "application/json"}'::jsonb);
      sent := true;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values (v_od_days <= 7 and v_col_n = 0,
            jsonb_build_object('kind', 'monitoring_board', 'run_status', v_run_status, 'run_total', v_run_total,
                               'cash', v_cash, 'overdue', v_od_n, 'collections_overdue', v_col_n,
                               'client_2307_outstanding', v_2307, 'off_cycle', v_off, 'message', msg), sent);
  end if;
  return jsonb_build_object('sent', sent, 'message', msg);
end $function$;

revoke execute on function public.monitoring_board_alert(boolean) from public, anon, authenticated;

select cron.schedule('fabhub-monitoring-board', '12 0 * * 1', $$select public.monitoring_board_alert(true)$$);
