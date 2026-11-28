-- Re-tag the 6 POs left pending on dead projects by the 2026-11-28 bulk approval
-- (Paulo, 2026-11-28: "I think this was a wrong tagging").
--
-- * Trilliant CE-2026-1103 "Marry Me Kiosk" is Did Not Win; the Marry Me work
--   was done under CE-2026-060 "Marry Me Construction" (awarded, Close-Out).
--   Paulo moved other kiosk lines to CE-2026-060 earlier the same day.
--   PO-1058 (glass), PO-1129 (paint), PO-1450 (acrylic) -> CE-2026-060.
-- * Erbe CE-2026-1431 was a mother PO (standby, ₱0) cancelled on 2026-11-13; the
--   booth became CE-2026-1453 (JO-0354-01, Close-Out). PO-1457 (plywood) and
--   PO-1466 (GI tubular) -> CE-2026-1453.
-- * PO-1474 was issued twice on 2026-11-10, six minutes apart: Mal Santos's
--   arecom cleaning lines (CE-2026-060) and April Inocentes's Al Metal flat bar
--   (Erbe). April's line gets its own new PO number (next_doc_number) and
--   CE-2026-1453; Mal's keep PO-1474.
-- All stay "Pending Approval" for Cost Control (Ardrin / Rodney) to approve in
-- the app. CE-2026-1453's client hasn't paid, so issuing those asks for a reason
-- (awarded-project prompt). Lines as they were: purchase_requests_backup_20261128b.
--
-- ROLLBACK
--   update public.purchase_requests p
--      set deal_id = b.deal_id, po_number = b.po_number, project_name = b.project_name, notes = b.notes
--     from public.purchase_requests_backup_20261128b b where b.id = p.id;

create table if not exists public.purchase_requests_backup_20261128b as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261128b enable row level security;

insert into public.purchase_requests_backup_20261128b
select r.* from public.purchase_requests r
 where r.status = 'Pending Approval'
   and r.deal_id in (select id from public.deals where ce_no in ('CE-2026-1103', 'CE-2026-1431'))
   and r.po_number in ('PO-1058', 'PO-1129', 'PO-1450', 'PO-1457', 'PO-1466', 'PO-1474')
   and not exists (select 1 from public.purchase_requests_backup_20261128b b where b.id = r.id);

do $$
declare
  v_060  uuid := (select id from public.deals where ce_no = 'CE-2026-060');
  v_1453 uuid := (select id from public.deals where ce_no = 'CE-2026-1453');
  v_new  text;
begin
  if v_060 is null or v_1453 is null then raise exception 'target deal missing'; end if;

  update public.purchase_requests p
     set deal_id = v_060,
         notes = concat_ws(' ', nullif(p.notes, ''), 'Moved from CE-2026-1103 (kiosk, Did Not Win) to CE-2026-060 by Paulo 2026-11-28.')
    from public.purchase_requests_backup_20261128b b
   where b.id = p.id and p.po_number in ('PO-1058', 'PO-1129', 'PO-1450')
     and p.deal_id is distinct from v_060;

  update public.purchase_requests p
     set deal_id = v_1453,
         notes = concat_ws(' ', nullif(p.notes, ''), 'Moved from CE-2026-1431 (cancelled mother PO) to CE-2026-1453 by Paulo 2026-11-28.')
    from public.purchase_requests_backup_20261128b b
   where b.id = p.id and p.po_number in ('PO-1457', 'PO-1466')
     and p.deal_id is distinct from v_1453;

  if exists (select 1 from public.purchase_requests p join public.purchase_requests_backup_20261128b b on b.id = p.id
              where p.po_number = 'PO-1474') then
    v_new := 'PO-' || lpad(public.next_doc_number('PO',
               (select coalesce(max((regexp_match(po_number, '^PO-(\d+)$'))[1]::bigint), 0)
                  from public.purchase_requests))::text, 4, '0');
    update public.purchase_requests p
       set deal_id = v_1453, po_number = v_new,
           notes = concat_ws(' ', nullif(p.notes, ''), 'Was PO-1474 (number shared with an arecom PO); moved from CE-2026-1431 to CE-2026-1453 by Paulo 2026-11-28.')
      from public.purchase_requests_backup_20261128b b
     where b.id = p.id and p.po_number = 'PO-1474';
  end if;

  insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  select 'purchase_requests', 'retag-dead-pos-20261128', 'retag',
         jsonb_build_object('lines', count(*), 'new_po_for_1474', v_new),
         'POs on Did Not Win / cancelled deals moved to the awarded deal that carried the work (Paulo)',
         'Paulo Garcia', now()
    from public.purchase_requests_backup_20261128b
   where not exists (select 1 from public.audit_log where record_id = 'retag-dead-pos-20261128');
end $$;
