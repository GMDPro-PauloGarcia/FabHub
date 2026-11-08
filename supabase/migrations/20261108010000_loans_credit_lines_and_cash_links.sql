-- Loans: credit lines + bank loans, every draw / payment linked to the cash sheet.
-- Decided with Paulo 2026-11-08 (layout approved; data entered with Pao and Mark).
--
-- Background: loans / loan_payments existed but held 0 rows. The cash sheet shows
-- ₱3M of BPI loan proceeds on 2026-09-08 entered as collections, BPI credit-line
-- interest, and no principal payments, so nobody could see what GMD owes.
--
-- loans          + kind ('credit_line' | 'bank_loan'), name, credit_limit,
--                  first_due (first amortisation date), status, created_by.
-- loan_payments  + entry_type ('draw' | 'payment'), principal, interest, bank,
--                  cash_key (the Daily Cash Position row: "<date>#in|out#<row id>"),
--                  cash_date, note, recorded_by.
--
-- Rules (loan_payments_guard):
--   • amounts are never negative; a draw is all principal; a payment's amount is
--     principal + interest;
--   • an entry with no cash-sheet row needs a note (e.g. "paid before FabHub");
--   • one cash-sheet row backs at most one entry (unique cash_key);
--   • principal repaid can never exceed what was borrowed (bank loan: the loan
--     amount; credit line: the draws);
--   • recorded_by is stamped by the server.
-- Who: read and write Manager / Finance / FinanceAssistant (Mark, Jerwin) as
-- before; delete Manager only (unchanged policies). Every insert, change and
-- delete on both tables is kept in audit_log (old and new row).
-- Mirrors src/views/LoansView.jsx and mapLoans (src/supabaseClient.js). Idempotent.

alter table public.loans add column if not exists kind text not null default 'bank_loan';
alter table public.loans add column if not exists name text;
alter table public.loans add column if not exists credit_limit numeric;
alter table public.loans add column if not exists first_due date;
alter table public.loans add column if not exists status text not null default 'Active';
alter table public.loans add column if not exists created_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loans_kind_chk') then
    alter table public.loans add constraint loans_kind_chk check (kind in ('credit_line','bank_loan'));
  end if;
end $$;

alter table public.loan_payments add column if not exists entry_type text not null default 'payment';
alter table public.loan_payments add column if not exists principal numeric not null default 0;
alter table public.loan_payments add column if not exists interest numeric not null default 0;
alter table public.loan_payments add column if not exists bank text;
alter table public.loan_payments add column if not exists cash_key text;
alter table public.loan_payments add column if not exists cash_date date;
alter table public.loan_payments add column if not exists note text;
alter table public.loan_payments add column if not exists recorded_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loan_payments_type_chk') then
    alter table public.loan_payments add constraint loan_payments_type_chk check (entry_type in ('draw','payment'));
  end if;
end $$;
create unique index if not exists loan_payments_cash_key_unique
  on public.loan_payments (cash_key) where cash_key is not null and cash_key <> '';

create or replace function public.loan_payments_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare l public.loans; borrowed numeric; repaid numeric;
begin
  select * into l from public.loans where id = new.loan_id;
  if not found then raise exception 'Loan not found' using errcode = 'P0002'; end if;
  new.principal := coalesce(new.principal, 0);
  new.interest  := coalesce(new.interest, 0);
  if new.entry_type = 'draw' then
    new.principal := coalesce(nullif(new.amount, 0), new.principal);
    new.interest := 0;
    new.amount := new.principal;
  else
    new.amount := new.principal + new.interest;
  end if;
  if new.principal < 0 or new.interest < 0 or new.amount <= 0 then
    raise exception 'Enter an amount above zero (principal and interest cannot be negative)' using errcode = '22023';
  end if;
  if coalesce(btrim(new.cash_key), '') = '' then
    new.cash_key := null;
    if coalesce(btrim(new.note), '') = '' then
      raise exception 'An entry that is not on the cash sheet needs a note (for example: paid before FabHub)' using errcode = '22023';
    end if;
  end if;
  if new.entry_type = 'payment' and new.principal > 0 then
    select coalesce(sum(principal), 0) into repaid from public.loan_payments
     where loan_id = new.loan_id and entry_type = 'payment' and id <> new.id;
    if l.kind = 'credit_line' then
      select coalesce(sum(principal), 0) into borrowed from public.loan_payments
       where loan_id = new.loan_id and entry_type = 'draw' and id <> new.id;
    else
      borrowed := coalesce(l.principal, 0);
    end if;
    if repaid + new.principal > borrowed + 0.005 then
      raise exception 'Principal repaid (₱%) would be more than what was borrowed (₱%)',
        to_char(repaid + new.principal, 'FM999,999,999.00'), to_char(borrowed, 'FM999,999,999.00') using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.recorded_by := coalesce((select name from public.user_profiles where username = public.app_username()), public.app_username(), new.recorded_by);
  else
    new.recorded_by := old.recorded_by;
  end if;
  return new;
end $$;

create or replace trigger trg_loan_payments_guard before insert or update on public.loan_payments
  for each row execute function public.loan_payments_guard();

create or replace function public.loans_audit()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare who text := coalesce((select name from public.user_profiles where username = public.app_username()), public.app_username(), 'system');
begin
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, performed_by, performed_at)
  values (tg_table_name, coalesce(new.id, old.id)::text, lower(tg_op),
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end, who, now());
  return coalesce(new, old);
end $$;

create or replace trigger trg_loans_audit after insert or update or delete on public.loans
  for each row execute function public.loans_audit();
create or replace trigger trg_loan_payments_audit after insert or update or delete on public.loan_payments
  for each row execute function public.loans_audit();

revoke execute on function public.loan_payments_guard() from public, anon, authenticated;
revoke execute on function public.loans_audit() from public, anon, authenticated;

-- ROLLBACK
--   drop trigger if exists trg_loan_payments_guard on public.loan_payments;
--   drop trigger if exists trg_loans_audit on public.loans;
--   drop trigger if exists trg_loan_payments_audit on public.loan_payments;
--   (the added columns and the unique index can stay; nothing else reads them)
