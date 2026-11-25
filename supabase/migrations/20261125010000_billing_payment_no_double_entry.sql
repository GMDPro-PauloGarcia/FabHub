-- ============================================================================
-- Migration 20261125010000 — no second copy of a client payment
--
-- Why (2026-11-25): the guard of 20261124030000 refuses a second payment on an
-- invoice only when its reference is the same. The double entries found that
-- day all had one copy with no reference: Diageo INV-1857 (₱593,600) and
-- Hiessence INV-1883 / INV-1920 (Jessica, no reference, 9 Nov; Jerwin, bank
-- reference, 10 Nov), Permatology INV-1428 (₱17,136 twice on 10 Jul, no
-- reference). 62 of 66 bank-transfer collections in the 30 days before had no
-- reference at all.
--
-- What: billing_payment_overpay_guard() (same trigger) now also
--   • refuses a non-cash payment (any method but Cash / Offset, bank not
--     'cash') with no reference of 4+ letters or digits: on insert, and on an
--     edit that changes the reference, method or bank. Everyone, Managers too.
--     Older payments without one stay editable otherwise;
--   • refuses a payment on an invoice that already has a non-bounced payment of
--     the same amount within 30 days (date received) where either of the two
--     has no reference. A Manager may record it with the reason (10+ chars) in
--     the payment's note: audit_log action 'duplicate_override'.
-- Everything else is unchanged from 20261124030000 (overpayment, same
-- reference, server jobs, bounced, Cancelled invoices, upsert INSERT branch,
-- corrections that don't raise the amount).
-- App mirror: paymentNeedsRef / paymentRefOk / nearDuplicatePayment
-- (src/core.js), submitPay / saveMultiPay / the inline payment edit
-- (BillingView, src/App.jsx), MultiInvoicePay. Keep them in sync.
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
  v_near    record;                              -- same invoice + amount within 30 days, a reference missing
  v_day     date := coalesce(new.date, new.value_date, current_date);
  v_needref boolean := coalesce(new.payment_method, '') not in ('Cash', 'Offset / Credit Note')
                       and coalesce(new.bank, '') <> 'cash';
  v_refok   boolean := length(regexp_replace(coalesce(new.ref_no, ''), '[^A-Za-z0-9]', '', 'g')) >= 4;
  v_touch   boolean;
  v_check_near boolean;
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

  -- Reference required (2026-11-25): every non-cash collection carries the
  -- cheque no. / bank transfer reference (4+ letters or digits). New payments,
  -- and edits that blank the reference or change the method; older payments
  -- without one stay editable otherwise. Applies to Managers too.
  if tg_op = 'UPDATE' then
    v_touch := old.ref_no is distinct from new.ref_no
               or old.payment_method is distinct from new.payment_method
               or old.bank is distinct from new.bank;
    -- The duplicate rule looks at what makes it a payment: an edit that only
    -- adds or fixes a reference / note must stay possible (that's the cleanup).
    v_check_near := old.amount is distinct from new.amount
                    or old.milestone_id is distinct from new.milestone_id
                    or old.date is distinct from new.date
                    or coalesce(old.bounced, false);
  else
    v_touch := true;
    v_check_near := true;
  end if;
  if v_needref and not v_refok and v_touch then
    raise exception 'Payment not saved: enter the cheque no. or bank transfer reference (at least 4 letters or digits). Two people recording the same deposit is caught by its reference; without one it isn''t.'
      using errcode = 'P0001';
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

  -- Same invoice, same amount, within 30 days, and one of the two has no
  -- reference: the pattern of every double entry found on 2026-11-25 (one person
  -- records it with no reference, another the next day with the bank's).
  select p.id, p.date, p.ref_no, p.recorded_by
    into v_near
    from public.billing_payments p
   where v_check_near
     and p.milestone_id = new.milestone_id
     and p.id is distinct from new.id
     and not coalesce(p.bounced, false)
     and abs(coalesce(p.amount, 0) - new.amount) < 0.005
     and abs(coalesce(p.date, p.value_date, p.created_at::date) - v_day) <= 30
     and (not v_refok
          or length(regexp_replace(coalesce(p.ref_no, ''), '[^A-Za-z0-9]', '', 'g')) < 4)
   order by abs(coalesce(p.date, p.value_date, p.created_at::date) - v_day)
   limit 1;

  v_over := v_others + new.amount > v_net + 1.00;
  if not v_over and not v_dup and v_near.id is null then
    return new;
  end if;

  if v_near.id is not null and not v_over and not v_dup then
    -- Only the near-duplicate rule: a Manager may record it with a reason
    -- (10+ characters in the payment's note), logged as a duplicate override.
    if public.is_mgr() and length(trim(coalesce(new.note, ''))) >= 10 then
      insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
      values ('billing_payments', new.id::text, 'duplicate_override',
              jsonb_build_object('invoice_no', v_ms.invoice_no, 'amount', new.amount, 'ref_no', new.ref_no,
                                 'date', new.date, 'similar_payment', v_near.id, 'similar_date', v_near.date,
                                 'similar_ref', v_near.ref_no, 'similar_recorded_by', v_near.recorded_by),
              new.note, public.app_username(), now());
      return new;
    end if;
    raise exception 'Payment not saved: % already has a payment of ₱% on % (ref %, recorded by %). This looks like the same payment recorded twice. If the client really paid this amount twice, a Manager records it with the reason in the note.',
      coalesce(v_ms.invoice_no, v_ms.name, 'This invoice'),
      to_char(new.amount, 'FM999,999,999,990.00'),
      coalesce(v_near.date::text, '—'),
      coalesce(nullif(trim(v_near.ref_no), ''), 'none'),
      coalesce(nullif(trim(v_near.recorded_by), ''), 'unknown')
      using errcode = 'P0001';
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


-- ROLLBACK: re-run the function body of 20261124030000_billing_payment_overpay_guard.sql
-- (create or replace; the trigger is unchanged).
