-- A deal's amount_paid is set by the billing ledger or by a Manager, nobody else.
--
-- Commission is a share of what a deal has collected. For a deal with billing
-- milestones the database already owns amount_paid (recompute_deal_billing_totals;
-- trg_deals_protect_billing_totals keeps any other write out). A deal WITHOUT
-- milestones falls back to deals.amount_paid (dealCollected in src/App.jsx), and
-- that column was open to anyone who can update deals (Manager, Sales,
-- SalesOpsAdmin, QS) or insert them (e.g. the deal import's "Amount Paid"
-- column). An AE could therefore type in collections on their own deal and
-- earn commission on them.
--
-- Rule: unless the change comes from the billing recompute, from a Manager, or
-- from a call without a JWT (service role, cron):
--   * INSERT: amount_paid is forced to 0;
--   * UPDATE: a change to amount_paid is dropped (the old value is kept).
-- Like trg_deals_protect_billing_totals this keeps the old value silently
-- rather than failing the save, so a stale device re-saving a full row still
-- saves its other fields. Every dropped value is written to audit_log.
--
-- On 2026-10-26 no deal without milestones had a non-zero amount_paid, so
-- nothing existing changes.
--
-- Mirrors the deal import (src/App.jsx), which only carries "Amount Paid" for a
-- Manager. Keep them in sync.
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

create or replace trigger trg_deals_amount_paid_guard before insert or update of amount_paid on public.deals
  for each row execute function public.deals_amount_paid_guard();

-- ROLLBACK (run in the SQL editor, not the MCP):
--   drop trigger if exists trg_deals_amount_paid_guard on public.deals;
--   drop function if exists public.deals_amount_paid_guard();
