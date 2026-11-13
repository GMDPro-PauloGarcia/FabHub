-- One-off: approve the supplier bills waiting for approval. Paulo, 2026-11-11 ("yes clear
-- them all"). RELEASE: Saturday / Sunday only, and only after Paulo confirms in the session.
--
-- As of 2026-11-12: 181 bills, ₱2.10M, oldest 11 Sep 2026, all on a PO and within the PO's
-- amount (incl. VAT), none on a subcon WO. None has a recorded receipt: approval does not
-- release cash for those, because a materials PO bill whose PO isn't fully delivered can be
-- paid only by a Manager or from an approved payment run (recordPayments, src/App.jsx —
-- app-side only).
--
-- Approves every unpaid bill that is Pending, on a PO, within the PO total × 1.12 (+₱1),
-- not a subcon bill, and not entered by Paulo (no self-approval). Stamped
-- approved_by = 'Bulk approval (Paulo Garcia) 2026-11-14'. Runs without JWT claims, so
-- enforce_payable_approval lets it through (the same route as the 7 Nov PO bulk approval).
-- Bills as they were: payables_backup_20261114. One audit_log row (record_id
-- 'bulk-approve-bills-20261114') lists every bill id.
--
-- ROLLBACK
--   update public.payables p set approval_status = b.approval_status, approved_by = b.approved_by,
--          approved_at = b.approved_at
--     from public.payables_backup_20261114 b
--    where b.id = p.id and p.approved_by = 'Bulk approval (Paulo Garcia) 2026-11-14'
--      and coalesce(p.paid_amount,0) = 0;   -- leave any bill already paid since

create table if not exists public.payables_backup_20261114 as
  select * from public.payables where false;
alter table public.payables_backup_20261114 enable row level security;
-- No policies: readable only by the service role / SQL editor.

with target as (
  select p.id
    from public.payables p
   where coalesce(p.status,'') not in ('Paid','Cancelled','Void')
     and p.approval_status = 'Pending'
     and coalesce(p.po_number,'') <> ''
     and coalesce(p.category,'') <> 'Subcontractor' and p.po_number not ilike 'WO-%'
     and coalesce(p.account_code,'') not in ('5070','5100','5200')
     and lower(trim(coalesce(p.created_by,''))) not in ('paulo garcia','paulo')
     and p.amount <= coalesce((select sum(coalesce(r.qty,0)*coalesce(r.estimated_cost,0))*1.12
                                 from public.purchase_requests r
                                where r.po_number = p.po_number and coalesce(r.status,'') <> 'Cancelled'),0) + 1
     and not exists (select 1 from public.payables_backup_20261114 b where b.id = p.id)
), saved as (
  insert into public.payables_backup_20261114 select p.* from public.payables p join target t on t.id = p.id
  returning id
), upd as (
  update public.payables p
     set approval_status = 'Approved',
         approved_by = 'Bulk approval (Paulo Garcia) 2026-11-14',
         approved_at = now()
    from saved s where s.id = p.id
  returning p.id, p.amount
)
insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'payables', 'bulk-approve-bills-20261114', 'bulk_approve',
       jsonb_build_object('count', count(*), 'total', sum(amount), 'ids', jsonb_agg(id)),
       'Supplier bills waiting for approval, all within their PO amount, approved in bulk at Paulo''s request (2026-11-11). Receipt still gates payment.',
       'Paulo Garcia', now()
  from upd having count(*) > 0;
