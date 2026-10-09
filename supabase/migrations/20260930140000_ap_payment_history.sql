-- ── AP Phase 1: payment history, subcontractor retention, server AP/PRV numbers ──
-- Why: the finance team keeps an Excel "AP Monitoring & Check Monitoring" sheet
-- beside FabHub because FabHub can only hold ONE payment reference per payable
-- (payables.pay_ref / paid_amount). One check paying 15 bills, a second
-- payment on the same bill, or a cancelled check could not be recorded, so the
-- sheet invented PO-xxxxA/B/C numbers and counted cancelled checks as paid.
--
-- This migration adds:
--   1. public.payable_payments — one row per payment (or retention release)
--      against a payable. Rows are never deleted or edited: a mistake is
--      Cancelled with a reason, and stays on record.
--   2. Triggers that keep payables.paid_amount / retention_held / status equal to
--      the Active payment rows, so a cancelled check can never count as paid and a
--      stale device can't overwrite the history's totals.
--   3. payables.doc_type ('AP' | 'PRV'), retention_pct, retention_held.
--   4. Server-assigned AP / PRV numbers (AP-2026-0464, PRV-2026-0001) when the
--      app inserts a payable with a blank ap_number. Client-side numbering
--      produced 102 duplicated AP numbers; this stops new ones.
--   5. A one-time carry-over: every payable that already shows a payment gets a
--      matching history row, so no existing payment disappears.
--
-- Money semantics (subcontractor retention):
--   amount           = cash actually paid in this row
--   retention_amount = retention withheld from a progress payment (not paid yet)
--   paid_amount      = SUM(amount) of Active rows            (cash out)
--   retention_held   = SUM(retention_amount) of Active 'Payment' rows
--                      − SUM(amount) of Active 'Retention release' rows
--   balance (app)    = payables.amount − paid_amount  (includes retention held)
--
-- Who can record payments: Manager, Finance, Accounting, FinanceAssistant.
-- Procurement and SalesOpsAdmin keep payables access but can only READ payments.
--
-- Idempotent. See ROLLBACK at the bottom.

-- 1) payables columns ---------------------------------------------------------
alter table public.payables add column if not exists doc_type       text    default 'AP';
alter table public.payables add column if not exists retention_pct  numeric default 0;
alter table public.payables add column if not exists retention_held numeric default 0;
update public.payables set doc_type='AP' where doc_type is null;
update public.payables set retention_held=0 where retention_held is null;
update public.payables set retention_pct=0 where retention_pct is null;
alter table public.payables drop constraint if exists payables_doc_type_chk;
alter table public.payables add constraint payables_doc_type_chk check (doc_type in ('AP','PRV'));

-- 2) payment history table ------------------------------------------------------
create table if not exists public.payable_payments (
  id               text primary key,
  payable_id       text not null references public.payables(id) on delete cascade,
  batch_id         text,                         -- one check / transfer paying several bills
  kind             text not null default 'Payment',
  pay_date         date not null,
  amount           numeric(14,2) not null default 0,
  retention_amount numeric(14,2) not null default 0,
  method           text not null default '',
  bank             text not null default '',
  ref_no           text not null default '',     -- text: keeps leading zeros (00025311)
  cv_id            text,
  note             text not null default '',
  status           text not null default 'Active',
  cancel_reason    text not null default '',
  cancelled_by     text not null default '',
  cancelled_at     timestamptz,
  recorded_by      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pp_kind_chk      check (kind in ('Payment','Retention release')),
  constraint pp_status_chk    check (status in ('Active','Cancelled')),
  constraint pp_amounts_chk   check (amount >= 0 and retention_amount >= 0 and amount + retention_amount > 0),
  constraint pp_release_chk   check (kind <> 'Retention release' or retention_amount = 0),
  constraint pp_cancel_chk    check (status <> 'Cancelled' or length(trim(cancel_reason)) > 0)
);
create index if not exists payable_payments_payable_idx on public.payable_payments(payable_id);
create index if not exists payable_payments_batch_idx   on public.payable_payments(batch_id) where batch_id is not null;
create index if not exists payable_payments_ref_idx     on public.payable_payments(bank, ref_no) where ref_no <> '';

alter table public.payable_payments enable row level security;
grant select, insert, update on public.payable_payments to authenticated;
revoke all on public.payable_payments from anon;

