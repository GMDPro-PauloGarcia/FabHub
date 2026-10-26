-- Client profiles (billing address, TIN, contact, terms) save one client at a
-- time through set_client_profile.
--
-- They live in one app_settings row (key 'clientprofiles', a JSON object keyed
-- by client name), and the app used to upsert the WHOLE object on every edit:
--   * app_settings_upd only admits Manager / Finance / Accounting /
--     FinanceAssistant, so Sales' edits were rejected and the error swallowed
--     (.catch(()=>{})): the edit showed until the next reload, then vanished.
--     The row had not changed since 2026-09-04.
--   * Whole-object saves from a stale copy wipe other people's edits.
-- This RPC merges one client's profile server-side (atomic, no clobbering),
-- checks the role, and keeps every change in audit_log.
--
-- Who may edit: Manager, Finance, FinanceAssistant, Accounting, Sales,
-- SalesOpsAdmin. Mirrors CLIENT_PROFILE_EDITORS in src/App.jsx: keep in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.set_client_profile(p_name text, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_old  jsonb;
begin
  if not public.has_role('Manager', 'Finance', 'FinanceAssistant', 'Accounting', 'Sales', 'SalesOpsAdmin') then
    raise exception 'Not allowed to edit client profiles' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'Client name is required (200 characters max)' using errcode = '22023';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Profile must be an object' using errcode = '22023';
  end if;
  if length(p_profile::text) > 20000 then
    raise exception 'Profile is too large' using errcode = '22001';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('clientprofiles', '{}'::jsonb, now())
  on conflict (key) do nothing;

  select value -> v_name into v_old
  from public.app_settings where key = 'clientprofiles' for update;

  if v_old is not distinct from p_profile then
    return p_profile;
  end if;

  update public.app_settings
     set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(v_name, p_profile),
         updated_at = now()
   where key = 'clientprofiles';

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    ('app_settings', 'clientprofiles:' || v_name, 'update', v_old, p_profile,
     array['clientprofiles'], public.app_username(), 'client profile');

  return p_profile;
end;
$$;

revoke execute on function public.set_client_profile(text, jsonb) from public, anon;
grant  execute on function public.set_client_profile(text, jsonb) to authenticated;

-- ROLLBACK
-- drop function if exists public.set_client_profile(text, jsonb);
