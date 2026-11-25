-- ============================================================================
-- Migration 20261125010000 — "Partially Paid" / "Fully Paid" follow the
-- recorded payments, never a hand-picked status
--
-- Why (2026-11-25): billing_milestones.status was a free field. Anyone who can
-- edit Billing (Manager, Finance, FinanceAssistant, SalesOpsAdmin) could pick
-- "Fully Paid" from the status dropdown with nothing collected. A Fully Paid
-- invoice drops out of isBillingOverdue (src/core.js), the overdue list, the
-- 📞 call order and "Pay several invoices", so the client is never chased.
-- Found that day: 7 milestones marked Fully Paid that the payments don't
-- support (Vogue INV-1472 ₱13,653 short, Yobo INV-2006 ₱5,275, JC Mahusay
-- INV-1875 ₱1,908, Penny Pairs INV-1493 ₱232, plus centavo / ₱0 cases), and
-- 3 Partially Paid + 4 Overdue that are in fact fully paid.
--
-- What:
--   • billing_ms_derived_status(...) — the one rule. Net collectible is the
--     recompute_deal_billing_totals / overpay-guard formula (amount + 12% VAT
--     when OR − 2% EWT when OR and withholding); paid = non-bounced payments
--     (offsets count: they settle the invoice).
--       paid ≥ net − ₱1            → Fully Paid (whatever was asked)
--       0 < paid < net − ₱1        → asked Fully Paid becomes Partially Paid;
--                                    any other asked status is kept
--       paid = 0                   → asked Fully / Partially Paid is refused:
--                                    the previous status if it wasn't a paid
--                                    one, else Sent to Client (Draft on insert)
--     Cancelled, and milestones with a net of ₱0 or less, are left alone.
--     ₱1 tolerance = the overpay guard's, so centavo rounding (Rustan
--     INV-1502, ₱0.31) doesn't hold an invoice at Partially Paid.
--   • trg_billing_ms_paid_status (BEFORE INSERT OR UPDATE on
--     billing_milestones) applies it for everyone, Managers included: a
--     non-cash settlement is an Offset / Credit Note payment, not a status.
--     A refused change is kept silently (stale devices still save) and logged
--     to audit_log (action 'blocked'). Runs after
--     trg_billing_milestone_amount_guard (name order), so it sees the kept
--     amount. Upserts: the INSERT branch returns early when the row exists.
--   • trg_billing_payment_ms_status (AFTER INSERT / DELETE / UPDATE OF
--     amount, bounced, milestone_id on billing_payments) re-derives the
--     milestone's status, so a deleted or bounced payment takes "Fully Paid"
--     away even if the app's own follow-up write is lost. Updates only when
--     the status actually changes.
--   • One-off sync of existing rows, each change in audit_log
--     (action 'status_sync', record_id 'billing-status-sync-20261125').
-- App mirror: msPaidStatus / MANUAL_BILLING_STATUSES / billingStatusOptions
-- (src/core.js), the status dropdowns and logBillingPayment /
-- deleteBillingPayment (src/App.jsx). Keep them in sync.
-- No DROP statements (apply_migration hangs on them — CLAUDE.md).
-- Tested on production 2026-11-25 in a rolled-back transaction: 12 cases
-- (Finance aerwin, Manager paulo); the one-off sync changed 12 invoices.
-- ============================================================================

