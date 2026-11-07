-- PO approval by Cost Control up to ₱150,000, and Warehouse receiving that works.
-- Decided with Paulo 2026-11-07 (department audit).
--
-- 1. Who approves (issues) a PO:
--      • Cost Control (QS: Ardrin Salustiano, Rodney Erpe) when the PO total is
--        ₱150,000 or less, and never a PO they requested;
--      • a Manager for any amount (Paolo Gomez as Finance manager above ₱150,000,
--        with Paulo and Mar as back-up).
--    The Procurement Manager no longer approves POs (whoever buys doesn't approve).
--    Work orders are unchanged: swo_require_approver still uses po_approver_name().
--    PO total = sum of qty × estimated cost over the PO's lines that aren't
--    Cancelled (before VAT / PO discounts).
--
-- 2. Upsert bug: the app saves PO lines with an upsert, and Postgres runs BEFORE
--    INSERT triggers even when the upsert updates an existing row. On an issued
--    line, po_require_approver took the INSERT path and refused every edit by a
--    non-approver ("Only a Manager or the Procurement Manager can approve this
--    PO"), receipts included. It now returns early on INSERT when the row exists
--    and lets the UPDATE branch decide (same fix as 20261106000000 for WOs).
--
-- 3. Warehouse could not read purchase_requests at all (not in the select
--    policy), so its Deliveries board was empty and no receipt was recorded in
--    FabHub (0 in the 30 days to 2026-11-07). Warehouse can now read PO lines and
--    record receipts through receive_po_line(), which changes only the delivery
--    fields. Warehouse still cannot insert, edit or delete PO lines otherwise.
--
-- 4. approve_po(po_number): issues every "Pending Approval" line of one PO under
--    the rule above (the triggers still check the approver and the down payment).
--    Cost Control has no update rights on purchase_requests, so approving goes
--    through this function.
--
-- Mirrors canApprovePOLine (src/core.js) and the receive / approve calls in
-- src/App.jsx. Keep them in sync. Idempotent.

-- ── 1+2. approver rule and upsert fix ────────────────────────────────────────
create or replace function public.po_total(p_po text, p_except uuid default null)
returns numeric language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(sum(coalesce(qty,0)*coalesce(estimated_cost,0)),0)
    from public.purchase_requests
   where po_number = p_po and coalesce(status,'') <> 'Cancelled'
     and (p_except is null or id <> p_except)
$$;

-- The approver's name if the current user may approve a PO line requested by
-- p_requested_by on a PO worth p_total; null otherwise.
create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare me record;
begin
  select name, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if not found then return null; end if;
  if public.has_role('Manager') or me.role = 'Manager' then return me.name; end if;
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
  who := public.po_line_approver_name(new.requested_by, tot);
  if who is null then
    raise exception 'Only Cost Control (POs up to ₱150,000) or a Manager can approve this PO, and not one they requested. This PO is ₱%.', to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $$;

-- ── 3. Warehouse reads PO lines; receipts through one function ───────────────
alter policy purchase_requests_sel on public.purchase_requests
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','QS','Warehouse'));

create or replace function public.receive_po_line(p_id uuid, p_qty numeric, p_date date default null, p_dr_no text default null, p_note text default null)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.purchase_requests; me record; st text; d date;
begin
  if not public.has_role('Warehouse','Procurement','Manager') then
    raise exception 'Only Warehouse, Procurement or a Manager records deliveries' using errcode = '42501';
  end if;
  select name into me from public.user_profiles where username = public.app_username();
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'PO line not found' using errcode = 'P0002'; end if;
  if coalesce(r.status,'') not in ('PO Issued','Partially Delivered','Delivered') then
    raise exception 'PO % is %: only an issued PO can be received', coalesce(r.po_number,''), coalesce(r.status,'') using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter the quantity received' using errcode = '22023'; end if;
  st := case when p_qty >= coalesce(r.qty,0) then 'Delivered' when p_qty > 0 then 'Partially Delivered' else 'PO Issued' end;
  d := coalesce(p_date, (now() at time zone 'Asia/Manila')::date);
  update public.purchase_requests
     set qty_delivered = p_qty, status = st, delivery_date = d,
         dr_no = coalesce(nullif(btrim(p_dr_no),''), dr_no),
         delivery_note = coalesce(nullif(btrim(p_note),''), delivery_note),
         delivery_history = coalesce(delivery_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'date', d, 'qty', p_qty - coalesce(r.qty_delivered,0), 'total', p_qty,
           'drNo', coalesce(nullif(btrim(p_dr_no),''), nullif(btrim(p_note),''), ''), 'recordedBy', coalesce(me.name, public.app_username())))
   where id = p_id;
  return st;
end $$;

-- ── 4. approve one PO ────────────────────────────────────────────────────────
create or replace function public.approve_po(p_po text)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare n integer;
begin
  if coalesce(btrim(p_po),'') = '' then raise exception 'PO number required' using errcode = '22023'; end if;
  if not public.has_role('Manager','QS') then
    raise exception 'Only Cost Control (POs up to ₱150,000) or a Manager can approve a PO' using errcode = '42501';
  end if;
  update public.purchase_requests set status = 'PO Issued'
   where po_number = p_po and status = 'Pending Approval';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.po_total(text, uuid) from public, anon, authenticated;
revoke execute on function public.po_line_approver_name(text, numeric) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;
revoke execute on function public.receive_po_line(uuid, numeric, date, text, text) from public, anon;
revoke execute on function public.approve_po(text) from public, anon;
grant execute on function public.receive_po_line(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.approve_po(text) to authenticated;

-- ROLLBACK
--   alter policy purchase_requests_sel on public.purchase_requests
--     using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','QS'));
--   Restore po_require_approver() from 20261027132908_po_require_approver.sql (Manager or
--   Procurement Manager via po_approver_name; no INSERT early return).
--   revoke execute on function public.receive_po_line(uuid, numeric, date, text, text) from authenticated;
--   revoke execute on function public.approve_po(text) from authenticated;
--   (po_total / po_line_approver_name / receive_po_line / approve_po can stay; nothing calls them then.)
