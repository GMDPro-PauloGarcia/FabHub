-- PO approval: Cost Control only, no Procurement Manager tier (Paulo, 2026-11-28).
--
-- The Procurement Manager (Marian Prile) could approve POs requested by her team
-- (April Inocentes, Mal Santos) up to ₱150,000 (migrations 20261114030000,
-- 20261123010000). The team that buys was approving its own POs, and she had
-- approved none in the two weeks before 2026-11-28. Paulo: Cost Control approves.
--
-- After this, a PO is issued by:
--   * anyone in Procurement / the Procurement Manager / a Manager, automatically on
--     save, when it is ₱10,000 or less and that supplier's POs that day are ₱10,000
--     or less (unchanged);
--   * Cost Control (QS: Ardrin, Rodney) up to ₱150,000, never a PO they requested;
--   * a Manager below ₱250,000; Paulo, Mar or Arrius from ₱250,000 (unchanged).
-- Work orders are unchanged: Marian still gives the Cost Control signature on a WO.
--
-- ROLLBACK: re-run po_line_approver_name / po_require_approver / approve_po from
-- 20261123010000_procurement_simplify.sql.

create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric, p_split numeric, p_has_supplier boolean)
returns text
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
  -- No Procurement Manager tier since 2026-11-28 (Cost Control approves).
  return null;
end $function$;
revoke execute on function public.po_line_approver_name(text, numeric, numeric, boolean) from public, anon, authenticated;

create or replace function public.po_require_approver()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric; split numeric; d date; has_sup boolean; nm text;
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
  has_sup := public.ap_vendor_key(new.supplier) <> '';
  d := coalesce(new.po_date, (coalesce(new.created_at, now()) at time zone 'Asia/Manila')::date);
  split := case when has_sup then public.po_split_total(new.po_number, new.supplier, d, new.id)
                                  + coalesce(new.qty,0)*coalesce(new.estimated_cost,0) end;
  who := public.po_line_approver_name(new.requested_by, tot, split, has_sup);
  if who is null and has_sup and tot <= 10000 and split <= 10000
     and public.has_role('Procurement', 'ProcurementManager', 'Manager') then
    select name into nm from public.user_profiles where lower(username) = lower(public.app_username());
    who := 'Auto ≤₱10K: ' || coalesce(nullif(nm,''), public.app_username());
  end if;
  if who is null then
    raise exception 'Not approved. POs of ₱10,000 or less (that supplier''s POs that day ₱%) are issued by Procurement; Cost Control (Ardrin, Rodney) approves up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000; never a PO you requested. This PO is ₱%.',
      to_char(coalesce(split,0),'FM999,999,999.00'), to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $function$;
revoke execute on function public.po_require_approver() from public, anon, authenticated;

create or replace function public.approve_po(p_po text)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare n integer;
begin
  if coalesce(btrim(p_po),'') = '' then raise exception 'PO number required' using errcode = '22023'; end if;
  -- Procurement keeps access for POs of ₱10,000 or less (issued on save); the
  -- trigger refuses anything larger from them.
  if not public.has_role('Manager','QS','Procurement','ProcurementManager') then
    raise exception 'Only Cost Control (up to ₱150,000) or a Manager can approve a PO; Procurement issues POs of ₱10,000 or less' using errcode = '42501';
  end if;
  update public.purchase_requests set status = 'PO Issued'
   where po_number = p_po and status = 'Pending Approval';
  get diagnostics n = row_count;
  return n;
end $function$;
