-- Weekly OPEX review on Telegram (decision 4 Nov 2026).
--
-- Bills with no project go to a cost center (GMD OPEX / Tools / Warehouse
-- Stocks) and must say what they were used for (app rule, PR #413). Managers
-- check them so project materials don't hide in OPEX. Every Monday 8:06 AM
-- Manila this posts to the management chat:
--   • every cost-center bill of ₱10,000 or more entered in the last 7 days,
--     with supplier, amount, cost center, who entered it and what it was for;
--   • every cost-center bill in the window with no usable description
--     (fewer than 10 characters), whatever its amount;
--   • the week's count and total, so a quiet week still shows the job ran.
-- Runs are logged in ap_health_log (details->>'kind' = 'opex_review').
-- opex_review_alert(false) builds the message without sending (dry run).

create or replace function public.opex_review_alert(p_send boolean default true)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $$
declare
  peso   text := 'FM999,999,999,990.00';
  d_to   date := (now() at time zone 'Asia/Manila')::date - 1;
  d_from date := (now() at time zone 'Asia/Manila')::date - 7;
  v_n int; v_total numeric; v_big int; v_nodesc int;
  msg text; line record; k int;
  bot jsonb; token text; chat text; sent boolean := false;
begin
  select count(*), coalesce(sum(p.amount), 0),
         count(*) filter (where p.amount >= 10000),
         count(*) filter (where length(trim(coalesce(p.notes, ''))) < 10)
    into v_n, v_total, v_big, v_nodesc
    from public.payables p join public.deals d on d.id::text = p.project_id
   where d.is_cost_center and p.created_at between d_from and d_to;

  msg := '🧾 FabHub OPEX review, ' || to_char(d_from, 'DD Mon') || ' to ' || to_char(d_to, 'DD Mon')
      || E'\nBills charged to cost centers: ' || v_n || ', ₱' || to_char(v_total, peso);

  if v_big > 0 then
    msg := msg || E'\n\nOver ₱10,000 (Managers to check it isn''t project material):'; k := 0;
    for line in
      select p.ap_number, p.vendor, p.amount, coalesce(nullif(d.contact, ''), d.client) cc,
             nullif(trim(p.created_by), '') by_who, left(trim(coalesce(p.notes, '')), 80) what
        from public.payables p join public.deals d on d.id::text = p.project_id
       where d.is_cost_center and p.created_at between d_from and d_to and p.amount >= 10000
       order by p.amount desc
    loop
      k := k + 1; exit when k > 15;
      msg := msg || E'\n• ' || coalesce(nullif(line.ap_number, ''), '(no AP no.)') || ' ' || coalesce(line.vendor, '')
          || ' ₱' || to_char(line.amount, peso) || ', ' || line.cc
          || coalesce(', by ' || line.by_who, '')
          || E'\n  For: ' || coalesce(nullif(line.what, ''), '(not stated)');
    end loop;
    if v_big > 15 then msg := msg || E'\n  …and ' || (v_big - 15) || ' more in FabHub.'; end if;
  end if;

  if v_nodesc > 0 then
    msg := msg || E'\n\nNo description of what it was used for:'; k := 0;
    for line in
      select p.ap_number, p.vendor, p.amount, coalesce(nullif(d.contact, ''), d.client) cc
        from public.payables p join public.deals d on d.id::text = p.project_id
       where d.is_cost_center and p.created_at between d_from and d_to
         and length(trim(coalesce(p.notes, ''))) < 10
       order by p.amount desc
    loop
      k := k + 1; exit when k > 10;
      msg := msg || E'\n• ' || coalesce(nullif(line.ap_number, ''), '(no AP no.)') || ' ' || coalesce(line.vendor, '')
          || ' ₱' || to_char(line.amount, peso) || ', ' || line.cc;
    end loop;
    if v_nodesc > 10 then msg := msg || E'\n  …and ' || (v_nodesc - 10) || ' more.'; end if;
  end if;

  if v_big = 0 and v_nodesc = 0 then
    msg := msg || E'\nNothing over ₱10,000 and every bill says what it was for.';
  end if;
  msg := msg || E'\n\nMove anything that belongs to a project in FabHub › Finance › Payables.';

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
    values (true, jsonb_build_object('kind', 'opex_review', 'from', d_from, 'to', d_to, 'bills', v_n,
                                     'total', v_total, 'over_10k', v_big, 'no_description', v_nodesc,
                                     'message', msg), sent);
  end if;

  return jsonb_build_object('from', d_from, 'to', d_to, 'bills', v_n, 'total', v_total,
                            'over_10k', v_big, 'no_description', v_nodesc, 'sent', sent, 'message', msg);
end $$;
revoke execute on function public.opex_review_alert(boolean) from public, anon, authenticated;

-- Monday 00:06 UTC = 8:06 AM Manila. cron.schedule with an existing name updates it.
select cron.schedule('fabhub-opex-review', '6 0 * * 1', 'select public.opex_review_alert()');

-- ROLLBACK
--   select cron.unschedule('fabhub-opex-review');
--   drop function if exists public.opex_review_alert(boolean);