drop policy if exists payable_payments_sel on public.payable_payments;
create policy payable_payments_sel on public.payable_payments for select to authenticated
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
drop policy if exists payable_payments_ins on public.payable_payments;
create policy payable_payments_ins on public.payable_payments for insert to authenticated
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant'));
drop policy if exists payable_payments_upd on public.payable_payments;
create policy payable_payments_upd on public.payable_payments for update to authenticated
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant'))
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant'));
-- No DELETE policy: payments are cancelled, never deleted.

-- 3) guard: approval before payment, immutable money fields ------------------------
create or replace function public.payable_payments_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare v_appr text;
begin
  new.updated_at := now();
  -- Server / migration contexts (no request JWT) are exempt, same as migration 063.
  if coalesce(current_setting('request.jwt.claims', true),'') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select coalesce(nullif(approval_status,''),'Approved') into v_appr
      from public.payables where id = new.payable_id;
    if v_appr is distinct from 'Approved' then
      raise exception 'This payable is not approved — a Manager or the Finance Manager must approve it before any payment can be recorded';
    end if;
    if new.status <> 'Active' then
      raise exception 'A new payment must be Active';
    end if;
    if new.method = 'Check' and trim(new.ref_no) = '' then
      raise exception 'A check payment needs the check number';
    end if;
    new.recorded_by := coalesce(nullif(public.app_username(),''), new.recorded_by);
    return new;
  end if;
  -- UPDATE: the only allowed change is Active -> Cancelled (with a reason).
  if old.status = 'Cancelled' then
    raise exception 'A cancelled payment cannot be changed';
  end if;
  if new.payable_id is distinct from old.payable_id or new.amount is distinct from old.amount
     or new.retention_amount is distinct from old.retention_amount or new.kind is distinct from old.kind
     or new.pay_date is distinct from old.pay_date or new.method is distinct from old.method
     or new.bank is distinct from old.bank or new.ref_no is distinct from old.ref_no
     or new.batch_id is distinct from old.batch_id then
    raise exception 'A recorded payment cannot be edited — cancel it with a reason and record it again';
  end if;
  if new.status = 'Cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(nullif(public.app_username(),''), new.cancelled_by);
  end if;
  return new;
end
$fn$;
revoke execute on function public.payable_payments_guard() from public, anon, authenticated;

drop trigger if exists trg_payable_payments_guard on public.payable_payments;
create trigger trg_payable_payments_guard
  before insert or update on public.payable_payments
  for each row execute function public.payable_payments_guard();

-- 4) payments are the source of truth for what has been paid -----------------------
-- Several app screens save the whole payable row (payableToSb), including
-- paid_amount / status from the device's local copy. A device with a stale copy
-- could overwrite what the payment history says. So:
--   • after any payment row changes, the payable is recomputed;
--   • before any update to a payable that HAS payment rows, the paid figures in
--     the incoming row are replaced with the computed ones.
-- Payables with no payment rows yet (legacy / manual "already paid") are left alone.
create or replace function public.payable_apply_payment_totals(p public.payables)
returns public.payables
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_cash numeric; v_ret numeric; v_rel numeric; v_last date;
  v_bank text; v_method text; v_ref text;
begin
  if not exists (select 1 from public.payable_payments where payable_id = p.id) then
    return p;
  end if;
  select coalesce(sum(amount),0),
         coalesce(sum(retention_amount) filter (where kind='Payment'),0),
         coalesce(sum(amount) filter (where kind='Retention release'),0),
         max(pay_date)
    into v_cash, v_ret, v_rel, v_last
    from public.payable_payments where payable_id = p.id and status = 'Active';
  select bank, method, ref_no into v_bank, v_method, v_ref
    from public.payable_payments where payable_id = p.id and status = 'Active'
   order by pay_date desc, created_at desc limit 1;
  p.paid_amount    := v_cash;
  p.retention_held := greatest(0, v_ret - v_rel);
  p.status := case
                when p.amount > 0 and v_cash >= p.amount - 0.005 then 'Paid'
                when v_cash > 0 then 'Partial'
                when p.status = 'Check Issued' then 'Check Issued'
                else 'Unpaid' end;
  p.paid_date  := case when p.amount > 0 and v_cash >= p.amount - 0.005 then v_last else null end;
  p.pay_bank   := coalesce(v_bank, '');
  p.pay_method := coalesce(v_method, '');
  p.pay_ref    := coalesce(v_ref, '');
  return p;
