-- ── Telegram bot token: server-side only (step 1 of 2) ─────────────────────
-- The bot token lived in app_settings.botsettings, which every logged-in user
-- can read (app_settings_sel = is_user()), and every browser posted to
-- api.telegram.org with it. Anyone with the token can post to every GMD
-- Telegram group as FabHub, read the bot's updates, or change the bot.
--
-- This step:
--   • app_secrets: RLS on, no policies, no grants. Only security definer
--     functions (owned by postgres) can read it.
--   • Copies the current token into app_secrets.
--   • send_telegram(dept, message, chat_id?): any FabHub user sends a message
--     through the server. chat_id override (the Settings "Test" button) is
--     Manager / Finance only. Returns the pg_net request id.
--   • telegram_send_result(id): Manager / Finance read a send's outcome.
--   • set_telegram_token(token): Manager only. Logged in audit_log (never the
--     token itself).
--   • telegram_token_status(): whether a token is set, when, by whom.
--   • billing_health_alert() reads the token from app_secrets.
-- Step 2 (after the app stops reading the token) strips it from
-- app_settings.botsettings and keeps it out.
--
-- ROLLBACK
--   create or replace function public.billing_health_alert() … (previous body:
--     token := bot->>'token';)
--   drop function if exists public.send_telegram(text, text, text);
--   drop function if exists public.telegram_send_result(bigint);
--   drop function if exists public.set_telegram_token(text);
--   drop function if exists public.telegram_token_status();
--   drop table if exists public.app_secrets;

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;

insert into public.app_secrets (key, value, updated_by)
select 'telegram_bot_token', value->>'token', 'migration'
  from public.app_settings
 where key = 'botsettings' and coalesce(value->>'token', '') <> ''
on conflict (key) do nothing;

-- Send one message. dept picks the chat from botsettings.chatIds (falling back
-- to management, as the app always did).
create or replace function public.send_telegram(p_dept text, p_message text, p_chat_id text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tok  text;
  chat text;
begin
  if not public.is_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'message required' using errcode = '22023';
  end if;
  if length(p_message) > 4096 then
    raise exception 'message too long (max 4096)' using errcode = '22023';
  end if;
  if p_chat_id is not null then
    if not public.has_role('Manager', 'Finance') then
      raise exception 'only a Manager or Finance may send to a chosen chat' using errcode = '42501';
    end if;
    if p_chat_id !~ '^-?[0-9]{1,20}$' then
      raise exception 'chat id must be a number' using errcode = '22023';
    end if;
    chat := p_chat_id;
  else
    select coalesce(nullif(value->'chatIds'->>coalesce(p_dept, ''), ''), nullif(value->'chatIds'->>'management', ''))
      into chat
      from app_settings where key = 'botsettings';
  end if;
  select value into tok from app_secrets where key = 'telegram_bot_token';
  if tok is null or chat is null then
    return null;
  end if;
  return net.http_post(
    url     := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body    := jsonb_build_object('chat_id', chat, 'text', p_message, 'parse_mode', 'HTML'),
    headers := '{"Content-Type": "application/json"}'::jsonb);
end
$$;

-- Outcome of a send (for the Settings "Test" button). Telegram's reply never
-- contains the token.
create or replace function public.telegram_send_result(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if not public.has_role('Manager', 'Finance') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select status_code, content, error_msg into r from net._http_response where id = p_id;
  if not found then
    return jsonb_build_object('done', false);
  end if;
  begin
    return jsonb_build_object(
      'done', true,
      'ok', r.status_code = 200,
      'description', case when r.status_code = 200 then null
                          else coalesce((r.content::jsonb)->>'description', r.error_msg, 'HTTP ' || r.status_code) end);
  exception when others then
    return jsonb_build_object('done', true, 'ok', false, 'description', 'unreadable reply');
  end;
end
$$;

create or replace function public.set_telegram_token(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role('Manager') then
    raise exception 'only a Manager may change the bot token' using errcode = '42501';
  end if;
  if coalesce(p_token, '') !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$' then
    raise exception 'that does not look like a Telegram bot token' using errcode = '22023';
  end if;
  insert into app_secrets (key, value, updated_at, updated_by)
  values ('telegram_bot_token', p_token, now(), public.app_username())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  values ('app_secrets', 'telegram_bot_token', 'UPDATE', jsonb_build_object('token_suffix', right(p_token, 4)),
          'Telegram bot token changed', public.app_username(), now());
end
$$;

create or replace function public.telegram_token_status()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select case when not public.is_user() then null
    else coalesce((select jsonb_build_object('set', true, 'updated_at', updated_at, 'updated_by', updated_by)
                     from app_secrets where key = 'telegram_bot_token'),
                  jsonb_build_object('set', false)) end
$$;

revoke execute on function public.send_telegram(text, text, text) from public, anon;
revoke execute on function public.telegram_send_result(bigint) from public, anon;
revoke execute on function public.set_telegram_token(text) from public, anon;
revoke execute on function public.telegram_token_status() from public, anon;
grant execute on function public.send_telegram(text, text, text) to authenticated;
grant execute on function public.telegram_send_result(bigint) to authenticated;
grant execute on function public.set_telegram_token(text) to authenticated;
grant execute on function public.telegram_token_status() to authenticated;

-- Daily billing health alert: token from app_secrets (body otherwise unchanged).
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
    msg := E'⚠️ FabHub billing totals problem';
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
    msg := msg || E'\nOpen a FabHub Claude session to investigate. Nothing was changed.';
  elsif monday then
    select count(*), count(*) filter (where not ok) into runs, bad
      from billing_health_log where ran_at > now() - interval '7 days';
    msg := E'✅ FabHub weekly billing check: all OK today (3 triggers, 0 drift). '
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
