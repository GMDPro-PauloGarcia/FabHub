-- ── Migration 068: let the award (🏆) roles insert the starting project budget ──
-- Root cause of Jessica Castro's (SalesOpsAdmin) award failure:
--   "new row violates row-level security policy for table project_budgets"
--
-- The award action (🏆) in src/App.jsx (openAward, confirmAward) is available to
-- Manager, Sales AND SalesOpsAdmin. When the contract value is > 0, confirmAward
-- auto-writes a starting budget (70% cost / 30% margin split) via saveBudget ->
-- sbUpsert('project_budgets', …). That is the deal's FIRST budget row, so the
-- INSERT branch of the ON CONFLICT(deal_id) upsert must satisfy the INSERT policy.
--
-- Migration 037 gated project_budgets INSERT to Manager/QS only. So when a Sales
-- or SalesOpsAdmin user awards a deal, the deal / job order / project card writes
-- succeed (those policies already allow them — see migration 059), but the
-- starting-budget insert is rejected by RLS. It is classified a non-retryable
-- "data" error, dropped, and surfaces as the "Starting Budget — check console"
-- line in the award "needs attention" toast.
--
-- Fix: widen project_budgets INSERT to the roles that can actually award a deal —
-- add Sales and SalesOpsAdmin to the existing Manager/QS. This is the same class
-- of fix as migration 059 (project cards) and migration 036 (billings).
--
-- Deliberately scoped to INSERT only. UPDATE stays
-- Manager/Finance/FinanceAssistant/QS and DELETE stays Manager-only (unchanged),
-- so an awarding Sales user can create the starting budget but cannot later
-- overwrite or delete a budget that Finance/QS owns. Idempotent via ALTER POLICY.
--
-- ⚠️ RLS change — validate on a branch / staging with a SalesOpsAdmin login
-- (award a deal with a contract value, confirm the Starting Budget step reaches
-- the server with no "needs attention" line) before applying to production.

alter policy project_budgets_ins on public.project_budgets
  with check ( has_role(VARIADIC ARRAY['Manager','QS','Sales','SalesOpsAdmin']) );

select 'Migration 068 applied — Sales/SalesOpsAdmin can insert the starting project budget on award' as status;
