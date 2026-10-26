-- D3 (Paulo, 9 Oct 2026): a subcontractor payable (PRV or AP) of ₱50,000 or more
-- must be linked to a Work Order, so Operations confirms the work before it's paid.
-- Hard block, no override. The app enforces the same rule (subconNoWoRefused in
-- src/core.js); keep the limit, account codes and conditions in sync.
--
-- Refused: an insert that breaks the rule, an update that makes a row break it,
-- or an update that raises the amount of a row that already breaks it. Rows that
-- already break it can still be edited and paid (the payment-total trigger
-- rewrites payables rows) as long as the amount doesn't go up.
--
-- Only API callers (anon / authenticated) are checked. Imports and migrations run
-- as the database owner are not.

create or replace function public.payables_subcon_wo_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  new_bad boolean := (new.category = 'Subcontractor' or coalesce(new.account_code,'') in ('5070','5100','5200'))
                     and btrim(coalesce(new.po_number,'')) = '' and coalesce(new.amount,0) >= 50000;
  old_bad boolean := false;
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if tg_op = 'UPDATE' then
    old_bad := (old.category = 'Subcontractor' or coalesce(old.account_code,'') in ('5070','5100','5200'))
               and btrim(coalesce(old.po_number,'')) = '' and coalesce(old.amount,0) >= 50000;
  end if;
  if new_bad
     and (tg_op = 'INSERT'
          or not old_bad
          or coalesce(new.amount,0) > coalesce(old.amount,0)) then
    raise exception 'Subcontractor payables of PHP 50,000 or more need a Work Order (decision D3). Create the Work Order first.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace trigger trg_payables_subcon_wo_guard
  before insert or update on public.payables
  for each row execute function public.payables_subcon_wo_guard();

revoke execute on function public.payables_subcon_wo_guard() from public, anon, authenticated;

-- ROLLBACK
-- drop trigger if exists trg_payables_subcon_wo_guard on public.payables;
-- drop function if exists public.payables_subcon_wo_guard();
