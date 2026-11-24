-- deals_amount_paid_guard: stop false "blocked" entries on ordinary deal saves.
--
-- The app saves deals with an upsert. Postgres runs BEFORE INSERT triggers even
-- when the upsert ends up updating an existing row, so the INSERT branch of this
-- guard compared the row's real amount_paid against 0, wrote an audit_log
-- 'blocked' entry, and zeroed the incoming value (the UPDATE branch /
-- trg_deals_protect_billing_totals then kept the server's value, so no money was
-- ever lost). Seen 2026-11-24: 15 'blocked' entries from jena on 5 of her own
-- fully-paid deals, each sending exactly the amount already on the server.
--
-- Fix (same pattern as 20261106000000_subcon_billing_audit_fixes.sql): on INSERT,
-- if a deal with this id already exists, return the row untouched and let the
-- UPDATE branch decide. A genuinely new deal still gets amount_paid forced to 0
-- for non-Managers; a real change on update is still dropped and logged.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.deals_amount_paid_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
  v_old numeric := case when tg_op = 'UPDATE' then old.amount_paid else 0 end;
begin
  if coalesce(current_setting('fabhub.billing_recompute', true), '') = 'on'
     or not has_jwt
     or public.has_role('Manager') then
    return new;
  end if;
  -- Upsert of an existing deal: the UPDATE branch (and
  -- trg_deals_protect_billing_totals) decides.
  if tg_op = 'INSERT' and exists (select 1 from public.deals where id = new.id) then
    return new;
  end if;
  if coalesce(new.amount_paid, 0) = coalesce(v_old, 0) then
    return new;
  end if;

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    ('deals', new.id::text, 'blocked',
     jsonb_build_object('amount_paid', v_old), jsonb_build_object('amount_paid', new.amount_paid),
     array['amount_paid'], public.app_username(),
     'amount_paid change blocked: set by the billing ledger or a Manager only');

  new.amount_paid := v_old;
  return new;
end
$fn$;

revoke execute on function public.deals_amount_paid_guard() from public, anon, authenticated;

-- ROLLBACK: re-run the function body from
-- 20261026040000_deals_amount_paid_manager_only.sql (create or replace).
