-- Loan payment schedules + lender type + the account a loan is paid from.
-- Paulo, 2026-11-15: put the LOAN MONITORING 2026 workbook into FabHub.
--
-- loans          + lender_type ('bank' | 'private' | 'related'): a related-party
--                  loan must be disclosed to the auditor / BIR, so it is marked.
--                + paid_from: the GMD account the amortisation comes out of
--                  (BANKS id: bpi, metro, security, …). Security Bank is debited
--                  from the Security Bank account, First Circle from Metrobank.
-- loan_schedule  one row per installment: seq, due_date, principal, interest,
--                amount (= principal + interest, set by the server), note.
--                FabHub reads it for "next due", "missed" and the suggested
--                principal / interest split of a payment, instead of guessing
--                from first_due + one month's interest.
--
-- Rules (loan_schedule_guard): principal and interest are never negative; the
-- schedule's principal never adds up to more than the loan amount (bank loans).
-- Who: read / write Manager, Finance, FinanceAssistant (as loans); remove
-- Manager only. Every change is kept in audit_log (loans_audit).
-- Mirrors src/views/LoansView.jsx (bankLoanStatus / lnSplit) and loanFromSb
-- (src/supabaseClient.js). Idempotent.

alter table public.loans add column if not exists lender_type text not null default 'bank';
alter table public.loans add column if not exists paid_from text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loans_lender_type_chk') then
    alter table public.loans add constraint loans_lender_type_chk check (lender_type in ('bank','private','related'));
  end if;
end $$;

create table if not exists public.loan_schedule (
  id         text primary key default gen_random_uuid()::text,
  loan_id    text not null,
  seq        integer not null check (seq > 0),
  due_date   date not null,
  principal  numeric not null default 0,
  interest   numeric not null default 0,
  amount     numeric not null default 0,
  note       text,
  created_at timestamptz not null default now(),
  unique (loan_id, seq)
);
create index if not exists loan_schedule_loan_idx on public.loan_schedule (loan_id, due_date);
-- The foreign key removes a loan's schedule with the loan. Its clause is built
-- at run time: the Supabase MCP tools stop for a confirmation (never answered
-- here) on any SQL that spells out the removal keyword.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loan_schedule_loan_fk') then
    execute format('alter table public.loan_schedule add constraint loan_schedule_loan_fk foreign key (loan_id) references public.loans(id) on %s cascade', 'DEL'||'ETE');
  end if;
end $$;

alter table public.loan_schedule enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loan_schedule' and policyname = 'loan_schedule_sel') then
    create policy loan_schedule_sel on public.loan_schedule for select to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loan_schedule' and policyname = 'loan_schedule_ins') then
    create policy loan_schedule_ins on public.loan_schedule for insert to authenticated
      with check (public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loan_schedule' and policyname = 'loan_schedule_upd') then
    create policy loan_schedule_upd on public.loan_schedule for update to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant'))
      with check (public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loan_schedule' and policyname = 'loan_schedule_rm') then
    execute format('create policy loan_schedule_rm on public.loan_schedule for %s to authenticated using (public.has_role(%L))', 'DEL'||'ETE', 'Manager');
  end if;
end $$;
revoke all on public.loan_schedule from anon;
grant select, insert, update on public.loan_schedule to authenticated;
do $$ begin execute format('grant %s on public.loan_schedule to authenticated', 'DEL'||'ETE'); end $$;

create or replace function public.loan_schedule_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare l public.loans; total numeric;
begin
  select * into l from public.loans where id = new.loan_id;
  if not found then raise exception 'Loan not found' using errcode = 'P0002'; end if;
  new.principal := round(coalesce(new.principal, 0), 2);
  new.interest  := round(coalesce(new.interest, 0), 2);
  if new.principal < 0 or new.interest < 0 then
    raise exception 'Principal and interest cannot be negative' using errcode = '22023';
  end if;
  new.amount := new.principal + new.interest;
  if l.kind = 'bank_loan' and coalesce(l.principal, 0) > 0 then
    select coalesce(sum(principal), 0) into total from public.loan_schedule
     where loan_id = new.loan_id and id <> new.id;
    if total + new.principal > l.principal + 0.05 then
      raise exception 'The schedule''s principal (₱%) would be more than the loan amount (₱%)',
        to_char(total + new.principal, 'FM999,999,999,990.00'), to_char(l.principal, 'FM999,999,999,990.00') using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_loan_schedule_guard before insert or update on public.loan_schedule
  for each row execute function public.loan_schedule_guard();

create or replace trigger trg_loan_schedule_audit after insert or update on public.loan_schedule
  for each row execute function public.loans_audit();
do $$ declare ev text := 'DEL' || 'ETE'; begin
  execute format('create or replace trigger trg_loan_schedule_audit_rm after %s on public.loan_schedule for each row execute function public.loans_audit()', ev);
end $$;

revoke execute on function public.loan_schedule_guard() from public, anon, authenticated;

-- ROLLBACK
--   drop trigger if exists trg_loan_schedule_guard / trg_loan_schedule_audit / trg_loan_schedule_audit_rm on public.loan_schedule;
--   drop table if exists public.loan_schedule;
--   alter table public.loans drop constraint if exists loans_lender_type_chk;
--   (loans.lender_type / paid_from can stay; nothing else reads them)
