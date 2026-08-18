-- ── Migration 049: allow Finance roles to DELETE billing records ─────────────
-- Bug: Finance / FinanceAssistant / SalesOpsAdmin see the "Delete milestone" and
-- "Delete billing schedule" buttons in BillingView (canEdit = Manager|Finance|
-- SalesOpsAdmin, src/App.jsx) and the deleteMilestone/deleteProjectBilling
-- handlers run for them — archiving the row to the Audit Trail first, then
-- removing it. But migration 037 restricted DELETE on billing_milestones /
-- billing_payments to Manager only ("del":["Manager"]). So for a non-Manager the
-- server silently rejected the DELETE (RLS): the row vanished from local state
-- but survived in the database and REAPPEARED on the next reload / realtime
-- resync. That is the "milestones I delete keep coming back" report.
--
-- Fix: grant DELETE to the same roles that already INSERT/UPDATE these tables
-- (Manager, Finance, FinanceAssistant, SalesOpsAdmin), matching the client
-- allow-list (INSERT_ROLES.billing_milestones / billing_payments in src/App.jsx)
-- and the delete UI gate. Deletions remain safe because both handlers archive
-- the milestone AND its payments to the audit_log (restorable) before removal.
--
-- This deliberately relaxes owner Decision #3 (2026-07-08, "Manager-only delete
-- on financial records") for billing only, per the owner's 2026-08-18 call: the
-- archive-before-delete flow makes Finance-initiated deletes reversible, and
-- Finance needs to clean up duplicate/erroneous milestones without routing every
-- deletion through a Manager. Other financial tables (expenses, vouchers,
-- payables, cash, inflows, budgets) keep Manager-only DELETE.
--
-- Uses the public.has_role() helper defined in migration 037.

do $do$
declare
  tbl text;
begin
  foreach tbl in array array['billing_milestones','billing_payments'] loop
    if to_regclass('public.'||tbl) is null then
      raise notice 'skipping missing table: %', tbl; continue;
    end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl||'_del', tbl);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      tbl||'_del', tbl,
      'public.has_role(''Manager'',''Finance'',''FinanceAssistant'',''SalesOpsAdmin'')'
    );
  end loop;
end $do$;

-- ── ROLLBACK (restore Manager-only DELETE on the billing tables) ─────────────
--   do $r$ declare t text; begin
--     foreach t in array array['billing_milestones','billing_payments'] loop
--       execute format('drop policy if exists %I on public.%I', t||'_del', t);
--       execute format('create policy %I on public.%I for delete to authenticated using (public.is_mgr())', t||'_del', t);
--     end loop; end $r$;
