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
  receipt_no  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
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
  project_name     TEXT DEFAULT ''
);

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
  ce_no           TEXT,
  receipt_type    TEXT DEFAULT 'OR',
  withholding     BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'Discovered',
  sales_notified  BOOLEAN DEFAULT FALSE,
  discovered_by   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. SWATCHES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swatches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID REFERENCES deals(id) ON DELETE SET NULL,
  name        TEXT,
  category    TEXT,
  qty         NUMERIC DEFAULT 0,
  unit        TEXT,
  supplier    TEXT,
  ref_link    TEXT,
  swatch_link TEXT,
  status      TEXT DEFAULT 'To Buy',
  notes       TEXT,
  est_cost    NUMERIC DEFAULT 0,
  added_by    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 12. CHECKLISTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID REFERENCES deals(id) ON DELETE CASCADE,
  type        TEXT DEFAULT 'Task',
  title       TEXT,
  description TEXT,
  status      TEXT DEFAULT 'Pending',
  assigned_to TEXT,
  due_date    DATE,
  risk_note   TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
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
  created_at       TIMESTAMPTZ DEFAULT NOW()
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
  sort_order  INTEGER DEFAULT 0
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
  date             DATE PRIMARY KEY,
  bpi_end          NUMERIC DEFAULT 0,
  metrobank_end    NUMERIC DEFAULT 0,
  chinabank_end    NUMERIC DEFAULT 0,
  bdo_end          NUMERIC DEFAULT 0,
  secbank_end      NUMERIC DEFAULT 0,
  unionbank_end    NUMERIC DEFAULT 0,
  notes            TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
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

-- ── 24. USER PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  username   TEXT UNIQUE,
  role       TEXT DEFAULT 'Sales',
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 25. APP SETTINGS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  ROW LEVEL SECURITY
--  Enable RLS on all tables, then allow authenticated users
--  full access. Adjust per-role policies as needed.
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
    'design_request_forms','inventory_items','suppliers',
    'subcontractors','user_profiles','app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop policy first if it exists, then recreate
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I
       FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
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
  project_card_dept_status;

-- ============================================================
--  DONE. All 25 tables created.
-- ============================================================
