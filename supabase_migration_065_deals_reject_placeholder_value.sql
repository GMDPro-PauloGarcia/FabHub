-- 065: server-side backstop against placeholder / no-value deals
--
-- Mirrors the client-side guard in saveDeal (src/App.jsx) at the database level so
-- a ₱1 or no-contract-value-with-money deal cannot be written by ANY path — the
-- form, a future spreadsheet import, or a direct SQL/API write. This is the durable
-- backstop for the honest-mistake case (a re-upload that landed deals at ₱1 while
-- invoiced/paid amounts copied over from the source rows).
--
-- Standby PO umbrellas are legitimately ₱0 (their value lives on the drawdown jobs)
-- and are exempt. The UPDATE trigger only fires when one of the money columns is
-- actually being changed, so pre-existing rows that already violate the rule (e.g.
-- deals awaiting a contract value) are NOT blocked on unrelated edits — only when
-- someone touches value/invoiced/amount_paid, at which point the value must be set.

create or replace function public.deals_reject_placeholder_value()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.standby_po, false) then
    return new;
  end if;

  if new.value = 1 then
    raise exception
      'Contract value of PHP 1 looks like an import placeholder — enter the real contract value (deal "%", CE %).',
      coalesce(new.contact, new.client, ''), coalesce(new.ce_no, '');
  end if;

  if coalesce(new.value, 0) <= 0
     and (coalesce(new.invoiced, 0) > 0 or coalesce(new.amount_paid, 0) > 0) then
    raise exception
      'Deal has invoiced/paid amounts but no contract value — set the value first (deal "%", CE %).',
      coalesce(new.contact, new.client, ''), coalesce(new.ce_no, '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deals_reject_placeholder on public.deals;
create trigger trg_deals_reject_placeholder
  before insert or update of value, invoiced, amount_paid, standby_po
  on public.deals
  for each row
  execute function public.deals_reject_placeholder_value();
