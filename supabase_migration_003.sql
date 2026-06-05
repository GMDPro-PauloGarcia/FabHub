-- ============================================================
-- FabHub Migration 003 — Grant anon full access to all tables
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- WHY: The app connects using the anon key (not Supabase auth),
-- so RLS policies scoped to "authenticated" block all writes.
-- This migration adds anon write policies so the app can
-- insert, update, and delete records through the API.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'deals','job_orders','billing_milestones','billing_payments',
    'expenses','inflows','purchase_requests','material_requests',
    'budget_requests','addenda','swatches','checklists','activity_log',
    'projects','project_cards','project_card_dept_tasks',
    'project_card_dept_status','project_budgets','cash_positions',
    'design_requests','inventory_items','stock_movements',
    'suppliers','subcontractors','user_profiles','app_settings',
    'payables','loans','loan_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "anon_full_access" ON %I
       FOR ALL TO anon USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

SELECT 'Migration 003 applied — anon write access granted' AS status;
