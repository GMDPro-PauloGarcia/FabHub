-- ============================================================================
-- FabHub — retention tracking on billing milestones
-- ============================================================================
-- Construction clients withhold a retention % from each progress billing,
-- released only at project completion / end of the defects-liability period.
-- These columns let each billing record how much retention it withheld, and
-- mark the final "Retention Release" billing, so the app can show a running
-- retention receivable per project. Both nullable — existing rows unaffected.
-- Run this once in the Supabase SQL Editor.
-- ============================================================================
alter table public.billing_milestones add column if not exists retention_held       numeric;
alter table public.billing_milestones add column if not exists is_retention_release boolean;
