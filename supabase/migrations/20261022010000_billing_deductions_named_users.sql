-- ============================================================================
-- Migration 20261022a — Jessica and Jerwin may record billing deductions
--
-- Owner request (Paulo Garcia, 2026-10-22). record_billing_deduction was
-- Manager only. It now also accepts the named users jessica (SalesOpsAdmin,
-- Operations & Sales Admin) and jerwin (FinanceAssistant). Named users, not
-- whole roles, so a new Finance Assistant or Sales Ops hire doesn't inherit it.
--
-- Unchanged: reason required, never more than the invoice, never below what has
-- been paid, the row in billing_deductions stamped with the server-side
-- username, and reverse_billing_deduction stays Manager only, so a Manager can
-- always undo a deduction someone else recorded.
--
-- Mirrors DEDUCTION_USERS / canRecordDeduction in src/core.js — keep in sync.
-- Idempotent (create or replace).
-- ============================================================================

create or replace function public.record_billing_deduction(p_milestone_id uuid, p_amount numeric, p_reason text)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  m       public.billing_milestones;
  d       public.deals;
  v_rt    text;
  v_wh    boolean;
  v_paid  numeric;
  v_after numeric;
  v_row   public.billing_deductions;
begin
  if not (public.is_mgr() or lower(public.app_username()) = any (array['jessica', 'jerwin'])) then
    raise exception 'Only a Manager, Jessica or Jerwin can record a billing deduction.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a deduction amount greater than zero.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the reason for the deduction.' using errcode = 'check_violation';
  end if;

  select * into m from public.billing_milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'Billing milestone not found.' using errcode = 'P0002';
  end if;
  if m.status = 'Cancelled' then
    raise exception 'This milestone is cancelled — nothing to deduct from.' using errcode = 'check_violation';
  end if;
  if round(p_amount, 2) > round(coalesce(m.amount, 0), 2) then
    raise exception 'Deduction ₱% is more than the milestone amount ₱%.', round(p_amount, 2), round(coalesce(m.amount, 0), 2)
      using errcode = 'check_violation';
  end if;

  select * into d from public.deals where id = m.deal_id;
  v_rt := coalesce(nullif(m.receipt_type, ''), nullif(d.receipt_type, ''), 'OR');
  v_wh := coalesce(m.withholding, d.withholding, false);
  select coalesce(sum(amount), 0) into v_paid
    from public.billing_payments where milestone_id = m.id and not coalesce(bounced, false);
  v_after := round(coalesce(m.amount, 0) - p_amount, 2);
  if public.billing_net_receivable(v_after, v_rt, v_wh) < v_paid - 0.01 then
    raise exception 'After this deduction the invoice would be worth ₱% but ₱% has already been paid on it. Record a refund or reduce the deduction.',
      public.billing_net_receivable(v_after, v_rt, v_wh), round(v_paid, 2) using errcode = 'check_violation';
  end if;

  update public.billing_milestones set
    amount = v_after,
    status = case when v_paid > 0 and v_paid >= public.billing_net_receivable(v_after, v_rt, v_wh) - 0.01 then 'Fully Paid' else status end,
    updated_at = now()
  where id = m.id;

  insert into public.billing_deductions
    (milestone_id, deal_id, invoice_no, milestone_name, amount, amount_before, amount_after, reason, recorded_by)
  values
    (m.id, m.deal_id, m.invoice_no, m.name, round(p_amount, 2), coalesce(m.amount, 0), v_after, btrim(p_reason),
     coalesce(nullif(public.app_username(), ''), 'unknown'))
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.record_billing_deduction(uuid, numeric, text) from public, anon;
grant  execute on function public.record_billing_deduction(uuid, numeric, text) to authenticated;

-- ROLLBACK: re-run the record_billing_deduction definition from
-- 20261020060000_billing_deductions.sql (Manager-only check:
-- `if not public.is_mgr() then raise exception 'Only a Manager can record a
-- billing deduction.' ...`), and remove DEDUCTION_USERS from src/core.js.
