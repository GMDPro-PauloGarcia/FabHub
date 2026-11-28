-- Billing ≠ Contract: a VAT mismatch needs a real receipt-type difference.
--
-- 20261128020000 flagged a VAT mismatch whenever the VAT-ex schedule was within
-- ₱1 of the contract but the VAT-inc amounts differed by more than ₱1. A ~₱1
-- rounding gap grows past ₱1 once multiplied by 1.12, so three deals whose
-- milestones and deal are both VAT (OR) were flagged by mistake on 2026-11-28:
-- SM Signature SHV Portable Booth CE-2026-1141 (₱1.12), Wetzel Pretzel Mobile
-- Cart CE-2026-1159 (−₱1.12), Treasure by SVT CE-2026-072 (−₱1.01).
-- Now a 'vat' row also needs at least one non-cancelled milestone whose receipt
-- type (or the deal's, when blank) differs from the deal's. Same rule as the
-- Billing list (rtDiffers in BillingView). Only this function changes.

create or replace function public.billing_contract_gaps()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with m as (
    select bm.deal_id,
           round(sum(bm.amount), 2) as sched,
           round(sum(bm.amount * case when coalesce(nullif(bm.receipt_type, ''), nullif(d.receipt_type, ''), 'OR') = 'OR'
                                      then 1.12 else 1 end), 2) as sched_inc,
           bool_or(coalesce(nullif(bm.receipt_type, ''), nullif(d.receipt_type, ''), 'OR')
                   <> coalesce(nullif(d.receipt_type, ''), 'OR')) as rt_differs
      from public.billing_milestones bm
      join public.deals d on d.id = bm.deal_id
     where coalesce(bm.status, '') <> 'Cancelled'
     group by bm.deal_id
  ), base as (
    select d.ce_no, d.client, round(coalesce(d.value, 0), 2) as contract, m.sched,
           round(coalesce(d.value, 0) * case when coalesce(nullif(d.receipt_type, ''), 'OR') = 'OR' then 1.12 else 1 end, 2) as contract_inc,
           m.sched_inc, m.rt_differs
      from public.deals d
      join m on m.deal_id = d.id
     where d.stage = any (array['06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
                                '10 · Installation','11 · Punchlist','12 · Close-Out','14 · Completed'])
       and not coalesce(d.standby_po, false)
       and not coalesce(d.is_cost_center, false)
  ), g as (
    select ce_no, client, contract, sched, round(sched - contract, 2) as gap, 'amount'::text as kind
      from base
     where abs(sched - contract) > 1
    union all
    select ce_no,
           coalesce(client, '') || ' — receipt type (VAT / non-VAT) doesn''t match the deal; amounts VAT-inc',
           contract_inc, sched_inc, round(sched_inc - contract_inc, 2), 'vat'
      from base
     where abs(sched - contract) <= 1
       and rt_differs
       and contract > 0
       and abs(sched_inc - contract_inc) > 1
  )
  select jsonb_build_object('count', count(*),
           'rows', coalesce(jsonb_agg(to_jsonb(g) order by abs(g.gap) desc), '[]'::jsonb))
    from g;
$$;
revoke execute on function public.billing_contract_gaps() from public, anon, authenticated;

-- ROLLBACK: re-run 20261128020000_billing_contract_gaps_vat_mismatch.sql, or for the VAT-ex-only
-- check from 20261124040000 run the block below:
-- create or replace function public.billing_contract_gaps()
-- returns jsonb language sql stable security definer
-- set search_path = pg_catalog, public as $$
--   with m as (
--     select deal_id, round(sum(amount), 2) as sched
--       from public.billing_milestones
--      where coalesce(status, '') <> 'Cancelled'
--      group by deal_id
--   ), g as (
--     select d.ce_no, d.client, round(coalesce(d.value, 0), 2) as contract, m.sched,
--            round(m.sched - coalesce(d.value, 0), 2) as gap
--       from public.deals d
--       join m on m.deal_id = d.id
--      where d.stage = any (array['06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
--                                 '10 · Installation','11 · Punchlist','12 · Close-Out','14 · Completed'])
--        and not coalesce(d.standby_po, false)
--        and not coalesce(d.is_cost_center, false)
--        and abs(m.sched - coalesce(d.value, 0)) > 1
--   )
--   select jsonb_build_object('count', count(*),
--            'rows', coalesce(jsonb_agg(to_jsonb(g) order by abs(g.gap) desc), '[]'::jsonb))
--     from g;
-- $$;
-- revoke execute on function public.billing_contract_gaps() from public, anon, authenticated;
