-- Subcon work orders need two signatures: Cost Control, then Finance. No amount limit.
-- Decided with Paulo 2026-11-12: "work order has no limits but must be approved by Cost
-- Control and Finance"; "Ardrin does not approve work orders"; "Paolo Gomez sign for
-- finance"; "Marian and Rodney can approve WO".
-- RELEASE: Saturday / Sunday only (CLAUDE.md).
--
--   1. Cost Control signature: Rodney Erpe (username rodney) or the Procurement Manager
--      (user_profiles.role 'ProcurementManager', Marian Prile). Ardrin does not sign.
--   2. Finance signature: Paolo Gomez (username paolo), with Paulo and Mar as back-up (as
--      for supplier bills). It issues the WO.
--   Nobody signs both steps, and nobody signs a WO they requested. The down-payment rule
--   (swo_require_dp) still applies when the WO is issued.
-- Before this, one Manager or the Procurement Manager approved and issued a WO in one step
-- (po_approver_name); in practice Paulo approved all of them.
--
-- Both signatures go through sign_wo(id): Rodney (QS) has no write on subcon_work_orders.
-- cc_approved_by / cc_approved_at can only be set by sign_wo (swo_cc_guard keeps the old
-- values otherwise, so a stale full-row save can't add or remove a signature). The app
-- never writes them (read-only in its mapper).
-- WOs already Issued / In Progress / Completed are untouched.
--
-- Mirrors woSignStep / WO_CC_SIGNERS / WO_FIN_SIGNERS (src/core.js) and the WO buttons in
-- SubconWOView (src/App.jsx). Keep them in sync. Idempotent.

alter table public.subcon_work_orders add column if not exists cc_approved_by text;
alter table public.subcon_work_orders add column if not exists cc_approved_at timestamptz;

-- Who may sign which step (null = neither).
create or replace function public.wo_signer_kind(p_username text, p_role text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  select case
    when lower(coalesce(p_username,'')) in ('paolo','paulo','mar') then 'finance'
    when lower(coalesce(p_username,'')) = 'rodney' or p_role = 'ProcurementManager' then 'cc'
    else null end
$$;

-- Keep the Cost Control signature unless sign_wo is setting it.
create or replace function public.swo_cc_guard()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if coalesce(current_setting('fabhub.wo_sign', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
      return new;   -- upsert of an existing row: the UPDATE branch decides
    end if;
    new.cc_approved_by := null;
    new.cc_approved_at := null;
    return new;
  end if;
  new.cc_approved_by := old.cc_approved_by;
  new.cc_approved_at := old.cc_approved_at;
  return new;
end $$;

create or replace trigger trg_swo_cc_guard
  before insert or update on public.subcon_work_orders
  for each row execute function public.swo_cc_guard();

-- Issuing needs the Cost Control signature and a Finance signer who isn't the Cost Control
-- signer or the requester.
create or replace function public.swo_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  me record; cc text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    return new;
  end if;
  select name, username, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  cc := case when tg_op = 'UPDATE' then old.cc_approved_by else null end;
  if coalesce(cc, '') = '' then
    raise exception 'This work order needs Cost Control''s signature first (Rodney or Marian), then Finance (Paolo Gomez).'
      using errcode = 'insufficient_privilege';
  end if;
  if me.name is null or public.wo_signer_kind(me.username, me.role) is distinct from 'finance' then
    raise exception 'Finance (Paolo Gomez; Paulo or Mar as back-up) issues a work order after Cost Control signs.'
      using errcode = 'insufficient_privilege';
  end if;
  if lower(btrim(me.name)) = lower(btrim(cc))
     or lower(btrim(me.name)) = lower(btrim(coalesce(new.requested_by, ''))) then
    raise exception 'You signed or requested this work order: another Finance signer must issue it.'
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := me.name;
  return new;
end $$;

-- One call for both steps: signs whichever step the caller may sign.
create or replace function public.sign_wo(p_id uuid)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; w public.subcon_work_orders; kind text;
begin
  select name, username, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if me.name is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  kind := public.wo_signer_kind(me.username, me.role);
  if kind is null then
    raise exception 'Only Cost Control (Rodney, Marian) or Finance (Paolo Gomez) signs work orders.' using errcode = '42501';
  end if;
  select * into w from public.subcon_work_orders where id = p_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if coalesce(w.status,'') in ('Issued','In Progress','Completed') then
    raise exception 'Work order % is already %', coalesce(w.wo_number,''), w.status using errcode = '22023';
  end if;
  if coalesce(w.status,'') in ('Cancelled','Void','Rejected') then
    raise exception 'Work order % is %', coalesce(w.wo_number,''), w.status using errcode = '22023';
  end if;
  if lower(btrim(me.name)) = lower(btrim(coalesce(w.requested_by,''))) then
    raise exception 'You requested this work order: someone else signs it.' using errcode = '42501';
  end if;
  if coalesce(w.cc_approved_by,'') = '' then
    if kind <> 'cc' then
      raise exception 'Cost Control (Rodney or Marian) signs first.' using errcode = '42501';
    end if;
    perform set_config('fabhub.wo_sign', '1', true);   -- lets swo_cc_guard keep this signature
    update public.subcon_work_orders
       set cc_approved_by = me.name, cc_approved_at = now(),
           status = case when coalesce(status,'') = 'Draft' then 'Pending Approval' else status end
     where id = p_id;
    perform set_config('fabhub.wo_sign', '', true);
    return 'cc';
  end if;
  if kind <> 'finance' then
    raise exception 'Cost Control has signed (%); Finance (Paolo Gomez) signs next.', w.cc_approved_by using errcode = '42501';
  end if;
  perform set_config('fabhub.wo_sign', '1', true);
  update public.subcon_work_orders
     set status = 'Issued', acct_status = coalesce(nullif(acct_status,''), 'For Accounting')
   where id = p_id;   -- swo_require_approver checks and stamps approved_by; swo_require_dp the DP
  perform set_config('fabhub.wo_sign', '', true);
  return 'issued';
end $$;

revoke execute on function public.wo_signer_kind(text, text) from public, anon, authenticated;
revoke execute on function public.swo_cc_guard() from public, anon, authenticated;
revoke execute on function public.swo_require_approver() from public, anon, authenticated;
revoke execute on function public.sign_wo(uuid) from public, anon;
grant execute on function public.sign_wo(uuid) to authenticated;

-- ROLLBACK
--   alter table public.subcon_work_orders disable trigger trg_swo_cc_guard;
--   Restore swo_require_approver() from 20261106000000_subcon_billing_audit_fixes.sql
--   (one-step approval via po_approver_name). sign_wo / wo_signer_kind and the two columns
--   can stay; nothing else uses them.
