-- PO approval tiers + Arrius Catubay as Manager. Decided with Paulo 2026-11-09.
-- RELEASE: Saturday / Sunday only (CLAUDE.md). Written 2026-11-09, apply on 14–15 Nov.
--
-- 1. Who approves (issues) a PO, by PO total (qty × estimated cost, non-cancelled lines):
--      • Cost Control (QS: Ardrin, Rodney): up to ₱150,000, never one they requested
--        (unchanged, 20261107010000);
--      • a Manager (Paolo Gomez): below ₱250,000;
--      • ₱250,000 and above: only Paulo Garcia, Mar Mungcal or Arrius Catubay
--        (po_top_approver). They also review what Paolo Gomez approves.
--    Before this, any Manager approved any amount.
-- 2. Arrius Catubay (username arrius) moves from Operations to Manager: same powers
--    as Paulo and Mar. He must log out and in again to get the new role.
--
-- Mirrors PO_MANAGER_LIMIT / PO_TOP_APPROVERS / canApprovePOLine (src/core.js) and
-- OWNER_USERS (src/App.jsx). Keep them in sync. Idempotent.

create or replace function public.po_top_approver()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select lower(coalesce(public.app_username(), '')) in ('paulo', 'mar', 'arrius')
$$;

create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare me record;
begin
  select name, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if not found then return null; end if;
  if public.has_role('Manager') or me.role = 'Manager' then
    if coalesce(p_total,0) < 250000 or public.po_top_approver() then return me.name; end if;
    return null;
  end if;
  if (public.has_role('QS') or me.role = 'QS')
     and coalesce(p_total,0) <= 150000
     and (coalesce(btrim(p_requested_by),'') = '' or lower(btrim(p_requested_by)) <> lower(btrim(me.name))) then
    return me.name;
  end if;
  return null;
end $$;

create or replace function public.po_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests where id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  tot := public.po_total(new.po_number, new.id) + coalesce(new.qty,0)*coalesce(new.estimated_cost,0);
  who := public.po_line_approver_name(new.requested_by, tot);
  if who is null then
    raise exception 'Cost Control approves POs up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000 (never a PO you requested). This PO is ₱%.', to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $$;

-- Arrius → Manager (logged). trg_protect_user_profile keeps role/status unless a
-- Manager makes the change, so this runs as Paulo (claims last until the end of
-- this transaction only).
select set_config('request.jwt.claims', '{"username":"paulo","user_role":"Manager"}', true);
with ch as (
  update public.user_profiles set role = 'Manager'
   where username = 'arrius' and role = 'Operations'
  returning id, name)
insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
select 'user_profiles', ch.id::text, 'role_change', jsonb_build_object('role','Manager'), jsonb_build_object('role','Operations'),
       'Arrius Catubay set up as a Manager, like Paulo and Mar (Paulo, 2026-11-09)', 'Paulo Garcia', now()
  from ch;

revoke execute on function public.po_top_approver() from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;

-- ROLLBACK
--   update public.user_profiles set role = 'Operations' where username = 'arrius';
--   Restore po_line_approver_name() / po_require_approver() from 20261107010000
--   (any Manager approves any amount). po_top_approver() can stay.