create or replace function public.billing_ms_derived_status(
  p_id uuid, p_status text, p_prev text, p_amount numeric,
  p_rt text, p_wh boolean, p_deal uuid, p_is_insert boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_rt   text := p_rt;
  v_wh   boolean := p_wh;
  v_amt  numeric := round(coalesce(p_amount, 0), 2);
  v_net  numeric;
  v_paid numeric;
begin
  if coalesce(p_status, '') = 'Cancelled' then
    return p_status;
  end if;
  if v_rt is null or v_wh is null then
    select coalesce(v_rt, d.receipt_type), coalesce(v_wh, d.withholding)
      into v_rt, v_wh
      from public.deals d where d.id = p_deal;
  end if;
  v_rt := coalesce(v_rt, 'OR');
  v_wh := coalesce(v_wh, false);
  v_net := round(v_amt + case when v_rt = 'OR' then round(v_amt * 0.12, 2) else 0 end, 2)
         - case when v_rt = 'OR' and v_wh then round(v_amt * 0.02, 2) else 0 end;
  if v_net <= 0 then
    return p_status;                              -- nothing owed: not this rule's business
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
    from public.billing_payments p
   where p.milestone_id = p_id and not coalesce(p.bounced, false);

  if v_paid >= v_net - 1.00 then
    return 'Fully Paid';
  elsif v_paid > 0 then
    return case when p_status = 'Fully Paid' then 'Partially Paid' else p_status end;
  elsif p_status in ('Fully Paid', 'Partially Paid') then
    return case
      when p_is_insert then 'Draft'
      when p_prev is not null and p_prev not in ('Fully Paid', 'Partially Paid') then p_prev
      else 'Sent to Client' end;
  end if;
  return p_status;
end
$fn$;
revoke execute on function public.billing_ms_derived_status(uuid, text, text, numeric, text, boolean, uuid, boolean) from public, anon, authenticated;

create or replace function public.billing_ms_paid_status_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_new text;
begin
  if tg_op = 'INSERT' and exists (select 1 from public.billing_milestones where id = new.id) then
    return new;                                   -- upsert of an existing row: the UPDATE branch decides
  end if;
  v_new := public.billing_ms_derived_status(
             new.id, new.status, case when tg_op = 'UPDATE' then old.status end,
             new.amount, new.receipt_type, new.withholding, new.deal_id, tg_op = 'INSERT');
  if v_new is distinct from new.status then
    if tg_op = 'UPDATE' and new.status is distinct from old.status
       and coalesce(current_setting('request.jwt.claims', true), '') <> '' then
      insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
      values ('billing_milestones', new.id::text, 'blocked',
              jsonb_build_object('field', 'status', 'asked', new.status, 'kept', v_new,
                                 'invoice_no', new.invoice_no, 'previous', old.status),
              'Payment status follows the recorded payments; log a payment (or an offset) instead',
              public.app_username(), now());
    end if;
    new.status := v_new;
  end if;
  return new;
end
$fn$;
revoke execute on function public.billing_ms_paid_status_guard() from public, anon, authenticated;

create or replace function public.billing_payment_ms_status_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[
             case when tg_op <> 'INSERT' then old.milestone_id end,
             case when tg_op <> 'DELETE' then new.milestone_id end], null);
  update public.billing_milestones m
     set status = public.billing_ms_derived_status(m.id, m.status, m.status, m.amount,
                                                  m.receipt_type, m.withholding, m.deal_id),
         updated_at = now()
   where m.id = any(v_ids)
     and m.status is distinct from public.billing_ms_derived_status(m.id, m.status, m.status, m.amount,
                                                                   m.receipt_type, m.withholding, m.deal_id);
  return null;
end
$fn$;
revoke execute on function public.billing_payment_ms_status_sync() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_ms_paid_status'
                    and tgrelid = 'public.billing_milestones'::regclass) then
    create trigger trg_billing_ms_paid_status
      before insert or update on public.billing_milestones
      for each row execute function public.billing_ms_paid_status_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_payment_ms_status'
                    and tgrelid = 'public.billing_payments'::regclass) then
    create trigger trg_billing_payment_ms_status
      after insert or delete or update of amount, bounced, milestone_id on public.billing_payments
      for each row execute function public.billing_payment_ms_status_sync();
  end if;
end $$;

-- One-off: bring existing rows in line, each change logged.
with fix as (
  select m.id, m.invoice_no, m.status as old_status,
         public.billing_ms_derived_status(m.id, m.status, m.status, m.amount,
                                          m.receipt_type, m.withholding, m.deal_id) as new_status
    from public.billing_milestones m
), changed as (
  select * from fix where new_status is distinct from old_status
), logged as (
  insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  select 'billing_milestones', 'billing-status-sync-20261125', 'status_sync',
         jsonb_build_object('milestone_id', c.id, 'invoice_no', c.invoice_no,
                            'from', c.old_status, 'to', c.new_status),
         'Migration 20261125010000: status set from the recorded payments',
         'system', now()
    from changed c
  returning 1
)
update public.billing_milestones m
   set status = c.new_status, updated_at = now()
  from changed c
 where m.id = c.id;

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- drop trigger if exists trg_billing_ms_paid_status on public.billing_milestones;
-- drop trigger if exists trg_billing_payment_ms_status on public.billing_payments;
-- drop function if exists public.billing_payment_ms_status_sync();
-- drop function if exists public.billing_ms_paid_status_guard();
-- drop function if exists public.billing_ms_derived_status(uuid, text, text, numeric, text, boolean, uuid, boolean);
-- Statuses changed by the one-off sync are in audit_log
-- (record_id = 'billing-status-sync-20261125', snapshot->>'from').
