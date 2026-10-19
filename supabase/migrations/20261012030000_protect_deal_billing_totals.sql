-- ============================================================================
-- Migration 20261012c — only the billing recompute may change a billed deal's
-- totals
--
-- After 20261012010000 the database owns deals.invoiced / amount_paid /
-- payment_status for any deal that has billing milestones. But a full-row deal
-- save from the app (toSbDeal / sbSaveDeal) still sends those columns as the
-- browser last saw them, and payQ sets payment_status by hand. A Sales user
-- saving a deal opened before Finance logged a payment would put the stale
-- "₱0 paid" back, and nothing would correct it until the next billing change.
--
-- Guard: BEFORE UPDATE on deals — if the deal has billing milestones and the
-- update is not coming from recompute_deal_billing_totals (which sets
-- fabhub.billing_recompute = 'on' for its own update), keep OLD values for
-- those three columns. Everything else in the update goes through. Deals with
-- no milestones (legacy manual amount_paid) are unaffected.
--
-- Idempotent; no DROP statements (see 20261012010000).
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
      perform set_config('fabhub.billing_recompute', 'on', true);
      update public.deals
         set invoiced = v_inv, amount_paid = v_paid, payment_status = v_status, updated_at = now()
       where id = p_deal_id;
      perform set_config('fabhub.billing_recompute', '', true);
    exception when others then
      perform set_config('fabhub.billing_recompute', '', true);
      raise warning 'Billing totals for deal % not updated: %', p_deal_id, sqlerrm;
    end;
  end if;
end
$fn$;
revoke execute on function public.recompute_deal_billing_totals(uuid) from public, anon, authenticated;

create or replace function public.deals_protect_billing_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(current_setting('fabhub.billing_recompute', true), '') = 'on' then
    return new;
  end if;
  if (new.invoiced is distinct from old.invoiced
      or new.amount_paid is distinct from old.amount_paid
      or new.payment_status is distinct from old.payment_status)
     and exists (select 1 from public.billing_milestones where deal_id = old.id) then
    new.invoiced       := old.invoiced;
    new.amount_paid    := old.amount_paid;
    new.payment_status := old.payment_status;
  end if;
  return new;
end
$fn$;
revoke execute on function public.deals_protect_billing_totals() from public, anon, authenticated;

create or replace trigger trg_deals_protect_billing_totals before update on public.deals
  for each row execute function public.deals_protect_billing_totals();

-- ROLLBACK
-- drop trigger if exists trg_deals_protect_billing_totals on public.deals;
-- drop function if exists public.deals_protect_billing_totals();
-- (then re-apply 20261012010000's recompute_deal_billing_totals; the set_config
--  lines are harmless without the guard)
