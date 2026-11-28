-- Billing health Telegram: shorter message (Paulo, 2026-11-27).
--
-- The daily billing_health_alert() message printed every amount to the
-- centavo, repeated "contract ₱… billing ₱… (under ₱…)" on each line, carried
-- the long "receipt type (VAT / non-VAT) doesn't match the deal; amounts
-- VAT-inc" text inside the client name, and ended with "Nothing was changed."
--
-- Now:
--   ⚠️ Billing ≠ Contract: 39 deals · ₱3.1M under, ₱0.2M over
--   CE-2026-1441 Dot Coffee: ₱660K of ₱1.32M (−₱660K)
--   CE-2026-064 Innovator [VAT type]: ₱2.15M of ₱2.41M (−₱258K)
--   …
--   +26 more · FabHub › Billing › "Billing ≠ Contract"
-- Amounts are rounded (₱K / ₱M); exact figures stay on the Billing screen.
--
-- Only the wording changes: the checks (billing_health_check,
-- billing_contract_gaps), the recipients, the Monday OK line and the log are
-- the same. The text is built by the new billing_health_message(r jsonb), so it
-- can be tested without sending anything.

create or replace function public.fabhub_peso_short(v numeric)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
           when v is null then '₱?'
           when abs(v) >= 1000000 then '₱' || trim(trailing '.' from trim(trailing '0' from to_char(round(abs(v) / 1000000, 2), 'FM999,990.00'))) || 'M'
           when abs(v) >= 1000    then '₱' || to_char(round(abs(v) / 1000), 'FM999,990') || 'K'
           else '₱' || to_char(round(abs(v)), 'FM990')
         end;
$$;
revoke execute on function public.fabhub_peso_short(numeric) from public, anon, authenticated;

create or replace function public.billing_health_message(r jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  msg    text := '';
  line   jsonb;
  n      int  := 0;
  shown  constant int := 10;
  gaps   int  := coalesce((r->>'contract_gap')::int, 0);
  drift  int  := coalesce((r->>'drift')::int, 0);
  under  numeric;
  over   numeric;
  client text;
  parts  text;
begin
  if r ? 'error' then
    return E'⚠️ FabHub billing check failed: ' || (r->>'error')
        || E'\nDeal totals unverified today.';
  end if;
  if coalesce((r->>'ok')::boolean, false) then
    return null;
  end if;

  if coalesce((r->>'triggers')::int, 3) <> 3 then
    msg := msg || E'\n🚨 Only ' || (r->>'triggers') || ' of 3 billing triggers on: payments may not update deal totals.';
  end if;

  if drift > 0 then
    msg := msg || E'\n⚠️ Wrong deal totals: ' || drift || ' deal' || case when drift = 1 then '' else 's' end;
    for line in select * from jsonb_array_elements(r->'rows') loop
      n := n + 1;
      exit when n > shown;
      parts := concat_ws(', ',
        case when abs((line->>'amount_paid')::numeric - (line->>'should_paid')::numeric) >= 0.005
             then 'paid ' || public.fabhub_peso_short((line->>'amount_paid')::numeric)
                  || '→' || public.fabhub_peso_short((line->>'should_paid')::numeric) end,
        case when abs((line->>'invoiced')::numeric - (line->>'should_invoiced')::numeric) >= 0.005
             then 'invoiced ' || public.fabhub_peso_short((line->>'invoiced')::numeric)
                  || '→' || public.fabhub_peso_short((line->>'should_invoiced')::numeric) end);
      client := coalesce(line->>'client', '');
      client := case when length(client) > 26 then rtrim(left(client, 25)) || '…' else client end;
      msg := msg || E'\n' || coalesce(line->>'ce_no', '?') || ' ' || client || ': ' || parts;
    end loop;
    if drift > shown then
      msg := msg || E'\n+' || (drift - shown) || ' more';
    end if;
  end if;

  if gaps > 0 then
    select coalesce(sum(-(x->>'gap')::numeric) filter (where (x->>'gap')::numeric < 0), 0),
           coalesce(sum((x->>'gap')::numeric)  filter (where (x->>'gap')::numeric > 0), 0)
      into under, over
      from jsonb_array_elements(r->'gap_rows') x;
    if msg <> '' then msg := msg || E'\n'; end if;
    msg := msg || E'\n⚠️ Billing ≠ Contract: ' || gaps || ' deal' || case when gaps = 1 then '' else 's' end
               || ' · ' || concat_ws(', ',
                    case when under > 0 then public.fabhub_peso_short(under) || ' under' end,
                    case when over  > 0 then public.fabhub_peso_short(over)  || ' over'  end);
    n := 0;
    for line in select * from jsonb_array_elements(r->'gap_rows') loop
      n := n + 1;
      exit when n > shown;
      -- billing_contract_gaps() appends the VAT explanation to the client name
      client := split_part(coalesce(line->>'client', ''), ' — ', 1);
      client := case when length(client) > 26 then rtrim(left(client, 25)) || '…' else client end;
      msg := msg || E'\n' || coalesce(line->>'ce_no', '?') || ' ' || client
                 || case when line->>'kind' = 'vat' then ' [VAT type]' else '' end
                 || ': ' || public.fabhub_peso_short((line->>'sched')::numeric)
                 || ' of ' || public.fabhub_peso_short((line->>'contract')::numeric)
                 || ' (' || case when (line->>'gap')::numeric < 0 then '−' else '+' end
                 || public.fabhub_peso_short((line->>'gap')::numeric) || ')';
    end loop;
    msg := msg || E'\n' || case when gaps > shown then '+' || (gaps - shown) || ' more · ' else '' end
               || 'FabHub › Billing › "Billing ≠ Contract"';
    if exists (select 1 from jsonb_array_elements(r->'gap_rows') x where x->>'kind' = 'vat') then
      msg := msg || E'\n[VAT type] = milestones VAT / non-VAT ≠ deal; amounts VAT-inc.';
    end if;
  end if;

  return ltrim(msg, E'\n');
end
$function$;
revoke execute on function public.billing_health_message(jsonb) from public, anon, authenticated;

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
  monday  boolean := extract(isodow from now() at time zone 'Asia/Manila') = 1;
  runs    int;
  bad     int;
begin
  begin
    r := public.billing_health_check();
  exception when others then
    r := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  msg := public.billing_health_message(r);

  if msg is null and monday then
    select count(*), count(*) filter (where not ok) into runs, bad
      from billing_health_log where ran_at > now() - interval '7 days';
    msg := E'✅ Billing check OK (triggers on, totals right, billing = contract). Past 7 days: '
        || runs || ' run(s), ' || bad || ' with problems.';
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
revoke execute on function public.billing_health_alert() from public, anon, authenticated;

-- Preview without sending:  select public.billing_health_message(public.billing_health_check());

-- ROLLBACK
-- Restore billing_health_alert() from 20261124040000_contract_billing_link.sql
-- (the create or replace there, unchanged). Leave billing_health_message() and
-- fabhub_peso_short() in place: nothing else uses them, and a DROP hangs the
-- Supabase MCP.
--
-- Tested 2026-11-27 on production in a rolled-back transaction: real data gives
-- 36 deals (₱3.2M under, ₱310K over), 10 lines + "+26 more"; a fake drift /
-- 2-of-3-triggers case and an OK case (no message) also checked.