end
$fn$;
revoke execute on function public.payable_apply_payment_totals(public.payables) from public, anon, authenticated;

-- BEFORE UPDATE on payables: keep paid figures consistent with the history.
create or replace function public.payables_enforce_payment_totals()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  return public.payable_apply_payment_totals(new);
end
$fn$;
revoke execute on function public.payables_enforce_payment_totals() from public, anon, authenticated;

drop trigger if exists trg_payables_enforce_payment_totals on public.payables;
create trigger trg_payables_enforce_payment_totals
  before update on public.payables
  for each row execute function public.payables_enforce_payment_totals();

-- AFTER a payment row changes: touch the payable so the BEFORE UPDATE trigger
-- above recomputes it.
create or replace function public.payable_payments_recompute()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  update public.payables set paid_amount = paid_amount
   where id = coalesce(new.payable_id, old.payable_id);
  return null;
end
$fn$;
revoke execute on function public.payable_payments_recompute() from public, anon, authenticated;

drop trigger if exists trg_payable_payments_recompute on public.payable_payments;
create trigger trg_payable_payments_recompute
  after insert or update on public.payable_payments
  for each row execute function public.payable_payments_recompute();

-- 5) server-assigned AP / PRV numbers --------------------------------------------
create or replace function public.payables_assign_number()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_prefix text := case when new.doc_type = 'PRV' then 'PRV' else 'AP' end;
  v_yr     text := to_char(now() at time zone 'Asia/Manila', 'YYYY');
  v_base   text;
  v_min    bigint;
  v_next   bigint;
  v_have   text;
begin
  if coalesce(trim(new.ap_number),'') <> '' then return new; end if;
  -- The app saves with upsert. An upsert of a payable that already exists fires
  -- this BEFORE INSERT trigger too, and its EXCLUDED row would carry a fresh
  -- number over the real one. Keep the existing number and burn no counter value.
  select ap_number into v_have from public.payables where id = new.id;
  if coalesce(trim(v_have),'') <> '' then
    new.ap_number := v_have;
    return new;
  end if;
  v_base := v_prefix || '-' || v_yr;
  select coalesce(max((regexp_match(ap_number, '^' || v_base || '-(\d+)$'))[1]::bigint), 0)
    into v_min from public.payables where ap_number like v_base || '-%';
  v_next := public.next_doc_number(v_base, v_min);
  new.ap_number := v_base || '-' || lpad(v_next::text, 4, '0');
  return new;
end
$fn$;
revoke execute on function public.payables_assign_number() from public, anon, authenticated;

drop trigger if exists trg_payables_assign_number on public.payables;
create trigger trg_payables_assign_number
  before insert on public.payables
  for each row execute function public.payables_assign_number();

-- 6) carry over existing payments (no JWT here, so the guard is skipped) -----------
insert into public.payable_payments (id, payable_id, kind, pay_date, amount, method, bank, ref_no, note, recorded_by, created_at)
select 'legacy-' || p.id, p.id, 'Payment',
       coalesce(p.paid_date, p.created_at::date, current_date),
       p.paid_amount,
       coalesce(p.pay_method,''), coalesce(p.pay_bank,''), coalesce(p.pay_ref,''),
       'Carried over from before payment history (single total, individual payments unknown)',
       'migration', coalesce(p.created_at, now())
  from public.payables p
 where coalesce(p.paid_amount,0) > 0
   and not exists (select 1 from public.payable_payments x where x.payable_id = p.id);

select 'AP payment history ready' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_payables_assign_number on public.payables;
--   drop function if exists public.payables_assign_number();
--   drop trigger if exists trg_payables_enforce_payment_totals on public.payables;
--   drop function if exists public.payables_enforce_payment_totals();
--   drop table if exists public.payable_payments;          -- drops its triggers
--   drop function if exists public.payable_payments_recompute();
--   drop function if exists public.payable_apply_payment_totals(public.payables);
--   drop function if exists public.payable_payments_guard();
--   alter table public.payables drop constraint if exists payables_doc_type_chk;
--   alter table public.payables drop column if exists retention_held;
--   alter table public.payables drop column if exists retention_pct;
--   alter table public.payables drop column if exists doc_type;
--   (paid_amount / status on payables are left as the last recompute set them.)
