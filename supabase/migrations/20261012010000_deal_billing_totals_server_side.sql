-- ============================================================================
-- Migration 20261012a — the database keeps each deal's billing totals
--
-- Problem: deals.invoiced, deals.amount_paid and deals.payment_status were only
-- ever written by the browser after a milestone/payment change. Finance roles
-- may write billing_milestones / billing_payments but NOT deals (deals_upd), so
-- for every payment Finance recorded the deal totals silently stayed stale
-- (14 deals, ₱5.67M collected but not on the deal, found 2026-10-09).
--
-- Fix: after any insert/update/delete on billing_milestones or billing_payments,
-- recompute the owning deal's totals here, whoever made the change. Same rules
-- as the app (src/App.jsx: dealNetDue / updateMilestone / logBillingPayment):
--   invoiced       = Σ milestone.amount            (status <> 'Cancelled')
--   amount_paid    = Σ payment.amount, not bounced, on non-cancelled milestones
--                    (cash received, i.e. net of EWT)
--   net due        = Σ calcTax(amount, rt, wh).netReceivable over non-cancelled
--                    milestones; rt = milestone ?? deal ?? 'OR',
--                    wh = milestone ?? deal ?? false; falls back to deal.value
--   payment_status = 'Paid' if paid >= net due > 0, 'Deposited' if paid > 0,
--                    else 'Unpaid'
-- Deals with no milestones are never touched (legacy amount_paid stays).
-- A deal update that another guard rejects (deals_reject_placeholder_value on a
-- ₱0-value deal) is skipped with a WARNING — it never blocks the billing write.
--
-- Includes a one-time backfill of every deal that has milestones.
-- Idempotent. No DROP statements: apply_migration waits on a confirmation
-- for DROPs that this session never sees (CLAUDE.md), so triggers use
-- CREATE OR REPLACE TRIGGER (Postgres 14+; production is 17).
-- ============================================================================

create or replace function public.recompute_deal_billing_totals(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d        record;
  v_inv    numeric;
  v_net    numeric;
  v_paid   numeric;
  v_ref    numeric;
  v_status text;
begin
  if p_deal_id is null then return; end if;
  select id, value, receipt_type, withholding, invoiced, amount_paid, payment_status
    into d from public.deals where id = p_deal_id;
  if not found then return; end if;
  if not exists (select 1 from public.billing_milestones where deal_id = p_deal_id) then
    -- No schedule left (e.g. billing deleted): totals are zero, as the app does.
    v_inv := 0; v_net := 0; v_paid := 0;
  else
    select coalesce(sum(m.amount), 0),
           coalesce(sum(
             round(round(coalesce(m.amount,0),2)
                   + case when coalesce(m.receipt_type, d.receipt_type, 'OR') = 'OR'
                          then round(round(coalesce(m.amount,0),2) * 0.12, 2) else 0 end, 2)
             - case when coalesce(m.receipt_type, d.receipt_type, 'OR') = 'OR'
                     and coalesce(m.withholding, d.withholding, false)
                    then round(round(coalesce(m.amount,0),2) * 0.02, 2) else 0 end
           ), 0)
      into v_inv, v_net
      from public.billing_milestones m
     where m.deal_id = p_deal_id and coalesce(m.status, '') <> 'Cancelled';

    select coalesce(sum(p.amount), 0) into v_paid
      from public.billing_payments p
      join public.billing_milestones m on m.id = p.milestone_id
     where m.deal_id = p_deal_id
       and coalesce(m.status, '') <> 'Cancelled'
       and not coalesce(p.bounced, false);
  end if;

  -- Centavos: payment amounts carry float noise (65618.5599999 for 65618.56),
  -- which would wrongly read "not fully paid".
  v_inv  := round(v_inv, 2);
  v_net  := round(v_net, 2);
  v_paid := round(v_paid, 2);
  v_ref := case when v_net <> 0 then v_net else coalesce(d.value, 0) end;
  v_status := case when v_paid >= v_ref and v_ref > 0 then 'Paid'
                   when v_paid > 0 then 'Deposited'
                   else 'Unpaid' end;

  if abs(coalesce(d.invoiced, 0) - v_inv) >= 0.005
     or abs(coalesce(d.amount_paid, 0) - v_paid) >= 0.005
     or d.payment_status is distinct from v_status then
    begin
      update public.deals
         set invoiced = v_inv, amount_paid = v_paid, payment_status = v_status, updated_at = now()
       where id = p_deal_id;
    exception when others then
      raise warning 'Billing totals for deal % not updated: %', p_deal_id, sqlerrm;
    end;
  end if;
end
$fn$;
revoke execute on function public.recompute_deal_billing_totals(uuid) from public, anon, authenticated;

create or replace function public.billing_totals_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_deal uuid;
  old_deal uuid;
begin
  if tg_table_name = 'billing_milestones' then
    new_deal := case when tg_op <> 'DELETE' then new.deal_id end;
    old_deal := case when tg_op <> 'INSERT' then old.deal_id end;
  else
    if tg_op <> 'DELETE' then
      select deal_id into new_deal from public.billing_milestones where id = new.milestone_id;
    end if;
    if tg_op <> 'INSERT' then
      select deal_id into old_deal from public.billing_milestones where id = old.milestone_id;
    end if;
  end if;
  perform public.recompute_deal_billing_totals(new_deal);
  if old_deal is distinct from new_deal then
    perform public.recompute_deal_billing_totals(old_deal);
  end if;
  return null;
end
$fn$;
revoke execute on function public.billing_totals_sync() from public, anon, authenticated;

create or replace trigger trg_billing_totals_sync after insert or update or delete on public.billing_milestones
  for each row execute function public.billing_totals_sync();

create or replace trigger trg_billing_totals_sync after insert or update or delete on public.billing_payments
  for each row execute function public.billing_totals_sync();

-- One-time backfill: every deal that has billing milestones.
select public.recompute_deal_billing_totals(id)
  from public.deals d
 where exists (select 1 from public.billing_milestones m where m.deal_id = d.id);

-- ROLLBACK
-- drop trigger if exists trg_billing_totals_sync on public.billing_milestones;
-- drop trigger if exists trg_billing_totals_sync on public.billing_payments;
-- drop function if exists public.billing_totals_sync();
-- drop function if exists public.recompute_deal_billing_totals(uuid);
-- (The backfilled totals are left as computed; the previous values are listed
--  in the PR for the 2026-10-12 run if a revert is ever needed.)
