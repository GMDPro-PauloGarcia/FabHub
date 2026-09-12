-- ── Migration 062: widen expense-entry access (SalesOpsAdmin + Procurement) ──
-- Business decision (Paulo): the following should be able to record expenses —
--   1. Sales & Ops Assistant   → role SalesOpsAdmin
--   2. Finance team            → Finance + FinanceAssistant  (already granted)
--   3. Procurement (mgr + asst)→ role Procurement
--
-- The app UI (src/core.js PERMISSIONS) is updated in the same change; this
-- migration is the other half — without it the DB (RLS from migration 037,
-- amended by 044) would silently reject these roles' writes and the record
-- would live only in the user's browser (the "saved locally only" failure).
--
-- Scope of this grant: SELECT + INSERT + UPDATE on the two cost-entry tables
-- (expenses, payables). DELETE stays Manager-only, consistent with every other
-- finance table — no role loses access here, this is purely additive.
--
-- NOTE (segregation of duties): this lets SalesOpsAdmin and Procurement CREATE
-- payables (i.e. commit the company to paying money) with no separate approval
-- gate, because FabHub has no maker/checker step yet. That is a deliberate,
-- pre-existing limitation, not introduced here. Revisit when the approval
-- workflow lands.
--
-- Follows the migration-052 override pattern: drop the generated policy and
-- recreate it. Idempotent — safe to re-run. Uses public.has_role() (migration 037).

alter table public.expenses enable row level security;
alter table public.payables enable row level security;

-- ── expenses: add SalesOpsAdmin + Procurement to INSERT / UPDATE ─────────────
-- (SELECT on expenses is already open to all authenticated users.)
drop policy if exists expenses_ins on public.expenses;
create policy expenses_ins on public.expenses
  for insert to authenticated
  with check ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','SalesOpsAdmin','Procurement') );

drop policy if exists expenses_upd on public.expenses;
create policy expenses_upd on public.expenses
  for update to authenticated
  using ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','SalesOpsAdmin','Procurement') )
  with check ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','SalesOpsAdmin','Procurement') );

-- ── payables: add SalesOpsAdmin to SELECT / INSERT / UPDATE ──────────────────
-- (Procurement already had payables access from migration 037.)
drop policy if exists payables_sel on public.payables;
create policy payables_sel on public.payables
  for select to authenticated
  using ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin') );

drop policy if exists payables_ins on public.payables;
create policy payables_ins on public.payables
  for insert to authenticated
  with check ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin') );

drop policy if exists payables_upd on public.payables;
create policy payables_upd on public.payables
  for update to authenticated
  using ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin') )
  with check ( public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin') );

select 'Migration 062 applied — SalesOpsAdmin + Procurement can record expenses & payables' as status;

-- ── ROLLBACK (restore the migration-037/044 predicates) ─────────────────────
--   expenses_ins  WITH CHECK has_role('Manager','Finance','Accounting','FinanceAssistant')
--   expenses_upd  USING/CHECK has_role('Manager','Finance','Accounting','FinanceAssistant')
--   payables_sel  USING       has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement')
--   payables_ins  WITH CHECK  has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement')
--   payables_upd  USING/CHECK has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement')
