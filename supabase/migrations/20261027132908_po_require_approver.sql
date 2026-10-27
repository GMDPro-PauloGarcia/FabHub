-- ── PO / subcon work order approval: Manager or Procurement Manager only ────
-- The app's rule (canApprovePO, src/core.js) let a plain Procurement user
-- approve any PO they didn't request whenever the "PO approvers" list was
-- empty, and that list was never saved to the server, so it always was.
-- From 21 to 26 Oct 2026 Mal Santos and April Inocentes approved each other's
-- POs (261 POs, about ₱1.23M); the designated approver approved none. The
-- database did not check the approver at all: anyone who could update
-- purchase_requests (Manager, Finance, FinanceAssistant, Procurement) could
-- set a PO to "PO Issued" through the API.
--
-- Now, whenever a PO line enters an issued status (PO Issued / Partially
-- Delivered / Delivered) from any other status, or is inserted already issued,
-- the user must be a Manager, or a Procurement Manager who did not request it.
-- Same for subcon work orders entering Issued / In Progress / Completed.
-- approved_by (and approved_at on POs) are set by the server to the approver,
-- and kept unchanged while the PO stays issued, so they can't be spoofed.
-- Requests without JWT claims (service role, cron, SQL editor) are not checked,
-- like po_require_dp.
-- POs already issued are untouched.
--
-- Mirrors canApprovePO in src/core.js. Keep them in sync.
-- The JWT carries Procurement for a ProcurementManager (mint-session maps it
-- for RLS), so the Procurement Manager is read from user_profiles.
--
-- ROLLBACK
--   drop trigger if exists trg_po_require_approver on public.purchase_requests;
--   drop trigger if exists trg_swo_require_approver on public.subcon_work_orders;
--   drop function if exists public.po_require_approver();
--   drop function if exists public.swo_require_approver();
--   drop function if exists public.po_approver_name(text);

-- The approver's name if the current user may approve something requested by
-- p_requested_by; null otherwise.
create or replace function public.po_approver_name(p_requested_by text)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  me record;
begin
  select name, role into me
    from public.user_profiles
   where username = public.app_username()
     and lower(coalesce(status, 'active')) <> 'inactive';
  if not found then
    return null;
  end if;
  if public.has_role('Manager') or me.role = 'Manager' then
    return me.name;
  end if;
  if me.role = 'ProcurementManager'
     and (coalesce(btrim(p_requested_by), '') = ''
          or lower(btrim(p_requested_by)) <> lower(btrim(me.name))) then
    return me.name;
  end if;
  return null;
end
$$;

create or replace function public.po_require_approver()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    -- Already issued: keep who approved it and when.
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  who := public.po_approver_name(new.requested_by);
  if who is null then
    raise exception 'Only a Manager or the Procurement Manager can approve this PO (and not one they requested themselves).'
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end
$$;

create or replace function public.swo_require_approver()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  who text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    return new;
  end if;
  who := public.po_approver_name(new.requested_by);
  if who is null then
    raise exception 'Only a Manager or the Procurement Manager can approve this work order (and not one they requested themselves).'
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  return new;
end
$$;

revoke execute on function public.po_approver_name(text) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;
revoke execute on function public.swo_require_approver() from public, anon, authenticated;

create or replace trigger trg_po_require_approver
  before insert or update on public.purchase_requests
  for each row execute function public.po_require_approver();
create or replace trigger trg_swo_require_approver
  before insert or update on public.subcon_work_orders
  for each row execute function public.swo_require_approver();
