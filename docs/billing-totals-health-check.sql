-- FabHub billing-totals health check (paste into Supabase SQL editor, read-only)
-- 1) Triggers present? Expect 3 rows, all enabled ('O').
select tgname, tgrelid::regclass as on_table, tgenabled
  from pg_trigger
 where tgname in ('trg_billing_totals_sync', 'trg_deals_protect_billing_totals')
 order by 1, 2;

-- 2) Deals whose stored totals disagree with their billing records.
--    Expect 0 rows. Any row = something drifted; send the CE numbers to Claude.
with m as (
  select deal_id, round(sum(amount), 2) as inv
    from billing_milestones
   where coalesce(status, '') <> 'Cancelled'
   group by deal_id
), p as (
  select ms.deal_id, round(sum(bp.amount), 2) as paid
    from billing_payments bp
    join billing_milestones ms on ms.id = bp.milestone_id
   where coalesce(ms.status, '') <> 'Cancelled'
     and not coalesce(bp.bounced, false)
   group by ms.deal_id
)
select d.ce_no, d.client, d.invoiced, coalesce(m.inv, 0) as should_be_invoiced,
       d.amount_paid, coalesce(p.paid, 0) as should_be_paid, d.payment_status
  from deals d
  join (select distinct deal_id from billing_milestones) x on x.deal_id = d.id
  left join m on m.deal_id = d.id
  left join p on p.deal_id = d.id
 where abs(coalesce(d.invoiced, 0) - coalesce(m.inv, 0)) >= 0.005
    or abs(coalesce(d.amount_paid, 0) - coalesce(p.paid, 0)) >= 0.005
 order by d.ce_no;
