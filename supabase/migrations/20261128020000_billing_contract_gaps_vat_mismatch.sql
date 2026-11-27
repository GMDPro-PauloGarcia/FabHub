-- Billing ≠ Contract: also catch a receipt-type (VAT / non-VAT) mismatch.
--
-- Until now billing_contract_gaps() compared VAT-exclusive amounts only: the
-- non-cancelled milestones' amount vs deals.value. A deal set to VAT receipts
-- (OR) whose milestones are non-VAT (AR) passes that check while the client is
-- billed 12% less than the contract (Amen Jewelry CE-2026-1158 on 2026-11-27:
-- contract ₱896,000 incl. VAT, milestones ₱800,000 non-VAT). The Billing list
-- flags it since PR #495 (vatMismatch in BillingView); this makes the daily
-- billing_health_check() Telegram flag it too, so screen and Telegram agree.
--
-- Same rule as the app:
--   contract (VAT-inc) = value x 1.12 when the deal's receipt type is OR (null = OR)
--   billed   (VAT-inc) = sum(amount x 1.12 when the milestone's receipt type,
--                        else the deal's, is OR)
--   flagged when the VAT-ex schedule is within ₱1 of the contract but the
--   VAT-inc amounts differ by more than ₱1 (amount gaps are already listed).
-- A VAT row's contract / sched / gap are VAT-inclusive and its client text says
-- so, so billing_health_alert() prints it unchanged. Rows carry kind
-- 'amount' or 'vat'. Only this function changes; billing_health_check() and
-- billing_health_alert() are untouched.

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
                                      then 1.12 else 1 end), 2) as sched_inc
      from public.billing_milestones bm
      join public.deals d on d.id = bm.deal_id
     where coalesce(bm.status, '') <> 'Cancelled'
     group by bm.deal_id
  ), base as (
    select d.ce_no, d.client, round(coalesce(d.value, 0), 2) as contract, m.sched,
           round(coalesce(d.value, 0) * case when coalesce(nullif(d.receipt_type, ''), 'OR') = 'OR' then 1.12 else 1 end, 2) as contract_inc,
           m.sched_inc
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
       and contract > 0
       and abs(sched_inc - contract_inc) > 1
  )
  select jsonb_build_object('count', count(*),
           'rows', coalesce(jsonb_agg(to_jsonb(g) order by abs(g.gap) desc), '[]'::jsonb))
    from g;
$$;
revoke execute on function public.billing_contract_gaps() from public, anon, authenticated;

-- ROLLBACK (restores the VAT-ex-only check from 20261124040000_contract_billing_link.sql):
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
