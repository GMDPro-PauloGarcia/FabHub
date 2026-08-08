-- ============================================================
--  GMD FabHub — Complete Supabase Schema
--  Paste this entire file into the Supabase SQL Editor and run.
--  Safe to re-run: uses CREATE TABLE IF NOT EXISTS throughout.
-- ============================================================

-- ── 1. DEALS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ce_no               TEXT,
  ce_type             TEXT,
  client              TEXT,
  contact             TEXT,
  product             TEXT,
  stage               TEXT,
  priority            TEXT DEFAULT 'Normal',
  sales_owner         TEXT,
  biz_dev_source      TEXT,
  date_acquired       DATE,
  due_date            DATE,
  follow_up           TEXT,
  value               NUMERIC DEFAULT 0,
  invoiced            NUMERIC DEFAULT 0,
  amount_paid         NUMERIC DEFAULT 0,
  payment_status      TEXT DEFAULT 'Unpaid',
  receipt_type        TEXT DEFAULT 'OR',
  withholding         BOOLEAN DEFAULT FALSE,
  comms_group         TEXT,
  sales_repo_link     TEXT,
  proposal_folder_link TEXT,
  notes               TEXT,
  probability         INTEGER DEFAULT 0,
  award_request_data  JSONB,
  location            TEXT DEFAULT '',
  added_by            TEXT DEFAULT '',
  added_at            TIMESTAMPTZ,
  parent_deal_id      UUID REFERENCES deals(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. JOB ORDERS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               UUID REFERENCES deals(id) ON DELETE CASCADE,
  jo_no                 TEXT,
  client                TEXT,
  ce_no                 TEXT,
  project_name          TEXT,
  value                 NUMERIC DEFAULT 0,
  award_trigger         TEXT,
  trigger_date          DATE,
  trigger_note          TEXT,
  pm1                   TEXT,
  pm2                   TEXT,
  pm3                   TEXT,
  coordinator           TEXT,
  ae_assigned           TEXT,
  start_date            DATE,
  comms_link            TEXT,
  scope_notes           TEXT,
  special_instructions  TEXT,
  designer              TEXT,
  location              TEXT,
  budget_status         TEXT DEFAULT 'QS Budget Pending',
  status                TEXT DEFAULT 'Active',
  issued_date           DATE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. BILLING MILESTONES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID REFERENCES deals(id) ON DELETE CASCADE,
  name          TEXT,
  description   TEXT,
  amount        NUMERIC DEFAULT 0,
  invoice_no    TEXT,
  invoice_date  DATE,
  due_date      DATE,
  status        TEXT DEFAULT 'Unpaid',
  created_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. BILLING PAYMENTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id  UUID REFERENCES billing_milestones(id) ON DELETE CASCADE,
  amount        NUMERIC DEFAULT 0,
  date          DATE,
  ref_no        TEXT,
  note          TEXT,
  recorded_by   TEXT,
  value_date    DATE,
  bank          TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  bounced       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. EXPENSES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID REFERENCES deals(id) ON DELETE SET NULL,
  date        DATE,
  category    TEXT,
  description TEXT,
  amount      NUMERIC DEFAULT 0,
  supplier    TEXT,
  receipt_no   TEXT,
  bank_account TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. INFLOWS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inflows (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id   UUID REFERENCES deals(id) ON DELETE SET NULL,
  date      DATE,
  amount    NUMERIC DEFAULT 0,
  source    TEXT,
  ref_no    TEXT,
  note      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. PURCHASE REQUESTS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID REFERENCES deals(id) ON DELETE SET NULL,
  item             TEXT,
  supplier         TEXT,
  qty              NUMERIC DEFAULT 0,
  unit             TEXT,
  estimated_cost   NUMERIC DEFAULT 0,
  actual_cost      NUMERIC DEFAULT 0,
  budget_category  TEXT,
  status           TEXT DEFAULT 'Pending Approval',
  qty_delivered    NUMERIC DEFAULT 0,
  delivery_date    DATE,
  dr_no            TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  po_number        TEXT DEFAULT '',
  po_date          DATE,
  delivery_note    TEXT DEFAULT '',
  requested_by     TEXT DEFAULT '',
  approved_by      TEXT DEFAULT '',
  project_name     TEXT DEFAULT '',
  po_discount_type  TEXT DEFAULT '',      -- '' | 'amt' | 'pct' (PO-level, duplicated per line)
  po_discount_value NUMERIC DEFAULT 0,
  -- Accounting/Finance pipeline (migration 012)
  acct_status        TEXT DEFAULT '',
  acct_notes         TEXT DEFAULT '',
  acct_checked_by    TEXT DEFAULT '',
  acct_checked_at    DATE,
  payment_bank       TEXT DEFAULT '',
  payment_ref        TEXT DEFAULT '',
  payment_ordered_by TEXT DEFAULT '',
  payment_ordered_at DATE
);

-- Atomic PO number allocator — claimed at submit time so concurrent
-- submits never share a PO number (see supabase_migration_009.sql).
CREATE TABLE IF NOT EXISTS po_counter (
  id      INT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0
);
INSERT INTO po_counter (id, last_no) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION next_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_used INT;
  new_no   INT;
BEGIN
  SELECT COALESCE(MAX(substring(po_number FROM '^PO-(\d+)$')::INT), 0)
    INTO max_used
    FROM purchase_requests
   WHERE po_number ~ '^PO-\d+$';

  UPDATE po_counter
     SET last_no = GREATEST(last_no, max_used) + 1
   WHERE id = 1
  RETURNING last_no INTO new_no;

  RETURN 'PO-' || lpad(new_no::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_po_number() TO anon, authenticated;

-- ── 8. MATERIAL REQUESTS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS material_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID REFERENCES deals(id) ON DELETE SET NULL,
  item             TEXT,
  category         TEXT,
  qty              NUMERIC DEFAULT 0,
  unit             TEXT,
  estimated_cost   NUMERIC DEFAULT 0,
  urgency          TEXT DEFAULT 'Normal',
  purpose          TEXT,
  notes            TEXT DEFAULT '',
  status           TEXT DEFAULT 'Submitted',
  submitted_by     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  status_changed_at DATE
);

-- ── 9. BUDGET REQUESTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
  title             TEXT,
  purpose           TEXT,
  amount            NUMERIC DEFAULT 0,
  urgency           TEXT DEFAULT 'Normal',
  date_needed       DATE,
  status            TEXT DEFAULT 'Pending',
  approved_by       TEXT,
  submitted_by      TEXT,
  category          TEXT,
  notes             TEXT DEFAULT '',
  released_by       TEXT DEFAULT '',
  released_at       DATE,
  status_changed_at DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. ADDENDA (CHANGE ORDERS) ───────────────────────────
CREATE TABLE IF NOT EXISTS addenda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID REFERENCES deals(id) ON DELETE CASCADE,
  title           TEXT,
  description     TEXT,
  value           NUMERIC DEFAULT 0,
  kind            TEXT DEFAULT 'Additive',      -- Additive | Deductive
  scope_items     JSONB DEFAULT '[]'::jsonb,    -- optional BOQ line items
  ce_no           TEXT,
  receipt_type    TEXT DEFAULT 'OR',
  withholding     BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'Discovered',
  sales_notified  BOOLEAN DEFAULT FALSE,
  discovered_by   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. SWATCHES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swatches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID REFERENCES deals(id) ON DELETE SET NULL,
  name                TEXT,
  category            TEXT,
  qty                 NUMERIC DEFAULT 0,
  unit                TEXT,
  supplier            TEXT,
  ref_link            TEXT,
  swatch_link         TEXT,
  status              TEXT DEFAULT 'To Buy',
  notes               TEXT,
  est_cost            NUMERIC DEFAULT 0,
  added_by            TEXT,
  client_approved_by  TEXT,
  client_approved_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 12. CHECKLISTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklists (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID REFERENCES deals(id) ON DELETE CASCADE,
  type                TEXT DEFAULT 'Task',
  title               TEXT,
  description         TEXT,
  status              TEXT DEFAULT 'Pending',
  assigned_to         TEXT,
  due_date            DATE,
  risk_note           TEXT,
  sort_order          INTEGER DEFAULT 0,
  dept                TEXT,
  priority            TEXT DEFAULT 'Normal',
  notes               TEXT,
  supplier            TEXT,
  created_by          TEXT,
  what_could_go_wrong TEXT,
  qty                 NUMERIC DEFAULT 0,
  unit                TEXT DEFAULT 'pcs',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 13. ACTIVITY LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id        TEXT PRIMARY KEY,
  deal_id   UUID REFERENCES deals(id) ON DELETE SET NULL,
  action    TEXT,
  detail    TEXT,
  by        TEXT,
  date      DATE,
  time      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 14. PROJECTS (full JSON blob per deal) ────────────────
--  Stores the entire project object as JSONB — progress, stage dates,
--  team, COC, warranty, materials, PM updates, design status, etc.
CREATE TABLE IF NOT EXISTS projects (
  deal_id     UUID PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 15. PROJECT CARDS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  client           TEXT,
  ce_no            TEXT,
  value            NUMERIC DEFAULT 0,
  award_date       DATE,
  target_days      INTEGER,
  target_end_date  DATE,
  tat_category     TEXT,
  tat_set_by       TEXT,
  tat_set_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 16. PROJECT CARD DEPARTMENT TASKS ─────────────────────
CREATE TABLE IF NOT EXISTS project_card_dept_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID REFERENCES project_cards(id) ON DELETE CASCADE,
  department  TEXT,
  task_text   TEXT,
  done        BOOLEAN DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  done_by     TEXT,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 17. PROJECT CARD DEPARTMENT STATUS ────────────────────
CREATE TABLE IF NOT EXISTS project_card_dept_status (
  card_id     UUID REFERENCES project_cards(id) ON DELETE CASCADE,
  department  TEXT,
  done        BOOLEAN DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  done_by     TEXT,
  PRIMARY KEY (card_id, department)
);

-- ── 18. PROJECT BUDGETS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS project_budgets (
  deal_id    UUID PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  materials  NUMERIC DEFAULT 0,
  labor      NUMERIC DEFAULT 0,
  overhead   NUMERIC DEFAULT 0,
  subcon     NUMERIC DEFAULT 0,
  notes      TEXT,
  set_by     TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 19. CASH POSITIONS (Daily Cash Tracker) ───────────────
CREATE TABLE IF NOT EXISTS cash_positions (
  date                   DATE PRIMARY KEY,
  bpi_beg                NUMERIC DEFAULT 0,
  bpi_book               NUMERIC DEFAULT 0,
  bpi_end                NUMERIC DEFAULT 0,
  metrobank_beg          NUMERIC DEFAULT 0,
  metrobank_book         NUMERIC DEFAULT 0,
  metrobank_end          NUMERIC DEFAULT 0,
  chinabank_beg          NUMERIC DEFAULT 0,
  chinabank_book         NUMERIC DEFAULT 0,
  chinabank_end          NUMERIC DEFAULT 0,
  bdo_beg                NUMERIC DEFAULT 0,
  bdo_book               NUMERIC DEFAULT 0,
  bdo_end                NUMERIC DEFAULT 0,
  secbank_beg            NUMERIC DEFAULT 0,
  secbank_book           NUMERIC DEFAULT 0,
  secbank_end            NUMERIC DEFAULT 0,
  unionbank_beg          NUMERIC DEFAULT 0,
  unionbank_book         NUMERIC DEFAULT 0,
  unionbank_end          NUMERIC DEFAULT 0,
  manual_collections     JSONB DEFAULT '[]',
  ytd_supplier_payable   NUMERIC DEFAULT 0,
  ytd_loans_payable      NUMERIC DEFAULT 0,
  notes                  TEXT,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── 20. DESIGN REQUEST FORMS (DRF) ───────────────────────
CREATE TABLE IF NOT EXISTS design_request_forms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID REFERENCES deals(id) ON DELETE SET NULL,
  drf_no           TEXT,
  client           TEXT,
  location         TEXT,
  designer         TEXT,
  design_deadline  DATE,
  project_title    TEXT,
  type             TEXT,
  size             TEXT,
  description      TEXT,
  accessories      JSONB DEFAULT '[]',
  ref_links        JSONB DEFAULT '[]',
  notes            TEXT,
  approved_link    TEXT,
  status           TEXT DEFAULT 'New',
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 21. INVENTORY ITEMS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT,
  name                TEXT,
  category            TEXT,
  sub_category        TEXT,
  brand               TEXT,
  supplier            TEXT,
  unit                TEXT,
  unit_size           TEXT,
  location            TEXT DEFAULT 'Main Warehouse',
  qty_on_hand         NUMERIC DEFAULT 0,
  reorder_point       NUMERIC DEFAULT 0,
  last_purchase_price NUMERIC DEFAULT 0,
  avg_cost            NUMERIC DEFAULT 0,
  last_updated        DATE,
  notes               TEXT,
  status              TEXT DEFAULT 'Active',
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 22. SUPPLIERS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name   TEXT,
  rating         TEXT,
  email          TEXT,
  materials      TEXT,
  contact_nos    TEXT,
  contact_person TEXT,
  payment_terms  TEXT,
  address        TEXT,
  tin_no         TEXT,
  notes          TEXT,
  status         TEXT DEFAULT 'Active',
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 23. SUBCONTRACTORS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcontractors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name         TEXT,
  rating               TEXT,
  specialty            TEXT,
  strengths_weaknesses TEXT,
  contact_no           TEXT,
  payment_terms        TEXT,
  address              TEXT,
  remarks              TEXT,
  rate_structure       TEXT,
  payment_structure    TEXT,
  location_note        TEXT,
  notes                TEXT,
  status               TEXT DEFAULT 'Active',
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 23b. SUBCON WORK ORDERS ───────────────────────────────
CREATE TABLE IF NOT EXISTS subcon_work_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number         TEXT DEFAULT '',
  deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
  project_name      TEXT DEFAULT '',
  subcontractor     TEXT DEFAULT '',
  specialty         TEXT DEFAULT '',
  scope_of_work     TEXT DEFAULT '',
  wo_date           DATE,
  start_date        DATE,
  target_end_date   DATE,
  contract_amount   NUMERIC DEFAULT 0,
  retention_pct     NUMERIC DEFAULT 0,
  payment_structure TEXT DEFAULT '',
  payment_terms     TEXT DEFAULT '',
  status            TEXT DEFAULT 'Issued',
  notes             TEXT DEFAULT '',
  requested_by      TEXT DEFAULT '',
  approved_by       TEXT DEFAULT '',
  -- Accounting/Finance pipeline (migration 012)
  acct_status        TEXT DEFAULT '',
  acct_notes         TEXT DEFAULT '',
  acct_checked_by    TEXT DEFAULT '',
  acct_checked_at    DATE,
  payment_bank       TEXT DEFAULT '',
  payment_ref        TEXT DEFAULT '',
  payment_ordered_by TEXT DEFAULT '',
  payment_ordered_at DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ
);

-- Atomic WO number allocator (see supabase_migration_011.sql)
CREATE TABLE IF NOT EXISTS wo_counter (
  id      INT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0
);
INSERT INTO wo_counter (id, last_no) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION next_wo_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_used INT;
  new_no   INT;
BEGIN
  SELECT COALESCE(MAX(substring(wo_number FROM '^WO-(\d+)$')::INT), 0)
    INTO max_used
    FROM subcon_work_orders
   WHERE wo_number ~ '^WO-\d+$';

  UPDATE wo_counter
     SET last_no = GREATEST(last_no, max_used) + 1
   WHERE id = 1
  RETURNING last_no INTO new_no;

  RETURN 'WO-' || lpad(new_no::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_wo_number() TO anon, authenticated;

-- ── 24. USER PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY,
  name          TEXT,
  full_name     TEXT,
  username      TEXT UNIQUE,
  role          TEXT DEFAULT 'Sales',
  title         TEXT,
  status        TEXT DEFAULT 'active',
  password_hash TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 25. APP SETTINGS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 26. PAYABLES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor      TEXT,
  amount      NUMERIC DEFAULT 0,
  due_date    DATE,
  project_id  UUID REFERENCES deals(id) ON DELETE SET NULL,
  category    TEXT DEFAULT 'Supplier',
  invoice_ref TEXT,
  notes       TEXT,
  status      TEXT DEFAULT 'Unpaid',
  paid_date   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  TEXT
);

-- ── 27. LOANS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender           TEXT,
  type             TEXT DEFAULT 'Bank Loan',
  principal        NUMERIC DEFAULT 0,
  disbursed_date   DATE,
  term_months      INTEGER,
  interest_rate    NUMERIC DEFAULT 0,
  monthly_payment  NUMERIC DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 28. LOAN PAYMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_payments (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id  UUID REFERENCES loans(id) ON DELETE CASCADE,
  amount   NUMERIC DEFAULT 0,
  date     DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 29. STOCK MOVEMENTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  move_type   TEXT,
  qty         NUMERIC DEFAULT 0,
  unit_cost   NUMERIC DEFAULT 0,
  deal_id     UUID REFERENCES deals(id) ON DELETE SET NULL,
  notes       TEXT,
  date        DATE,
  recorded_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 30. AE UPDATES (Sales daily updates) ──────────────────
CREATE TABLE IF NOT EXISTS ae_updates (
  id       TEXT PRIMARY KEY,
  by       TEXT,
  role     TEXT,
  date     DATE,
  time     TEXT,
  text     TEXT,
  deal_id  UUID REFERENCES deals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  ROW LEVEL SECURITY
--  Enable RLS on all tables, then allow both anon + authenticated roles
--  full access. FabHub uses its own username/password auth, not Supabase
--  Auth — the anon key is sufficient since the app is internal.
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
    'design_request_forms','design_requests','inventory_items','suppliers',
    'subcontractors','user_profiles','app_settings',
    'payables','loans','loan_payments','stock_movements','ae_updates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop old policy first if it exists, then recreate for both anon + authenticated
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "fabhub_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "fabhub_full_access" ON %I
       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- ============================================================
--  REALTIME
--  Enable realtime on tables that FabHub subscribes to live.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE
  billing_milestones,
  project_card_dept_tasks,
  project_card_dept_status,
  subcon_work_orders;

-- ============================================================
--  MIGRATIONS — run these if you have an existing database
-- ============================================================

-- 2026-06: Add note column to expenses (app uses note internally,
--          description is kept for backward compat)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS note TEXT;
-- Backfill: copy existing description into note
UPDATE expenses SET note = description WHERE note IS NULL AND description IS NOT NULL;

-- 2026-06: Fix RLS — update policy to allow anon + authenticated
-- (run the DO $$ block above to recreate all policies)

-- 2026-06: manual_collections + approved_payments in cash_positions
ALTER TABLE cash_positions
  DROP COLUMN IF EXISTS manual_collection_amt,
  DROP COLUMN IF EXISTS manual_collection_note,
  ADD COLUMN IF NOT EXISTS manual_collections JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approved_payments  JSONB DEFAULT '[]';

-- 2026-06: Per-milestone receipt type and withholding tax
ALTER TABLE billing_milestones ADD COLUMN IF NOT EXISTS receipt_type TEXT DEFAULT NULL;
ALTER TABLE billing_milestones ADD COLUMN IF NOT EXISTS withholding  BOOLEAN DEFAULT NULL;
-- NULL means "inherit from deal" (app falls back to deal.receipt_type / deal.withholding)

-- ============================================================
--  DONE.
-- ============================================================

-- 2026-06: expense → PO/WO payment tagging (migration 012)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_ref TEXT DEFAULT '';
