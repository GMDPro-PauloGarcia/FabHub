-- ============================================================================
-- Migration 20261124030000 — a client payment can't exceed what the invoice is
-- owed, and the same cheque can't be recorded twice on one invoice
--
-- Why (2026-11-24): nothing in the database stopped it. Diageo CE-2026-1163 /
-- -1164 were each recorded twice (₱2,363,800 recorded vs ₱1,166,000
-- collectible), Hiessence INV-1883 / INV-1920 exactly doubled; 17 invoices were
-- over-collected by ₱1,377,350 in all, inflating Collected, AR and the
-- commission base. The app's balance check only sees its own (possibly stale)
-- copy. Supplier payments have had the same block since 20261102113419.
--
-- What: trg_billing_payment_overpay_guard (BEFORE INSERT OR UPDATE on
-- billing_payments) refuses, for anyone but a Manager:
--   • a payment that takes the invoice's non-bounced payments above its net
--     collectible + ₱1 (same formula as recompute_deal_billing_totals: amount
--     + 12% VAT when OR − 2% EWT when OR and withholding);
--   • a second payment on the same invoice with the same reference no.
-- A Manager's overpayment / duplicate goes through and is logged to audit_log
-- (action 'overpayment_override').
-- Never blocks: a bounced payment, a payment on a Cancelled invoice (nothing is
-- owed, recompute skips it), an edit that doesn't raise the amount (the 17
-- existing over-collected invoices can still be corrected, bounced or
-- deleted), and server jobs (no login token).
-- Upserts: Postgres runs BEFORE INSERT even when the upsert updates an existing
-- row, so the INSERT branch returns early when the row exists and the UPDATE
-- branch decides (CLAUDE.md, subcon guards).
-- App mirror: submitPay / saveMultiPay / the inline payment edit check the
-- balance first (BillingView, src/App.jsx); the refusal text reaches the user
-- through logBillingPayment's "Payment NOT saved" toast. Keep them in sync.
-- No DROP statements (apply_migration hangs on them — CLAUDE.md).
-- ============================================================================

create or replace function public.billing_payment_overpay_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_ms      record;
  v_net     numeric;
  v_others  numeric;
  v_old_amt numeric;
  v_ref     text := upper(regexp_replace(coalesce(new.ref_no, ''), '\s', '', 'g'));
  v_dup     boolean := false;
  v_over    boolean := false;
  f2        text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;                                   -- server jobs / migrations
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.billing_payments where id = new.id) then
    return new;                                   -- upsert of an existing row: the UPDATE branch decides
  end if;
  if coalesce(new.bounced, false) or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  select m.id, m.invoice_no, m.name, m.status, m.amount,
         coalesce(m.receipt_type, d.receipt_type, 'OR') as rt,
         coalesce(m.withholding, d.withholding, false) as wh
    into v_ms
    from public.billing_milestones m
    left join public.deals d on d.id = m.deal_id
   where m.id = new.milestone_id;
  if not found or coalesce(v_ms.status, '') = 'Cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_amt := case when coalesce(old.bounced, false) or old.milestone_id is distinct from new.milestone_id
                      then 0 else coalesce(old.amount, 0) end;
    if new.amount <= v_old_amt + 0.005 and new.ref_no is not distinct from old.ref_no then
      return new;                                 -- not raising it: corrections always allowed
    end if;
  end if;

  v_net := round(round(coalesce(v_ms.amount, 0), 2)
             + case when v_ms.rt = 'OR' then round(round(coalesce(v_ms.amount, 0), 2) * 0.12, 2) else 0 end, 2)
         - case when v_ms.rt = 'OR' and v_ms.wh then round(round(coalesce(v_ms.amount, 0), 2) * 0.02, 2) else 0 end;

  select coalesce(sum(p.amount), 0),
         coalesce(bool_or(v_ref <> '' and upper(regexp_replace(coalesce(p.ref_no, ''), '\s', '', 'g')) = v_ref), false)
    into v_others, v_dup
    from public.billing_payments p
   where p.milestone_id = new.milestone_id
     and p.id is distinct from new.id
     and not coalesce(p.bounced, false);

  v_over := v_others + new.amount > v_net + 1.00;
  if not v_over and not v_dup then
    return new;
  end if;

  if public.is_mgr() then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('billing_payments', new.id::text, 'overpayment_override',
            jsonb_build_object('invoice_no', v_ms.invoice_no, 'net_collectible', v_net, 'other_payments', v_others,
                               'amount', new.amount, 'ref_no', new.ref_no, 'over', v_over, 'duplicate_ref', v_dup),
            'Manager recorded a payment above the invoice balance or with a reference already on it',
            public.app_username(), now());
    return new;
  end if;

  f2 := '₱' || to_char(v_net, 'FM999,999,999,990.00');
  if v_dup then
    raise exception 'Payment not saved: reference % is already recorded on %. If the client really paid this invoice twice with the same cheque, ask a Manager to record it.',
      new.ref_no, coalesce(v_ms.invoice_no, v_ms.name, 'this invoice')
      using errcode = 'P0001';
  end if;
  raise exception 'Payment not saved: % is owed % (net of VAT/EWT) and % is already recorded, so ₱% would be over-collected. Check whether this payment is already recorded, the invoice''s receipt type (OR/AR) or EWT. A Manager can record a real overpayment.',
    coalesce(v_ms.invoice_no, v_ms.name, 'This invoice'), f2,
    '₱' || to_char(v_others, 'FM999,999,999,990.00'),
    to_char(v_others + new.amount - v_net, 'FM999,999,999,990.00')
    using errcode = 'P0001';
end
$fn$;
revoke execute on function public.billing_payment_overpay_guard() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_payment_overpay_guard'
                    and tgrelid = 'public.billing_payments'::regclass) then
    create trigger trg_billing_payment_overpay_guard
      before insert or update on public.billing_payments
      for each row execute function public.billing_payment_overpay_guard();
  end if;
end $$;

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- drop trigger if exists trg_billing_payment_overpay_guard on public.billing_payments;
-- drop function if exists public.billing_payment_overpay_guard();
