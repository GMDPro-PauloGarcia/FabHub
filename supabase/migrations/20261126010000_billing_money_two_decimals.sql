-- Billing money has 2 decimals (Paulo, 2026-11-26).
--
-- On 2026-11-26, 4 billing milestones and 15 client payments were stored with
-- more than 2 decimals, e.g. 617857.145, 474556.31999999995, 218359.42239999998:
-- JavaScript float leftovers from a prefilled balance or a VAT conversion that
-- reached the database unrounded. They show as "3 decimal places" in forms and
-- as centavo gaps on the cash-sheet 🔗 (Dot Coffee INV-1974, 739,200.02 vs the
-- bank's 739,200.00).
--
-- 1. Backs up the rows, then rounds them to centavos.
-- 2. A BEFORE INSERT OR UPDATE trigger rounds `amount` to 2 decimals on both
--    tables from now on, so a stale device can't bring the leftovers back.
--    Named `a_…` so it fires before the `trg_…` guards (Postgres fires BEFORE
--    triggers in name order), which then see the rounded amount.
-- App mirror: toSbBilling / toSbPayment / logBillingPayment round to 2 decimals
-- (src/App.jsx). Keep them in sync.
--
-- Note: rounding a payment's amount clears its Manager check
-- (trg_billing_payments_check_guard) if it had one; these 15 predate the check.

create table if not exists public.billing_money_round_backup_20261126 as
  select 'billing_milestones'::text as tbl, id, amount, now() as backed_up_at
    from public.billing_milestones where amount <> round(amount, 2)
  union all
  select 'billing_payments', id, amount, now()
    from public.billing_payments where amount <> round(amount, 2);
alter table public.billing_money_round_backup_20261126 enable row level security;
revoke all on public.billing_money_round_backup_20261126 from public, anon, authenticated;

update public.billing_milestones set amount = round(amount, 2) where amount <> round(amount, 2);
update public.billing_payments   set amount = round(amount, 2) where amount <> round(amount, 2);

create or replace function public.billing_round_amount()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.amount is not null then
    new.amount := round(new.amount, 2);
  end if;
  return new;
end;
$$;
revoke execute on function public.billing_round_amount() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'a_billing_milestones_round_amount'
                   and tgrelid = 'public.billing_milestones'::regclass) then
    create trigger a_billing_milestones_round_amount
      before insert or update of amount on public.billing_milestones
      for each row execute function public.billing_round_amount();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'a_billing_payments_round_amount'
                   and tgrelid = 'public.billing_payments'::regclass) then
    create trigger a_billing_payments_round_amount
      before insert or update of amount on public.billing_payments
      for each row execute function public.billing_round_amount();
  end if;
end $$;

-- ROLLBACK
-- (Supabase MCP hangs on DROP: run these from the SQL editor.)
-- drop trigger if exists a_billing_milestones_round_amount on public.billing_milestones;
-- drop trigger if exists a_billing_payments_round_amount on public.billing_payments;
-- drop function if exists public.billing_round_amount();
-- update public.billing_milestones m set amount = b.amount
--   from public.billing_money_round_backup_20261126 b where b.tbl = 'billing_milestones' and b.id = m.id;
-- update public.billing_payments p set amount = b.amount
--   from public.billing_money_round_backup_20261126 b where b.tbl = 'billing_payments' and b.id = p.id;
