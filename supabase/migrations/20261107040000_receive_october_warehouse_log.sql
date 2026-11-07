-- October receipts from the Warehouse's own log (Paulo, 2026-11-07, option A).
--
-- Warehouse kept October receipts in Excel because it could not see PO lines in
-- FabHub (fixed by 20261107010000). 84 receipts were compared with FabHub's PO
-- lines: 41 matched strongly (same supplier, item, quantity, date window). This
-- records the 30 strong matches whose PO is already issued ("PO Issued"):
-- 30 lines on 24 POs, none on a client project. The matches on POs still in
-- "Pending Approval" wait for Cost Control to approve the PO; the 11 doubtful
-- and 32 unmatched rows are left for Warehouse.
--
-- Each line: qty_delivered = received qty, status Delivered / Partially
-- Delivered, delivery_date and dr_no from the log, a delivery_history entry, and
-- a delivery_note saying where it came from. Only lines still at "PO Issued" with
-- nothing received are touched. Run without JWT claims (data fix).
-- Lines as they were: purchase_requests_backup_20261107b.
--
-- ROLLBACK
--   update public.purchase_requests p set status = b.status, qty_delivered = b.qty_delivered,
--          delivery_date = b.delivery_date, dr_no = b.dr_no, delivery_note = b.delivery_note,
--          delivery_history = b.delivery_history
--     from public.purchase_requests_backup_20261107b b
--    where b.id = p.id and p.delivery_note like 'Received per Warehouse October log%';

create table if not exists public.purchase_requests_backup_20261107b as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261107b enable row level security;

create temp table oct_recv(id uuid, rqty numeric, rdate date, dr text, rby text, xrow int) on commit drop;
insert into oct_recv values
('498cdda3-567b-4407-8407-5e5c3cc4b38e'::uuid,10.0,'2026-10-05'::date,'116011','CED',6),
('6ef785b8-4073-4a1e-856a-18eacd9e6cbc'::uuid,20.0,'2026-10-21'::date,'117790','CED',8),
('a3d6efa0-ed84-4acb-b1d1-e1f6c9e9e84f'::uuid,15.0,'2026-10-26'::date,'117799','CED',9),
('17348edd-a7e5-4dc8-ac82-50dbea309426'::uuid,10.0,'2026-10-05'::date,'116011','CED',14),
('95d2b384-2984-4c44-aee9-10f5dab98cb7'::uuid,10.0,'2026-10-05'::date,'116011','CED',15),
('1a6834c3-1f86-4821-b7a5-bdf27fae06e5'::uuid,10.0,'2026-10-26'::date,'117799','CED',17),
('2e6655b6-d416-417a-9d39-18c3e25a3ce9'::uuid,10.0,'2026-10-12'::date,'117776','CED',22),
('d0fd23c5-7256-44c5-8b3a-15e4061a9dd8'::uuid,10.0,'2026-10-05'::date,'17185','CED',32),
('19356d7b-757d-45c1-9d37-0583420049ee'::uuid,50.0,'2026-10-01'::date,'17131','CED',45),
('9293c35b-68a5-4671-ba65-1a05fb1ef1f2'::uuid,50.0,'2026-10-10'::date,'17273','CED',46),
('4f8a6c4f-07d8-44f9-81ce-87f5c1059b8e'::uuid,100.0,'2026-10-14'::date,'415242','RENZ',47),
('7d646157-dbd5-46f4-b41f-33ef525d934e'::uuid,100.0,'2026-10-14'::date,'0019','CED',48),
('b8e3f082-9111-4b89-bd96-2ee2367de1f1'::uuid,150.0,'2026-10-16'::date,'421','CED',50),
('eccf4756-a6ee-408a-9333-2c6efcd3973c'::uuid,27.0,'2026-10-21'::date,'000430','CED',51),
('c39c6641-ee4f-4bb1-9b3a-ab7477d078e9'::uuid,2.0,'2026-10-23'::date,'0022','CED',52),
('593a2443-1a1c-433e-8273-c6fa510d99cd'::uuid,3.0,'2026-10-26'::date,'0027','CED',53),
('ef821283-1da0-4d2e-a4b9-a6864e370857'::uuid,10.0,'2026-10-03'::date,'33923','CED',54),
('8b884223-0d6d-4ac5-a408-b3b69e329655'::uuid,15.0,'2026-10-14'::date,'34107','CED',55),
('61814712-c78a-48ac-8354-47a55431ef0d'::uuid,10.0,'2026-10-19'::date,'34164','CED',56),
('b6711757-31c8-4f6f-80a6-5e2d0e108813'::uuid,10.0,'2026-10-23'::date,'34271','CED',57),
('f04c1b1c-fa5f-4de2-af16-cb94ad1fae3c'::uuid,72.0,'2026-10-15'::date,'364851','CED',61),
('60418f38-82fc-4f5a-b34c-12be0d0c5229'::uuid,20.0,'2026-10-01'::date,'17131','CED',63),
('66a8d7fc-efa4-4e40-b15f-dc5882fd3dbf'::uuid,20.0,'2026-10-01'::date,'17131','CED',64),
('541e0874-7630-42a0-8c7d-afa1508b2a00'::uuid,20.0,'2026-10-15'::date,'415245','CED',65),
('7094e8fc-a238-4941-bd79-f714b30b96ee'::uuid,20.0,'2026-10-19'::date,'117790','CED',66),
('6ba84c21-c34a-4220-9845-2b6a7cb57149'::uuid,10.0,'2026-10-01'::date,'SI006601','CED',82),
('6fdfc0c1-ddee-4a9f-b84f-83f6a5f9881d'::uuid,20.0,'2026-10-19'::date,'SI007208','CED',83),
('e45400de-2d01-43c5-85ee-92b4dfeec5d8'::uuid,15.0,'2026-10-19'::date,'SI007208','CED',85),
('4f751762-f450-46e0-932d-9d8b8dd20535'::uuid,1.0,'2026-10-19'::date,'116176','CED',86),
('cbd20f83-24f1-4b8b-a304-fb8bc099c28d'::uuid,10.0,'2026-10-23'::date,'116210','CED',87);

