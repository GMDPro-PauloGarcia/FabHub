-- ── Close paid POs whose receipt was never recorded (AP cutover, 2026-11-05) ─
-- Applied to production 2026-11-05 (version 20261105222542) after a rolled-back test: 485 POs, 950 lines, ₱7.17M closed.
-- Paulo approved (2026-11-05, "go on the bulk close").
-- After the Oct 26 AP-sheet import, 702 POs had a PAID bill but were still
-- "PO Issued", because Warehouse never recorded the receipt in FabHub. They kept
-- AP's open-PO total at ₱10.9M and would show as "paid without full match" on the
-- monitoring board.
--
-- Closed here (status Delivered, qty_delivered = qty) only when ALL hold:
--   • the PO's bill is Paid and it has no other open bill
--   • every line is tagged to a client project (not GMD Stocks, not a cost
--     center: receiving those adds stock, so Warehouse counts them)
--   • the PO is dated before 2026-10-06 (30+ days old; newer ones may be in transit)
-- = 485 POs, 950 lines, ₱7.17M on 2026-11-05. The other 217 paid POs (stock / cost
-- center / recent) stay open for Warehouse to receive.
-- No stock movement is written (project-direct materials went to site). The
-- receipt is not proven: every line says so in delivery_note, which starts
-- "Closed at AP cutover 2026-11-05", so reports can tell these from real receipts.
-- delivery_history is not touched. Each line change is in audit_log
-- (trg_audit_purchase_request) and the lines as they were are kept in
-- purchase_requests_backup_20261105 (server-only).
--
-- ROLLBACK (puts every line back as it was):
--   update public.purchase_requests p
--      set status = b.status, qty_delivered = b.qty_delivered,
--          delivery_date = b.delivery_date, delivery_note = b.delivery_note
--     from public.purchase_requests_backup_20261105 b
--    where b.id = p.id and p.delivery_note like 'Closed at AP cutover 2026-11-05%';

create table if not exists public.purchase_requests_backup_20261105 as
with l as (
  select pr.*, d.is_cost_center cc
    from public.purchase_requests pr left join public.deals d on d.id = pr.deal_id
   where pr.status in ('PO Issued','Partially Delivered') and coalesce(pr.po_number,'') <> ''),
po as (
  select po_number, min(coalesce(po_date, created_at::date)) d,
         bool_or(deal_id is null or project_name ilike '%gmd stock%' or coalesce(cc,false)) excl
    from l group by 1),
pick as (
  select po_number from po
   where not excl and d < date '2026-10-06'
     and exists (select 1 from public.payables b where b.po_id = po.po_number and b.status = 'Paid')
     and not exists (select 1 from public.payables b where b.po_id = po.po_number and b.status not in ('Paid','Cancelled','Void')))
select pr.* from public.purchase_requests pr
 where pr.status in ('PO Issued','Partially Delivered') and pr.po_number in (select po_number from pick);
alter table public.purchase_requests_backup_20261105 enable row level security;
revoke all on public.purchase_requests_backup_20261105 from public, anon, authenticated;

update public.purchase_requests p
   set status = 'Delivered',
       qty_delivered = p.qty,
       delivery_date = coalesce(p.delivery_date,
                        (select max(b.paid_date) from public.payables b where b.po_id = p.po_number and b.status = 'Paid'),
                        p.po_date),
       delivery_note = 'Closed at AP cutover 2026-11-05: paid per AP sheet; receipt was never recorded in FabHub'
                       || coalesce(' · ' || nullif(p.delivery_note, ''), '')
  from public.purchase_requests_backup_20261105 bk
 where bk.id = p.id and p.status in ('PO Issued','Partially Delivered');

insert into public.audit_log (table_name, record_id, action, reason, performed_by, performed_at, snapshot)
select 'purchase_requests', 'ap-cutover-20261105', 'ap_cutover_close',
       'Paid POs closed as received at AP cutover (Paulo, 2026-11-05)', 'migration', now(),
       jsonb_build_object('lines', count(*), 'pos', count(distinct po_number),
                          'value', round(sum(coalesce(nullif(actual_cost,0), estimated_cost, 0) * coalesce(qty,0))))
  from public.purchase_requests_backup_20261105
 where not exists (select 1 from public.audit_log where record_id = 'ap-cutover-20261105');
