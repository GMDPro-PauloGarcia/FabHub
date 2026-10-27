-- Internal cost centers.
--
-- GMD buys for itself as well as for client projects: office/operating spend,
-- tools, warehouse stock, HR. POs, payables and expenses must point at a deal,
-- so people created fake "projects" for these (CE-2026-1095 GMD OPEX,
-- CE-2026-1096 GMD Tools, CE-2026-1212 GMD Warehouse Stocks; ~P220K of POs
-- between them). They showed up as active projects, in won counts and on
-- project boards.
--
-- A cost center is still a deals row (so every PO, payable and expense keeps
-- working and nothing is moved), flagged is_cost_center. The app leaves cost
-- centers out of projects, pipeline, KPIs and commission, and offers them in
-- the purchase / expense / payable / voucher pickers instead (src/App.jsx:
-- wonDeals vs costCenterDeals). POs tagged "GMD Stocks" with no deal are
-- unchanged.
--
-- Rules:
--   * Only a Manager may set or clear is_cost_center. Anyone else's change is
--     silently kept at the old value (a stale full-row save still works) and
--     a new deal they insert is never a cost center.
--   * create_cost_center(p_name): Manager only. Creates an internal deal
--     (client "GMD Productions Inc.", value 0, no Sales Owner) flagged as a
--     cost center. It gets a CE and JO code like any awarded deal.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.deals add column if not exists is_cost_center boolean not null default false;

-- The three internal buckets that were created as projects.
update public.deals set is_cost_center = true
 where ce_no in ('CE-2026-1095', 'CE-2026-1096', 'CE-2026-1212')
   and client ilike 'GMD Productions%'
   and not is_cost_center;

-- (Runs before the guard below exists: the guard keeps non-Manager changes,
-- and a migration has no Manager JWT.)

create or replace function public.deals_cost_center_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_mgr() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_cost_center := false;
  elsif new.is_cost_center is distinct from old.is_cost_center then
    new.is_cost_center := old.is_cost_center;
  end if;
  return new;
end;
$$;

revoke execute on function public.deals_cost_center_guard() from public, anon, authenticated;

create or replace trigger trg_deals_cost_center_guard
  before insert or update of is_cost_center on public.deals
  for each row execute function public.deals_cost_center_guard();

create or replace function public.create_cost_center(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can add a cost center' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 80 then
    raise exception 'Cost center name is required (80 characters max)' using errcode = '22023';
  end if;
  if exists (select 1 from public.deals where is_cost_center and lower(btrim(contact)) = lower(v_name)) then
    raise exception 'A cost center named "%" already exists', v_name using errcode = '23505';
  end if;

  insert into public.deals (client, contact, product, stage, value, is_cost_center, added_by)
  values ('GMD Productions Inc.', v_name, 'Internal cost center', '06 · Kickoff', 0, true, public.app_username())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_cost_center(text) from public, anon;
grant  execute on function public.create_cost_center(text) to authenticated;

-- ROLLBACK
-- update public.deals set is_cost_center = false where is_cost_center;  -- as a Manager / owner
-- drop function if exists public.create_cost_center(text);
-- drop trigger if exists trg_deals_cost_center_guard on public.deals;
-- drop function if exists public.deals_cost_center_guard();
-- alter table public.deals drop column if exists is_cost_center;
