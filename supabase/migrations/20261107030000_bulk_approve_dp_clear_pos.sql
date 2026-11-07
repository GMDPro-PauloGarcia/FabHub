-- Bulk approval of the POs left in "Pending Approval" (Paulo, 2026-11-07).
--
-- Department audit, 7 Nov 2026: 330 POs sat in "Pending Approval", the oldest
-- from 4 Sep. 201 of them (393 lines, ₱4.93M at estimated cost) were on projects
-- whose down payment is clear (deal_dp_clear(): paid, waived, credit terms,
-- internal GMD job, or a cleared mother PO) and were waiting only for an
-- approver's click; goods had already been ordered from the suppliers and 4 had
-- paid bills. Paulo decided they are set to approved ("PO Issued").
-- Not touched: the 93 POs still waiting on a client down payment, and the 36
-- with no project (stock / cost-center POs), which stay with the approvers.
--
-- approved_by = 'Bulk approval (Paulo Garcia) 2026-11-07' so they can be told
-- apart from POs approved by a person. No supplier bill is created: those POs
-- show as "PO not billed yet" on Supplier Bills until the supplier's invoice is
-- recorded. Run without JWT claims, so po_require_approver / po_require_dp don't
-- apply (the down-payment rule is applied here through deal_dp_clear()).
-- Lines as they were: purchase_requests_backup_20261107.
--
-- ROLLBACK
--   update public.purchase_requests p set status = b.status, approved_by = b.approved_by, approved_at = b.approved_at
--     from public.purchase_requests_backup_20261107 b where b.id = p.id and p.status = 'PO Issued'
--      and p.approved_by = 'Bulk approval (Paulo Garcia) 2026-11-07';

create table if not exists public.purchase_requests_backup_20261107 as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261107 enable row level security;

with po as (
  select po_number, max(deal_id::text) d from public.purchase_requests
   where status = 'Pending Approval' and coalesce(po_number,'') <> '' group by 1),
clr as (select po_number from po where d is not null and public.deal_dp_clear(d::uuid))
insert into public.purchase_requests_backup_20261107
  select r.* from public.purchase_requests r join clr using (po_number)
   where r.status = 'Pending Approval'
     and not exists (select 1 from public.purchase_requests_backup_20261107 b where b.id = r.id);

update public.purchase_requests p
   set status = 'PO Issued',
       approved_by = 'Bulk approval (Paulo Garcia) 2026-11-07',
       approved_at = date '2026-11-07'
  from public.purchase_requests_backup_20261107 b
 where b.id = p.id and p.status = 'Pending Approval';

insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'purchase_requests', 'bulk-approve-20261107', 'bulk_approve',
       jsonb_build_object('pos', count(distinct po_number), 'lines', count(*),
                          'value', round(sum(coalesce(qty,0)*coalesce(estimated_cost,0)))),
       'Pending Approval POs with a clear down payment set to PO Issued (Paulo, department audit)',
       'Paulo Garcia', now()
  from public.purchase_requests_backup_20261107
 where not exists (select 1 from public.audit_log where record_id = 'bulk-approve-20261107');