insert into public.purchase_requests_backup_20261107b
  select r.* from public.purchase_requests r join oct_recv o using (id)
   where r.status = 'PO Issued' and coalesce(r.qty_delivered,0) = 0
     and not exists (select 1 from public.purchase_requests_backup_20261107b b where b.id = r.id);

update public.purchase_requests p
   set qty_delivered = o.rqty,
       status = case when o.rqty >= coalesce(p.qty,0) then 'Delivered' else 'Partially Delivered' end,
       delivery_date = o.rdate,
       dr_no = coalesce(nullif(btrim(o.dr),''), p.dr_no),
       delivery_note = 'Received per Warehouse October log (Excel row ' || o.xrow || ', loaded 2026-11-07); received by ' || coalesce(nullif(btrim(o.rby),''),'?'),
       delivery_history = coalesce(p.delivery_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'date', o.rdate, 'qty', o.rqty, 'total', o.rqty, 'drNo', coalesce(o.dr,''),
         'recordedBy', 'Warehouse October log (' || coalesce(nullif(btrim(o.rby),''),'?') || ')'))
  from oct_recv o, public.purchase_requests_backup_20261107b b
 where p.id = o.id and b.id = p.id and p.status = 'PO Issued' and coalesce(p.qty_delivered,0) = 0;

insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'purchase_requests', 'october-receipts-20261107', 'bulk_receive',
       jsonb_build_object('lines', count(*), 'pos', count(distinct po_number)),
       'October receipts from the Warehouse Excel log, strong matches on issued POs (Paulo, option A)',
       'Paulo Garcia', now()
  from public.purchase_requests_backup_20261107b
 where not exists (select 1 from public.audit_log where record_id = 'october-receipts-20261107');
