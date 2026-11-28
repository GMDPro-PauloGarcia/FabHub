-- Bulk approval of the POs left in "Pending Approval" (Paulo, 2026-11-28).
--
-- On 28 Nov 2026, 172 POs (₱2.43M at estimated cost) sat in "Pending Approval",
-- 113 of them older than 14 days; all requested by Procurement (April Inocentes,
-- Mal Santos, Marian Prile), none with a supplier bill yet. Paulo: "as of today
-- all these purchase orders have been pre-approved". They are set to PO Issued:
--   * POs on projects whose down payment is clear (deal_dp_clear());
--   * stock POs (no project);
--   * POs on awarded projects whose client hasn't paid yet (deal_dp_awarded()):
--     the 2026-11-27 rule lets these issue with a reason, so each line carries
--     dp_override_reason, audit_log gets one 'dp_override' row per PO and the
--     management chat one Telegram listing them.
-- Not touched: POs with any line on a project that is not awarded and not clear
-- (still refused by the rule: no PO before award). Those stay with Procurement
-- to cancel, or for a Manager to waive the down payment on the deal.
--
-- approved_by = 'Bulk approval (Paulo Garcia) 2026-11-28' so they can be told
-- apart from POs approved by a person. Paulo is a top approver (po_top_approver),
-- so this covers the PO of ₱250,000 or more too. No supplier bill is created.
-- Run without JWT claims, so po_require_approver / po_require_dp don't apply; the
-- down-payment rule is applied here through deal_dp_clear() / deal_dp_awarded().
-- Lines as they were: purchase_requests_backup_20261128.
--
-- ROLLBACK
--   update public.purchase_requests p
--      set status = b.status, approved_by = b.approved_by, approved_at = b.approved_at,
--          dp_override_reason = b.dp_override_reason
--     from public.purchase_requests_backup_20261128 b
--    where b.id = p.id and p.status = 'PO Issued'
--      and p.approved_by = 'Bulk approval (Paulo Garcia) 2026-11-28';

create table if not exists public.purchase_requests_backup_20261128 as
  select * from public.purchase_requests where false;
alter table public.purchase_requests_backup_20261128 enable row level security;

-- Every pending PO whose lines are all clear, stock, or on an awarded project.
with ln as (
  select r.po_number,
         case when r.deal_id is null then 'clear'
              when public.deal_dp_clear(r.deal_id) then 'clear'
              when public.deal_dp_awarded(r.deal_id) then 'awarded'
              else 'blocked' end k
    from public.purchase_requests r
   where r.status = 'Pending Approval' and coalesce(r.po_number, '') <> ''),
ok as (select po_number from ln group by 1 having bool_and(k <> 'blocked'))
insert into public.purchase_requests_backup_20261128
  select r.* from public.purchase_requests r join ok using (po_number)
   where r.status = 'Pending Approval'
     and not exists (select 1 from public.purchase_requests_backup_20261128 b where b.id = r.id);

-- Lines on awarded-but-unpaid projects carry the reason.
update public.purchase_requests p
   set dp_override_reason = 'Bulk approval (Paulo Garcia) 2026-11-28: pre-approved, project awarded'
  from public.purchase_requests_backup_20261128 b
 where b.id = p.id and p.status = 'Pending Approval'
   and p.deal_id is not null and not public.deal_dp_clear(p.deal_id);

-- One dp_override audit row per PO issued before the client paid.
insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
select 'purchase_requests', p.po_number, 'dp_override',
       jsonb_build_object('kind', 'PO', 'number', p.po_number, 'deal_id', min(p.deal_id::text),
                          'ce_no', min(d.ce_no), 'client', min(d.client), 'party', min(p.supplier),
                          'amount', round(sum(coalesce(p.qty, 0) * coalesce(p.estimated_cost, 0)), 2),
                          'bulk', 'bulk-approve-20261128'),
       'Paulo Garcia', min(p.dp_override_reason)
  from public.purchase_requests p
  join public.purchase_requests_backup_20261128 b on b.id = p.id
  left join public.deals d on d.id = p.deal_id
 where p.status = 'Pending Approval' and coalesce(p.dp_override_reason, '') <> ''
   and not exists (select 1 from public.audit_log a
                    where a.action = 'dp_override' and a.record_id = p.po_number
                      and a.snapshot->>'bulk' = 'bulk-approve-20261128')
 group by p.po_number;

-- Telegram to management: one message for the POs issued before the client paid.
do $$
declare
  msg text;
begin
  select string_agg(format('%s · %s · %s · ₱%s', po_number, coalesce(ce_no, '—'), coalesce(client, '—'),
                           to_char(amt, 'FM999,999,990')), E'\n' order by client, po_number)
    into msg
    from (select p.po_number, min(d.ce_no) ce_no, min(d.client) client,
                 sum(coalesce(p.qty, 0) * coalesce(p.estimated_cost, 0)) amt
            from public.purchase_requests p
            join public.purchase_requests_backup_20261128 b on b.id = p.id
            left join public.deals d on d.id = p.deal_id
           where p.status = 'Pending Approval' and coalesce(p.dp_override_reason, '') <> ''
           group by p.po_number) x;
  if msg is not null then
    begin
      perform public.send_telegram('management',
        left(E'⚠️ <b>POs issued before the client paid (bulk approval, Paulo, 28 Nov)</b>\n' || msg
             || E'\n→ Sales / Finance: collect the down payment', 4000), null);
    exception when others then null;
    end;
  end if;
end $$;

update public.purchase_requests p
   set status = 'PO Issued',
       approved_by = 'Bulk approval (Paulo Garcia) 2026-11-28',
       approved_at = date '2026-11-28'
  from public.purchase_requests_backup_20261128 b
 where b.id = p.id and p.status = 'Pending Approval';

insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'purchase_requests', 'bulk-approve-20261128', 'bulk_approve',
       jsonb_build_object('pos', count(distinct po_number), 'lines', count(*),
                          'value', round(sum(coalesce(qty, 0) * coalesce(estimated_cost, 0))),
                          'dp_override_pos', count(distinct po_number) filter (
                              where deal_id is not null and not public.deal_dp_clear(deal_id))),
       'Pending Approval POs pre-approved by Paulo set to PO Issued (not-awarded projects left out)',
       'Paulo Garcia', now()
  from public.purchase_requests_backup_20261128
 where not exists (select 1 from public.audit_log where record_id = 'bulk-approve-20261128');
