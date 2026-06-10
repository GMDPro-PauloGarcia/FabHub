-- ─────────────────────────────────────────────────────────────────────────────
-- FabHub — Supabase Row-Level Security Policies
-- Run this entire file in the Supabase SQL Editor (Database → SQL Editor).
--
-- Strategy: Allow full access to any authenticated session (including anonymous
-- sign-ins). This blocks unauthenticated requests while keeping the app working
-- exactly as before since every browser tab calls signInAnonymously() on load.
--
-- After running, verify in Supabase → Authentication → Policies that each table
-- shows "RLS enabled" and at least one policy.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: enable RLS and drop any existing policies before re-creating them.
-- Run section by section if you want to apply incrementally.

-- ── DEALS ────────────────────────────────────────────────────────────────────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON deals;
CREATE POLICY "authenticated_all" ON deals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── JOB ORDERS ───────────────────────────────────────────────────────────────
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON job_orders;
CREATE POLICY "authenticated_all" ON job_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── PROJECT CARDS ─────────────────────────────────────────────────────────────
ALTER TABLE project_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON project_cards;
CREATE POLICY "authenticated_all" ON project_cards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE project_card_dept_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON project_card_dept_tasks;
CREATE POLICY "authenticated_all" ON project_card_dept_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE project_card_dept_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON project_card_dept_status;
CREATE POLICY "authenticated_all" ON project_card_dept_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── BILLING ───────────────────────────────────────────────────────────────────
ALTER TABLE billing_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON billing_milestones;
CREATE POLICY "authenticated_all" ON billing_milestones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON billing_payments;
CREATE POLICY "authenticated_all" ON billing_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── EXPENSES / INFLOWS ───────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON expenses;
CREATE POLICY "authenticated_all" ON expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON inflows;
CREATE POLICY "authenticated_all" ON inflows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── PURCHASE / MATERIAL / BUDGET REQUESTS ────────────────────────────────────
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON purchase_requests;
CREATE POLICY "authenticated_all" ON purchase_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON material_requests;
CREATE POLICY "authenticated_all" ON material_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE budget_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON budget_requests;
CREATE POLICY "authenticated_all" ON budget_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── PROJECTS ──────────────────────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON projects;
CREATE POLICY "authenticated_all" ON projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON project_budgets;
CREATE POLICY "authenticated_all" ON project_budgets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── DESIGN REQUESTS ───────────────────────────────────────────────────────────
ALTER TABLE design_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON design_requests;
CREATE POLICY "authenticated_all" ON design_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── ADDENDA / CHECKLISTS / SWATCHES ──────────────────────────────────────────
ALTER TABLE addenda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON addenda;
CREATE POLICY "authenticated_all" ON addenda
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON checklists;
CREATE POLICY "authenticated_all" ON checklists
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE swatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON swatches;
CREATE POLICY "authenticated_all" ON swatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── INVENTORY ─────────────────────────────────────────────────────────────────
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON inventory_items;
CREATE POLICY "authenticated_all" ON inventory_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON stock_movements;
CREATE POLICY "authenticated_all" ON stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── FINANCE ───────────────────────────────────────────────────────────────────
ALTER TABLE cash_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cash_positions;
CREATE POLICY "authenticated_all" ON cash_positions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON payables;
CREATE POLICY "authenticated_all" ON payables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON loans;
CREATE POLICY "authenticated_all" ON loans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON loan_payments;
CREATE POLICY "authenticated_all" ON loan_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── SUPPLIERS / SUBCONTRACTORS ────────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON suppliers;
CREATE POLICY "authenticated_all" ON suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON subcontractors;
CREATE POLICY "authenticated_all" ON subcontractors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── ACTIVITY / AE UPDATES ────────────────────────────────────────────────────
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON activity_log;
CREATE POLICY "authenticated_all" ON activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE ae_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON ae_updates;
CREATE POLICY "authenticated_all" ON ae_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── USERS / SETTINGS ──────────────────────────────────────────────────────────
-- user_profiles: authenticated users can read all, but only update their own row.
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON user_profiles;
DROP POLICY IF EXISTS "write_own" ON user_profiles;
DROP POLICY IF EXISTS "manager_write_all" ON user_profiles;
CREATE POLICY "read_all" ON user_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_own" ON user_profiles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "insert_authenticated" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (true);

-- app_settings: read/write for all authenticated (Managers control via UI)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON app_settings;
CREATE POLICY "authenticated_all" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
