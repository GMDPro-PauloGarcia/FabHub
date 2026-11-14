-- ============================================================================
-- Migration 20261115010000 — billing deduction requests: commission and
-- self-approval safeguards
--
-- NOT YET APPLIED. Apply (Supabase MCP apply_migration, on a release day)
-- BEFORE merging the app change that lets Jessica / Jerwin request deductions.
--
-- On top of 20261022010000_billing_deductions_request_approve.sql (live since
-- 2026-10-22). That migration lets jessica (SalesOpsAdmin) and jerwin
-- (FinanceAssistant) call record_billing_deduction, saved as 'Pending' until a
-- Manager approves. Two gaps are closed here:
--
--   1. Sales commission safeguard (CLAUDE.md, "Sales commission safeguards"):
--      a non-Manager may not request a deduction on a milestone whose deal
--      lists them as Sales Owner. Jessica is also an Account Executive. Same
--      test as the billing_payments rule (is_own_sales_deal_milestone,
--      migration 20261026063330: JWT `name` claim or user_profiles.name vs
--      deals.sales_owner).
--   2. Nobody approves a request they entered: approve_billing_deduction
--      refuses when recorded_by is the caller. (Today a requester is never a
--      Manager, so this only bites if a requester later becomes one.)
--
-- Everything else in both functions is unchanged from the live definitions
-- (checked byte-for-byte against production on 2026-11-14).
--
-- Mirrors canRecordDeduction / ownsDealCommission (src/core.js) and the
-- Deductions block in BillingView (src/App.jsx). Keep them in sync.
-- Idempotent: create or replace only, no DROP.
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
  v_mgr   boolean := public.is_mgr();
  v_user  text := coalesce(nullif(public.app_username(), ''), 'unknown');
  v_rt    text;
  v_wh    boolean;
  v_paid  numeric;
  v_after numeric;
  v_row   public.billing_deductions;
begin
  if not (v_mgr or lower(v_user) = any (array['jessica', 'jerwin'])) then
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
  if not v_mgr and public.is_own_sales_deal_milestone(m.id) then
    raise exception 'You are the Sales Owner of this deal, so a deduction on it must be entered by a Manager.' using errcode = '42501';
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

  if v_mgr then
    update public.billing_milestones set
      amount = v_after,
      status = case when v_paid > 0 and v_paid >= public.billing_net_receivable(v_after, v_rt, v_wh) - 0.01 then 'Fully Paid' else status end,
      updated_at = now()
    where id = m.id;
  end if;

  insert into public.billing_deductions
    (milestone_id, deal_id, invoice_no, milestone_name, amount, amount_before, amount_after, reason, recorded_by,
     status, decided_by, decided_at)
  values
    (m.id, m.deal_id, m.invoice_no, m.name, round(p_amount, 2), coalesce(m.amount, 0), v_after, btrim(p_reason), v_user,
     case when v_mgr then 'Approved' else 'Pending' end,
     case when v_mgr then v_user end,
     case when v_mgr then now() end)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.record_billing_deduction(uuid, numeric, text) from public, anon;
grant  execute on function public.record_billing_deduction(uuid, numeric, text) to authenticated;

create or replace function public.approve_billing_deduction(p_id uuid)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.billing_deductions;
  m       public.billing_milestones;
  d       public.deals;
  v_rt    text;
  v_wh    boolean;
  v_paid  numeric;
  v_after numeric;
  v_row   public.billing_deductions;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can approve a billing deduction.' using errcode = '42501';
  end if;
  select * into r from public.billing_deductions where id = p_id for update;
  if not found then
    raise exception 'Deduction not found.' using errcode = 'P0002';
  end if;
  if r.status <> 'Pending' then
    raise exception 'This deduction is already %.', lower(r.status) using errcode = 'check_violation';
  end if;
  if lower(btrim(r.recorded_by)) = lower(btrim(coalesce(nullif(public.app_username(), ''), 'unknown'))) then
    raise exception 'You entered this deduction request, so another Manager must approve it.' using errcode = '42501';
  end if;
  select * into m from public.billing_milestones where id = r.milestone_id for update;
  if not found then
    raise exception 'The milestone for this deduction no longer exists — reject it instead.' using errcode = 'P0002';
  end if;
  if m.status = 'Cancelled' then
    raise exception 'This milestone is cancelled — reject the request instead.' using errcode = 'check_violation';
  end if;
  if round(r.amount, 2) > round(coalesce(m.amount, 0), 2) then
    raise exception 'Deduction ₱% is now more than the milestone amount ₱%.', round(r.amount, 2), round(coalesce(m.amount, 0), 2)
      using errcode = 'check_violation';
  end if;

  select * into d from public.deals where id = m.deal_id;
  v_rt := coalesce(nullif(m.receipt_type, ''), nullif(d.receipt_type, ''), 'OR');
  v_wh := coalesce(m.withholding, d.withholding, false);
  select coalesce(sum(amount), 0) into v_paid
    from public.billing_payments where milestone_id = m.id and not coalesce(bounced, false);
  v_after := round(coalesce(m.amount, 0) - r.amount, 2);
  if public.billing_net_receivable(v_after, v_rt, v_wh) < v_paid - 0.01 then
    raise exception 'After this deduction the invoice would be worth ₱% but ₱% has already been paid on it. Reject it, or record a refund first.',
      public.billing_net_receivable(v_after, v_rt, v_wh), round(v_paid, 2) using errcode = 'check_violation';
  end if;

  update public.billing_milestones set
    amount = v_after,
    status = case when v_paid > 0 and v_paid >= public.billing_net_receivable(v_after, v_rt, v_wh) - 0.01 then 'Fully Paid' else status end,
    updated_at = now()
  where id = m.id;

  update public.billing_deductions set
    status = 'Approved', amount_before = coalesce(m.amount, 0), amount_after = v_after,
    decided_by = coalesce(nullif(public.app_username(), ''), 'unknown'), decided_at = now()
  where id = r.id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.approve_billing_deduction(uuid) from public, anon;
grant  execute on function public.approve_billing_deduction(uuid) to authenticated;

-- ── ROLLBACK ──
--   Re-run the record_billing_deduction and approve_billing_deduction
--   definitions from 20261022010000_billing_deductions_request_approve.sql
--   (create or replace; no DROP needed). No data changes to undo: this
--   migration only replaces two function bodies.
