-- ── FabHub RLS verification (read-only) ─────────────────────────────────────
-- Run this in the Supabase SQL editor against your LIVE project. It proves
-- which write grants are actually deployed — the repo having a migration file
-- does NOT mean it was applied. Nothing here changes data.
--
-- (a) Confirms migration 037 (base grants) + 062 (this change) are live for the
--     expense-entry tables, and (b) confirms migration 044 granted the Chart of
--     Accounts write (app_settings) so COA edits by Finance/Accounting persist.

-- 1) Who can write the expense-entry + COA tables right now.
--    Read the "roles_in_policy" column — it lists the has_role(...) names each
--    policy allows. Expect to see SalesOpsAdmin and Procurement on expenses /
--    payables after migration 062, and Accounting on app_settings after 044.
select
  tablename,
  policyname,
  cmd            as operation,          -- SELECT / INSERT / UPDATE / DELETE
  coalesce(qual, with_check) as predicate,
  regexp_replace(coalesce(qual, with_check), '[^A-Za-z]+', ' ', 'g') as roles_in_policy
from pg_policies
where schemaname = 'public'
  and tablename in ('expenses','payables','app_settings')
order by tablename, cmd, policyname;

-- 2) Quick pass/fail: does each expected role appear on the right write policy?
--    Every row should return TRUE. A FALSE means that migration is NOT deployed.
with p as (
  select tablename, cmd, coalesce(qual, with_check) as pred
  from pg_policies where schemaname='public'
)
select 'expenses INSERT allows SalesOpsAdmin' as check,
       bool_or(cmd='INSERT' and pred ilike '%SalesOpsAdmin%') as ok
       from p where tablename='expenses'
union all
select 'expenses INSERT allows Procurement',
       bool_or(cmd='INSERT' and pred ilike '%Procurement%') from p where tablename='expenses'
union all
select 'payables INSERT allows SalesOpsAdmin',
       bool_or(cmd='INSERT' and pred ilike '%SalesOpsAdmin%') from p where tablename='payables'
union all
select 'payables INSERT allows Procurement (mig 037)',
       bool_or(cmd='INSERT' and pred ilike '%Procurement%') from p where tablename='payables'
union all
select 'expenses INSERT allows FinanceAssistant (mig 037)',
       bool_or(cmd='INSERT' and pred ilike '%FinanceAssistant%') from p where tablename='expenses'
union all
select 'app_settings write allows Accounting = COA persists (mig 044)',
       bool_or(cmd in ('INSERT','UPDATE') and pred ilike '%Accounting%') from p where tablename='app_settings';

-- 3) Sanity: RLS must be ENABLED on these tables, or policies are ignored.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('expenses','payables','app_settings')
order by relname;
