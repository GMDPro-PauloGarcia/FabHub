-- Sales Owner is locked once a deal has collections.
--
-- Commission goes to deals.sales_owner on what the client has collected.
-- Migration 20261026020000 stops a non-Manager recording payments on a deal
-- they own. Without this lock that is easy to get around: reassign the deal to
-- someone else, log the payment, then switch the Sales Owner back. The same
-- trick works in reverse (log a payment on a colleague's deal, then make it
-- yours).
--
-- Rule: once a deal has any collection (a billing_payments row on one of its
-- milestones, or a non-zero amount_paid on a legacy deal with no schedule),
-- only a Manager may change its Sales Owner. A non-Manager's change is
-- silently dropped (the old value is kept, like trg_deals_protect_billing_totals),
-- so a stale device re-saving an old full row doesn't fail the whole save.
-- Calls without a JWT (service role, cron) are not restricted, as in
-- enforce_lead_origin_approval.
--
-- Every Sales Owner change, and every blocked attempt, is written to audit_log.
--
-- Mirrors salesOwnerLocked (src/core.js), used by the deal form's
-- "Sales Owner / AE" field. Keep them in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.deals_sales_owner_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
  v_has_collections boolean;
begin
  if lower(btrim(coalesce(new.sales_owner, ''))) = lower(btrim(coalesce(old.sales_owner, ''))) then
    return new;
  end if;

  v_has_collections :=
       coalesce(old.amount_paid, 0) <> 0
    or exists (select 1
                 from public.billing_milestones m
                 join public.billing_payments p on p.milestone_id = m.id
                where m.deal_id = old.id);

  if has_jwt and v_has_collections and not public.has_role('Manager') then
    insert into public.audit_log
      (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
    values
      ('deals', old.id::text, 'blocked',
       jsonb_build_object('sales_owner', old.sales_owner), jsonb_build_object('sales_owner', new.sales_owner),
       array['sales_owner'], public.app_username(),
       'Sales Owner change blocked: deal has collections (Manager only)');
    new.sales_owner := old.sales_owner;
    return new;
  end if;

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    ('deals', old.id::text, 'update',
     jsonb_build_object('sales_owner', old.sales_owner), jsonb_build_object('sales_owner', new.sales_owner),
     array['sales_owner'], nullif(public.app_username(), ''), 'Sales Owner change');
  return new;
end
$fn$;

revoke execute on function public.deals_sales_owner_lock() from public, anon, authenticated;

create or replace trigger trg_deals_sales_owner_lock before update of sales_owner on public.deals
  for each row execute function public.deals_sales_owner_lock();

-- ROLLBACK (run in the SQL editor, not the MCP):
--   drop trigger if exists trg_deals_sales_owner_lock on public.deals;
--   drop function if exists public.deals_sales_owner_lock();
