-- ── Telegram bot token: server-side only (step 2 of 2) ─────────────────────
-- Step 1 (20261026103448) copied the token into app_secrets and moved every
-- send to send_telegram(); the app stopped reading the token in #401. This
-- removes it from app_settings.botsettings (readable by every user) and keeps
-- it out: a stale tab running the old app still saves the whole settings
-- object, token included, and this trigger drops it.
-- Applied only after #401's production deploy was Ready (the old app sent with
-- the token from this row).
--
-- ROLLBACK (puts the token back where every user can read it; only if the
-- old app has to come back)
--   drop trigger if exists trg_app_settings_strip_bot_token on public.app_settings;
--   drop function if exists public.app_settings_strip_bot_token();
--   update public.app_settings
--      set value = value || jsonb_build_object('token', (select value from public.app_secrets where key = 'telegram_bot_token'))
--    where key = 'botsettings';

create or replace function public.app_settings_strip_bot_token()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.key = 'botsettings' and new.value ? 'token' then
    new.value := new.value - 'token';
  end if;
  return new;
end
$$;
revoke execute on function public.app_settings_strip_bot_token() from public, anon, authenticated;
create or replace trigger trg_app_settings_strip_bot_token
  before insert or update on public.app_settings
  for each row execute function public.app_settings_strip_bot_token();
update public.app_settings set value = value - 'token', updated_at = now() where key = 'botsettings' and value ? 'token';
