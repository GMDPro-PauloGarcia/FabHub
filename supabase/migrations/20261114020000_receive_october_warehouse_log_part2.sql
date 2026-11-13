-- October receipts, part 2 (Paulo, option A). RELEASE: weekend (apply 14-15 Nov).
-- The 11 strong matches from the Warehouse October log whose PO was still in
-- "Pending Approval" on 7 Nov. All 11 lines (8 POs) were approved since (Rodney
-- Erpe / Paulo), so they are recorded as received the same way as part 1
-- (20261107040000). Only lines still at "PO Issued" with nothing received are
-- touched. Lines as they were: purchase_requests_backup_20261114b.
-- ROLLBACK
--   update public.purchase_requests p set status = b.status, qty_delivered = b.qty_delivered,
--          delivery_date = b.delivery_date, dr_no = b.dr_no, delivery_note = b.delivery_note,
--          delivery_history = b.delivery_history
--     from public.purchase_requests_backup_20261114b b
--    where b.id = p.id and p.delivery_note like 'Received per Warehouse October log%';

create table if not exists public.purchase_requests_backup_20261114b as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261114b enable row level security;

create temp table oct_recv(id uuid, rqty numeric, rdate date, dr text, rby text, xrow int) on commit drop;
insert into oct_recv values
('51c0b664-74e6-48e0-a065-8742ca8f9bd8'::uuid,8.0,'2026-10-26'::date,'','',10),
('466402d2-bb31-4a7b-ae55-baa9947fa294'::uuid,8.0,'2026-10-30'::date,'118506','CED',20),
('7bc6a2c3-a7c6-4b45-8326-e62220b110a5'::uuid,7.0,'2026-10-30'::date,'118506','CED',23),
('88dbf57e-355c-47f9-b439-2f680d93d749'::uuid,10.0,'2026-10-30'::date,'25150','CED',25),
('299cf8bd-8683-4520-911e-1a2ec7f1f267'::uuid,24.0,'2026-10-26'::date,'365305','CED',29),
('76acdac3-cd6c-4233-850f-acd12e37a98a'::uuid,50.0,'2026-10-28'::date,'25107','CED',44),
('58316180-52c8-4de2-9591-ca3deffa64e2'::uuid,12.0,'2026-10-31'::date,'','CED',58),
('6b16be77-0c41-4262-b444-93cd345a67e5'::uuid,100.0,'2026-10-26'::date,'116234','CED',69),
('e346d7c5-fe00-4374-98fb-dcc7741653d7'::uuid,10.0,'2026-10-30'::date,'SI007604','CED',81),
('4a908003-689c-41e4-8627-5d652aa9ff84'::uuid,10.0,'2026-10-30'::date,'SI007604','CED',84),
('f41e539e-2d78-4bf3-87f1-5bead5b84a80'::uuid,20.0,'2026-10-30'::date,'118506','CED',88);

insert into public.purchase_requests_backup_20261114b
  select r.* from public.purchase_requests r join oct_recv o using (id)
   where r.status = 'PO Issued' and coalesce(r.qty_delivered,0) = 0
     and not exists (select 1 from public.purchase_requests_backup_20261114b b where b.id = r.id);

update public.purchase_requests p
   set qty_delivered = o.rqty,
       status = case when o.rqty >= coalesce(p.qty,0) then 'Delivered' else 'Partially Delivered' end,
       delivery_date = o.rdate,
       dr_no = coalesce(nullif(btrim(o.dr),''), p.dr_no),
       delivery_note = 'Received per Warehouse October log (Excel row ' || o.xrow || ', loaded 2026-11-07); received by ' || coalesce(nullif(btrim(o.rby),''),'?'),
       delivery_history = coalesce(p.delivery_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'date', o.rdate, 'qty', o.rqty, 'total', o.rqty, 'drNo', coalesce(o.dr,''),
         'recordedBy', 'Warehouse October log (' || coalesce(nullif(btrim(o.rby),''),'?') || ')'))
  from oct_recv o, public.purchase_requests_backup_20261114b b
 where p.id = o.id and b.id = p.id and p.status = 'PO Issued' and coalesce(p.qty_delivered,0) = 0;

insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'purchase_requests', 'october-receipts-20261114', 'bulk_receive',
       jsonb_build_object('lines', count(*), 'pos', count(distinct po_number)),
       'October receipts from the Warehouse Excel log, strong matches on POs approved since 7 Nov (Paulo, option A, part 2)',
       'Paulo Garcia', now()
  from public.purchase_requests_backup_20261114b
 where not exists (select 1 from public.audit_log where record_id = 'october-receipts-20261114');
