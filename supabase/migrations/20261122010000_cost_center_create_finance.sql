-- Cost centers can be added by a Manager or the Finance role (Paulo, 2026-11-22).
-- Before: Manager only (20261026090000_deals_cost_centers.sql).
-- Why: liquidations and no-PO bills are charged to a project or a GMD cost
-- center (GMD OPEX, GMD Tools…); GMD's own work such as an office renovation
-- needs its own bucket instead of hiding in OPEX, and Finance is who sets
-- those up. FinanceAssistant / Accounting are deliberately not included.
-- Every new cost center is now written to audit_log (action 'cost_center_add').
-- trg_deals_cost_center_guard silently set is_cost_center = false on any insert
-- by a non-Manager, so a Finance-created "cost center" would have saved as an
-- ordinary deal (found in the rollback test). The RPC now sets a
-- transaction-local flag (fabhub.cost_center_rpc) around its own insert and the
-- guard honours only that; a direct insert/update by a non-Manager is still
-- stripped as before.
-- Idempotent: create or replace only. App mirror: canCreateCostCenter
-- (src/core.js), createCostCenter (src/App.jsx), the "+ New cost center"
-- link in Liquidations and the Cost centers panel on Purchase Orders.

create or replace function public.create_cost_center(p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not (public.is_mgr() or public.has_role('Finance')) then
    raise exception 'Only a Manager or Finance can add a cost center' using errcode = '42501';
  end if;
  if length(v_name) < 3 or length(v_name) > 80 then
    raise exception 'Cost center name is required (3 to 80 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.deals where is_cost_center and lower(btrim(contact)) = lower(v_name)) then
    raise exception 'A cost center named "%" already exists', v_name using errcode = '23505';
  end if;

  perform set_config('fabhub.cost_center_rpc', 'on', true);
  insert into public.deals (client, contact, product, stage, value, is_cost_center, added_by)
  values ('GMD Productions Inc.', v_name, 'Internal cost center', '06 · Kickoff', 0, true, public.app_username())
  returning id into v_id;
  perform set_config('fabhub.cost_center_rpc', 'off', true);

  insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  values ('deals', v_id::text, 'cost_center_add',
          jsonb_build_object('name', v_name, 'role', public.app_role()),
          'New cost center', public.app_username(), now());
  return v_id;
end;
$function$;

create or replace function public.deals_cost_center_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if public.is_mgr() then
    return new;
  end if;
  -- Inside create_cost_center (Manager or Finance, checked there).
  if tg_op = 'INSERT' and coalesce(current_setting('fabhub.cost_center_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_cost_center := false;
  elsif new.is_cost_center is distinct from old.is_cost_center then
    new.is_cost_center := old.is_cost_center;
  end if;
  return new;
end;
$function$;
revoke execute on function public.deals_cost_center_guard() from public, anon, authenticated;

-- Callable only by logged-in users; the function itself checks the role.
revoke execute on function public.create_cost_center(text) from public, anon;
grant execute on function public.create_cost_center(text) to authenticated;

-- ROLLBACK
-- Re-run the create_cost_center definition from 20261026090000_deals_cost_centers.sql
-- (Manager only, no audit row) and deals_cost_center_guard from the same file
-- (no fabhub.cost_center_rpc branch). Cost centers added in the meantime stay; find
-- them with: select * from audit_log where action = 'cost_center_add';
