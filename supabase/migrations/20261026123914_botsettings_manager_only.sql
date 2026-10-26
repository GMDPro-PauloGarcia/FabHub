-- ── Telegram chat IDs: Manager only ────────────────────────────────────────
-- app_settings_ins / _upd let Manager, Finance, Accounting and FinanceAssistant
-- write ANY app_settings row, including botsettings. Now that the server sends
-- every Telegram message to the chat IDs in botsettings, whoever can edit them
-- can redirect management alerts (billing health, cash edits after lock,
-- offsets) to a chat of their own. These RESTRICTIVE policies narrow writes to
-- the botsettings row to Managers; every other key is unchanged.
-- Matches the Bot Settings page, which is now edit-only for Managers.
--
-- ROLLBACK
--   drop policy if exists app_settings_botsettings_ins_mgr on public.app_settings;
--   drop policy if exists app_settings_botsettings_upd_mgr on public.app_settings;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'app_settings' and policyname = 'app_settings_botsettings_ins_mgr') then
    create policy app_settings_botsettings_ins_mgr on public.app_settings
      as restrictive for insert to authenticated
      with check (key <> 'botsettings' or public.has_role('Manager'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_settings' and policyname = 'app_settings_botsettings_upd_mgr') then
    create policy app_settings_botsettings_upd_mgr on public.app_settings
      as restrictive for update to authenticated
      using (key <> 'botsettings' or public.has_role('Manager'))
      with check (key <> 'botsettings' or public.has_role('Manager'));
  end if;
end
$$;
