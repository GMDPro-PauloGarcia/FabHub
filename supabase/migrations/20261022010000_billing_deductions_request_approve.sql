-- ============================================================================
-- Migration 20261022a — Jessica and Jerwin may REQUEST billing deductions;
-- a Manager approves
--
-- Owner request (Paulo Garcia, 2026-10-22). record_billing_deduction was
-- Manager only. Now:
--   • A Manager's deduction applies at once, as before (status 'Approved').
--   • jessica (SalesOpsAdmin) and jerwin (FinanceAssistant) may call it too, but
--     theirs is saved as status 'Pending': the milestone amount does NOT change.
--     Named users, not whole roles, so a new hire doesn't inherit it.
--   • approve_billing_deduction(id) — Manager only. Re-checks the request against
--     the milestone as it is now (not cancelled, not more than the invoice, not
--     below what has been paid), lowers the amount and marks it 'Approved'.
--   • reject_billing_deduction(id, reason) — Manager only. Marks it 'Rejected';
--     the amount never changed. Nothing is deleted.
--   • reverse_billing_deduction refuses anything that isn't 'Approved'.
--
-- billing_deductions gains status / decided_by / decided_at / decide_note.
-- Existing rows default to 'Approved' (they were all Manager-recorded).
-- recorded_by stays "who entered it"; decided_by is the approving Manager.
-- For a Pending row amount_before/after are a preview, rewritten on approval.
--
-- Mirrors DEDUCTION_USERS / canRecordDeduction in src/core.js and DeductionForm /
-- the Deductions list in BillingView (src/App.jsx) — keep in sync.
-- Idempotent (if not exists / create or replace).
-- ============================================================================

alter table public.billing_deductions
  add column if not exists status      text not null default 'Approved',
  add column if not exists decided_by  text,
  add column if not exists decided_at  timestamptz,
  add column if not exists decide_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_deductions_status_chk'
                 and conrelid = 'public.billing_deductions'::regclass) then
    alter table public.billing_deductions
      add constraint billing_deductions_status_chk check (status in ('Pending', 'Approved', 'Rejected'));
  end if;
end $$;

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

create or replace function public.reject_billing_deduction(p_id uuid, p_reason text)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  r     public.billing_deductions;
  v_row public.billing_deductions;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can reject a billing deduction.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the reason for rejecting the deduction.' using errcode = 'check_violation';
  end if;
  select * into r from public.billing_deductions where id = p_id for update;
  if not found then
    raise exception 'Deduction not found.' using errcode = 'P0002';
  end if;
  if r.status <> 'Pending' then
    raise exception 'This deduction is already %.', lower(r.status) using errcode = 'check_violation';
  end if;
  update public.billing_deductions set
    status = 'Rejected', decide_note = btrim(p_reason),
    decided_by = coalesce(nullif(public.app_username(), ''), 'unknown'), decided_at = now()
  where id = r.id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.reject_billing_deduction(uuid, text) from public, anon;
grant  execute on function public.reject_billing_deduction(uuid, text) to authenticated;

create or replace function public.reverse_billing_deduction(p_id uuid, p_reason text)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  r     public.billing_deductions;
  m     public.billing_milestones;
  v_row public.billing_deductions;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can reverse a billing deduction.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the reason for reversing the deduction.' using errcode = 'check_violation';
  end if;
  select * into r from public.billing_deductions where id = p_id for update;
  if not found then
    raise exception 'Deduction not found.' using errcode = 'P0002';
  end if;
  if r.reversed_at is not null then
    raise exception 'This deduction was already reversed.' using errcode = 'check_violation';
  end if;
  if r.status <> 'Approved' then
    raise exception 'Only an approved deduction can be reversed (this one is %).', lower(r.status) using errcode = 'check_violation';
  end if;
  select * into m from public.billing_milestones where id = r.milestone_id for update;
  if not found then
    raise exception 'The milestone for this deduction no longer exists.' using errcode = 'P0002';
  end if;
  if m.status = 'Cancelled' then
    raise exception 'This milestone is cancelled — reverse it before restoring the deduction.' using errcode = 'check_violation';
  end if;

  update public.billing_milestones set
    amount = round(coalesce(amount, 0) + r.amount, 2),
    status = case when status = 'Fully Paid' then 'Partially Paid' else status end,
    updated_at = now()
  where id = m.id;

  update public.billing_deductions set
    reversed_at = now(), reversed_by = coalesce(nullif(public.app_username(), ''), 'unknown'), reverse_reason = btrim(p_reason)
  where id = r.id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.reverse_billing_deduction(uuid, text) from public, anon;
grant  execute on function public.reverse_billing_deduction(uuid, text) to authenticated;

-- ── ROLLBACK ──
--   Re-run record_billing_deduction and reverse_billing_deduction from
--   20261020060000_billing_deductions.sql (Manager-only, no status). Then:
--   revoke execute on function public.approve_billing_deduction(uuid) from authenticated;
--   revoke execute on function public.reject_billing_deduction(uuid, text) from authenticated;
--   Leave the new columns: rows marked Pending/Rejected never changed an amount.
--   Remove DEDUCTION_USERS from src/core.js.
