-- Procurement Manager approves her team's POs up to ₱50,000. Decided with Paulo 2026-11-09.
-- RELEASE: Saturday / Sunday only (CLAUDE.md). Apply AFTER 20261114010000 (PO tiers), in the
-- same release; then switch PO_TIERS_ON on in src/core.js. This file repeats the tier rule of
-- 20261114010000 and adds one branch, so applying it alone would also switch the tiers on.
--
-- Who approves (issues) a PO, by PO total (qty × estimated cost, non-cancelled lines):
--   • Procurement Manager (Marian Prile, user_profiles.role 'ProcurementManager'): up to
--     ₱50,000, only a PO requested by a Procurement-team member (role 'Procurement', e.g.
--     April Inocentes, Mal Santos), never one she requested, never one with no supplier,
--     and only while everything ordered from that supplier on the same PO date is ₱50,000
--     or less in total (po_split_total), so one order can't be cut into small POs to stay
--     under her limit. Anything else goes to Cost Control / a Manager.
--   • Cost Control (QS): up to ₱150,000, never one they requested (unchanged).
--   • a Manager (Paolo Gomez): below ₱250,000; ₱250,000 and above only Paulo, Mar or
--     Arrius (po_top_approver) — unchanged from 20261114010000.
-- Why the limit: the 7 Nov audit took PO approval from Procurement (whoever buys doesn't
-- approve). 96% of the team's POs (Sep–Nov 2026) are ₱50,000 or less (₱5.05M of ₱10.55M),
-- and they were queuing behind two QS. Her approvals are kept in audit_log by
-- trg_audit_purchase_request, like every PO line change.
--
-- The JWT carries user_role 'Procurement' for a ProcurementManager (mint-session), so
-- the Procurement Manager is told apart by user_profiles.role, and approve_po admits the
-- Procurement claim; the trigger then refuses anyone the rule doesn't name (April, Mal).
-- Work orders are unchanged (swo_require_approver / po_approver_name).
--
-- Mirrors PO_PROC_MGR_LIMIT / canApprovePOLine / PO_APPROVER_MSG (src/core.js). Keep in sync.
-- Idempotent.

-- Everything ordered from the supplier of PO p_po on its PO date (all POs, non-cancelled
-- lines), with p_except's stored amount left out so the trigger can add the new values.
create or replace function public.po_split_total(p_po text, p_supplier text, p_date date, p_except uuid default null)
returns numeric language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(sum(coalesce(qty,0)*coalesce(estimated_cost,0)),0)
    from public.purchase_requests
   where coalesce(status,'') <> 'Cancelled'
     and coalesce(po_number,'') <> ''
     and public.ap_vendor_key(supplier) = public.ap_vendor_key(p_supplier)
     and coalesce(po_date, (created_at at time zone 'Asia/Manila')::date) = p_date
     and (p_except is null or id <> p_except)
$$;

-- The approver's name if the current user may approve a PO line requested by
-- p_requested_by on a PO worth p_total; null otherwise. p_split is what the PO's
-- supplier was ordered on the PO's date (null = unknown: no Procurement Manager approval).
create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric, p_split numeric, p_has_supplier boolean)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare me record; req_role text;
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
  if me.role = 'ProcurementManager'
     and coalesce(p_has_supplier, false)
     and p_split is not null
     and coalesce(p_total,0) <= 50000
     and p_split <= 50000
     and coalesce(btrim(p_requested_by),'') <> ''
     and lower(btrim(p_requested_by)) <> lower(btrim(me.name)) then
    select role into req_role from public.user_profiles
     where lower(btrim(name)) = lower(btrim(p_requested_by)) and lower(coalesce(status,'active')) <> 'inactive'
     limit 1;
    if req_role = 'Procurement' then return me.name; end if;
  end if;
  return null;
end $$;

-- Two-argument form (kept for anything that still calls it): no split figure, so it
-- never grants the Procurement Manager.
create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select public.po_line_approver_name(p_requested_by, p_total, null::numeric, false)
$$;

create or replace function public.po_require_approver()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric; split numeric; d date; has_sup boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  -- Upsert of an existing row: the UPDATE branch of this trigger decides.
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
  has_sup := public.ap_vendor_key(new.supplier) <> '';
  d := coalesce(new.po_date, (coalesce(new.created_at, now()) at time zone 'Asia/Manila')::date);
  split := case when has_sup then public.po_split_total(new.po_number, new.supplier, d, new.id)
                                  + coalesce(new.qty,0)*coalesce(new.estimated_cost,0) end;
  who := public.po_line_approver_name(new.requested_by, tot, split, has_sup);
  if who is null then
    raise exception 'Not approved. Marian approves her team''s POs up to ₱50,000 (supplier''s POs that day ₱%), Cost Control up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000; never a PO you requested. This PO is ₱%.',
      to_char(coalesce(split,0),'FM999,999,999.00'), to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $$;

-- approve_po: the Procurement claim may call it now; the trigger decides per line.
create or replace function public.approve_po(p_po text)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare n integer;
begin
  if coalesce(btrim(p_po),'') = '' then raise exception 'PO number required' using errcode = '22023'; end if;
  if not public.has_role('Manager','QS','Procurement') then
    raise exception 'Only the Procurement Manager (her team''s POs up to ₱50,000), Cost Control (up to ₱150,000) or a Manager can approve a PO' using errcode = '42501';
  end if;
  update public.purchase_requests set status = 'PO Issued'
   where po_number = p_po and status = 'Pending Approval';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.po_split_total(text, text, date, uuid) from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;
revoke execute on function public.approve_po(text) from public, anon;
grant execute on function public.approve_po(text) to authenticated;

-- ROLLBACK
--   Re-run 20261114010000 (restores po_line_approver_name(text, numeric) and
--   po_require_approver() without the Procurement Manager branch), then restore
--   approve_po() from 20261107010000 (has_role('Manager','QS')).
--   po_split_total() and the four-argument po_line_approver_name() can stay; nothing calls them then.
