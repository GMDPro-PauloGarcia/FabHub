-- ============================================================
-- FABHUB SUPABASE SCHEMA — VERIFY & PATCH
-- Run this in the Supabase SQL Editor.
-- Uses ADD COLUMN IF NOT EXISTS so it's safe to re-run.
-- ============================================================

-- ── 1. DEALS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ce_no           text,
  client          text,
  contact         text,
  ce_type         text,
  product         text,
  stage           text,
  priority        text DEFAULT 'Normal',
  sales_owner     text DEFAULT '',
  biz_dev_source  text DEFAULT '',
  date_acquired   date,
  due_date        date,
  value           numeric DEFAULT 0,
  invoiced        numeric DEFAULT 0,
  amount_paid     numeric DEFAULT 0,
  payment_status  text DEFAULT 'Unpaid',
  receipt_type    text DEFAULT 'OR',
  withholding     boolean DEFAULT false,
  comms_group     text DEFAULT '',
  sales_repo_link      text DEFAULT '',
  proposal_folder_link text DEFAULT '',
  notes           text DEFAULT '',
  probability     numeric DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS withholding     boolean DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS comms_group     text    DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sales_repo_link      text DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proposal_folder_link text DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS probability     numeric DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS biz_dev_source  text    DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- ── 2. JOB ORDERS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  jo_no                 text,
  client                text DEFAULT '',
  ce_no                 text DEFAULT '',
  project_name          text DEFAULT '',
  value                 numeric DEFAULT 0,
  award_trigger         text DEFAULT '',
  trigger_date          date,
  trigger_note          text DEFAULT '',
  pm1                   text DEFAULT '',
  pm2                   text DEFAULT '',
  pm3                   text DEFAULT '',
  coordinator           text DEFAULT '',
  ae_assigned           text DEFAULT '',
  start_date            date,
  comms_link            text DEFAULT '',
  scope_notes           text DEFAULT '',
  special_instructions  text DEFAULT '',
  budget_status         text DEFAULT 'QS Budget Pending',
  status                text DEFAULT 'Active',
  issued_date           date,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS trigger_note         text DEFAULT '';
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS ae_assigned          text DEFAULT '';
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS special_instructions text DEFAULT '';
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS budget_status        text DEFAULT 'QS Budget Pending';

-- ── 3. PROJECT CARDS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  client          text DEFAULT '',
  ce_no           text DEFAULT '',
  stage           text DEFAULT '',
  award_date      date,
  target_days     integer,
  target_end_date date,
  tat_category    text DEFAULT '',
  tat_set_by      text DEFAULT '',
  tat_set_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS award_date      date;
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS target_days     integer;
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS target_end_date date;
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS tat_category    text DEFAULT '';
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS tat_set_by      text DEFAULT '';
ALTER TABLE public.project_cards ADD COLUMN IF NOT EXISTS tat_set_at      timestamptz;

-- ── 4. PROJECT CARD DEPT TASKS ────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_card_dept_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid REFERENCES public.project_cards(id) ON DELETE CASCADE,
  department  text,
  task_text   text DEFAULT '',
  done        boolean DEFAULT false,
  done_at     timestamptz,
  done_by     text DEFAULT '',
  sort_order  integer DEFAULT 0
);

-- ── 5. PROJECT CARD DEPT STATUS ───────────────────────────
CREATE TABLE IF NOT EXISTS public.project_card_dept_status (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid REFERENCES public.project_cards(id) ON DELETE CASCADE,
  department  text,
  done        boolean DEFAULT false,
  done_at     timestamptz,
  done_by     text DEFAULT ''
);

-- ── 6. BILLING MILESTONES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  name          text DEFAULT '',
  description   text DEFAULT '',
  amount        numeric DEFAULT 0,
  invoice_no    text DEFAULT '',
  invoice_date  date,
  due_date      date,
  status        text DEFAULT 'Draft',
  created_by    text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.billing_milestones ADD COLUMN IF NOT EXISTS invoice_no   text DEFAULT '';
ALTER TABLE public.billing_milestones ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE public.billing_milestones ADD COLUMN IF NOT EXISTS created_by   text DEFAULT '';

-- ── 7. BILLING PAYMENTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id  uuid REFERENCES public.billing_milestones(id) ON DELETE CASCADE,
  amount        numeric DEFAULT 0,
  date          date,
  ref_no        text DEFAULT '',
  note          text DEFAULT '',
  recorded_by   text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS ref_no         text DEFAULT '';
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS recorded_by    text DEFAULT '';
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS value_date     date;
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS bank           text DEFAULT '';
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS payment_method text DEFAULT '';
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS bounced        boolean DEFAULT false;

-- ── 8. EXPENSES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  date        date,
  category    text DEFAULT '',
  description text DEFAULT '',
  amount      numeric DEFAULT 0,
  supplier    text DEFAULT '',
  receipt_no  text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS supplier   text DEFAULT '';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_no text DEFAULT '';

-- ── 9. INFLOWS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inflows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  date       date,
  amount     numeric DEFAULT 0,
  source     text DEFAULT '',
  ref_no     text DEFAULT '',
  note       text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inflows ADD COLUMN IF NOT EXISTS ref_no text DEFAULT '';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS po_ref text DEFAULT '';

-- ── 10. PURCHASE REQUESTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  item            text DEFAULT '',
  supplier        text DEFAULT '',
  qty             numeric DEFAULT 0,
  unit            text DEFAULT '',
  estimated_cost  numeric DEFAULT 0,
  actual_cost     numeric DEFAULT 0,
  budget_category text DEFAULT '',
  status          text DEFAULT 'Pending Approval',
  qty_delivered   numeric DEFAULT 0,
  delivery_date   date,
  dr_no           text DEFAULT '',
  notes           text DEFAULT '',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS actual_cost     numeric DEFAULT 0;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS budget_category text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS qty_delivered   numeric DEFAULT 0;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS delivery_date   date;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS dr_no           text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS created_by      text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS po_number       text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS po_date         date;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS delivery_note   text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS requested_by    text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS approved_by     text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS project_name    text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS po_discount_type  text    DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS po_discount_value numeric DEFAULT 0;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS acct_status        text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS acct_notes         text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS acct_checked_by    text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS acct_checked_at    date;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_bank       text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_ref        text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_ordered_by text DEFAULT '';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_ordered_at date;

-- Atomic PO number allocator (see supabase_migration_009.sql)
CREATE TABLE IF NOT EXISTS public.po_counter (
  id      int PRIMARY KEY,
  last_no int NOT NULL DEFAULT 0
);
INSERT INTO public.po_counter (id, last_no) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_used int;
  new_no   int;
BEGIN
  SELECT COALESCE(MAX(substring(po_number FROM '^PO-(\d+)$')::int), 0)
    INTO max_used
    FROM purchase_requests
   WHERE po_number ~ '^PO-\d+$';

  UPDATE po_counter
     SET last_no = GREATEST(last_no, max_used) + 1
   WHERE id = 1
  RETURNING last_no INTO new_no;

  RETURN 'PO-' || lpad(new_no::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_po_number() TO anon, authenticated;

-- ── 11. MATERIAL REQUESTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  item              text DEFAULT '',
  category          text DEFAULT '',
  qty               numeric DEFAULT 0,
  unit              text DEFAULT '',
  estimated_cost    numeric DEFAULT 0,
  urgency           text DEFAULT 'Normal',
  purpose           text DEFAULT '',
  notes             text DEFAULT '',
  status            text DEFAULT 'Submitted',
  submitted_by      text DEFAULT '',
  created_at        timestamptz DEFAULT now(),
  status_changed_at date
);
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS submitted_by      text DEFAULT '';
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS notes             text DEFAULT '';
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS status_changed_at date;

-- ── 12. BUDGET REQUESTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  title             text DEFAULT '',
  purpose           text DEFAULT '',
  amount            numeric DEFAULT 0,
  urgency           text DEFAULT 'Normal',
  date_needed       date,
  status            text DEFAULT 'Pending',
  approved_by       text DEFAULT '',
  submitted_by      text DEFAULT '',
  category          text DEFAULT '',
  notes             text DEFAULT '',
  released_by       text DEFAULT '',
  released_at       date,
  status_changed_at date,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS approved_by       text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS submitted_by      text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS title             text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS category          text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS notes             text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS released_by       text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS released_at       date;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS status_changed_at date;

-- ── 13. ADDENDA ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addenda (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  title           text DEFAULT '',
  description     text DEFAULT '',
  value           numeric DEFAULT 0,
  ce_no           text DEFAULT '',
  receipt_type    text DEFAULT 'OR',
  withholding     boolean DEFAULT false,
  status          text DEFAULT 'Discovered',
  sales_notified  boolean DEFAULT false,
  discovered_by   text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.addenda ADD COLUMN IF NOT EXISTS ce_no          text    DEFAULT '';
ALTER TABLE public.addenda ADD COLUMN IF NOT EXISTS receipt_type   text    DEFAULT 'OR';
ALTER TABLE public.addenda ADD COLUMN IF NOT EXISTS withholding     boolean DEFAULT false;
ALTER TABLE public.addenda ADD COLUMN IF NOT EXISTS sales_notified  boolean DEFAULT false;
ALTER TABLE public.addenda ADD COLUMN IF NOT EXISTS discovered_by   text    DEFAULT '';

-- ── 14. CASH POSITIONS ────────────────────────────────────
-- PK is date (one row per day). No uuid column.
CREATE TABLE IF NOT EXISTS public.cash_positions (
  date            date PRIMARY KEY,
  bpi_end         numeric DEFAULT 0,
  metrobank_end   numeric DEFAULT 0,
  chinabank_end   numeric DEFAULT 0,
  bdo_end         numeric DEFAULT 0,
  secbank_end     numeric DEFAULT 0,
  unionbank_end   numeric DEFAULT 0,
  notes           text DEFAULT '',
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS bpi_end       numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS metrobank_end numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS chinabank_end numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS bdo_end       numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS secbank_end   numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS unionbank_end numeric DEFAULT 0;
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS notes         text    DEFAULT '';
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS manual_collections   jsonb DEFAULT '[]';
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS manual_disbursements jsonb DEFAULT '[]';
ALTER TABLE public.cash_positions ADD COLUMN IF NOT EXISTS floating_checks      jsonb DEFAULT '[]';

-- ── 15. PROJECT BUDGETS ───────────────────────────────────
-- PK is deal_id (one budget per project).
CREATE TABLE IF NOT EXISTS public.project_budgets (
  deal_id    uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  materials  numeric DEFAULT 0,
  labor      numeric DEFAULT 0,
  overhead   numeric DEFAULT 0,
  subcon     numeric DEFAULT 0,
  notes      text DEFAULT '',
  set_by     text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_budgets ADD COLUMN IF NOT EXISTS subcon     numeric DEFAULT 0;
ALTER TABLE public.project_budgets ADD COLUMN IF NOT EXISTS set_by     text    DEFAULT '';
ALTER TABLE public.project_budgets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── 16. CHECKLISTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checklists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  type         text DEFAULT 'Task',
  title        text DEFAULT '',
  description  text DEFAULT '',
  status       text DEFAULT 'Pending',
  assigned_to  text DEFAULT '',
  due_date     date,
  risk_note    text DEFAULT '',
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS risk_note   text    DEFAULT '';
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS sort_order  integer DEFAULT 0;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS assigned_to text    DEFAULT '';

-- ── 17. SWATCHES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swatches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  name       text DEFAULT '',
  category   text DEFAULT '',
  qty        numeric DEFAULT 0,
  unit       text DEFAULT '',
  supplier   text DEFAULT '',
  ref_link   text DEFAULT '',
  status     text DEFAULT 'To Buy',
  notes      text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.swatches ADD COLUMN IF NOT EXISTS ref_link text DEFAULT '';

-- ── 18. ACTIVITY LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  action     text DEFAULT '',
  detail     text DEFAULT '',
  by         text DEFAULT '',
  date       date,
  time       text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 19. USER PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text UNIQUE,
  full_name   text DEFAULT '',
  role        text DEFAULT '',
  title       text DEFAULT '',
  status      text DEFAULT 'active',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS title  text DEFAULT '';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- ============================================================
-- DISABLE ROW LEVEL SECURITY (already in your saved query)
-- ============================================================
alter table public.deals                    disable row level security;
alter table public.job_orders               disable row level security;
alter table public.project_cards            disable row level security;
alter table public.project_card_dept_tasks  disable row level security;
alter table public.project_card_dept_status disable row level security;
alter table public.billing_milestones       disable row level security;
alter table public.billing_payments         disable row level security;
alter table public.expenses                 disable row level security;
alter table public.inflows                  disable row level security;
alter table public.purchase_requests        disable row level security;
alter table public.material_requests        disable row level security;
alter table public.budget_requests          disable row level security;
alter table public.addenda                  disable row level security;
alter table public.cash_positions           disable row level security;
alter table public.project_budgets          disable row level security;
alter table public.checklists               disable row level security;
alter table public.swatches                 disable row level security;
alter table public.activity_log             disable row level security;
alter table public.user_profiles            disable row level security;

-- ── SUPPLIERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating          text DEFAULT '',
  company_name    text DEFAULT '',
  email           text DEFAULT '',
  materials       text DEFAULT '',
  contact_nos     text DEFAULT '',
  contact_person  text DEFAULT '',
  payment_terms   text DEFAULT '',
  address         text DEFAULT '',
  tin_no          text DEFAULT '',
  notes           text DEFAULT '',
  status          text DEFAULT 'Active',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
alter table public.suppliers disable row level security;

-- ── SUBCONTRACTORS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating               text DEFAULT '',
  specialty            text DEFAULT '',
  strengths_weaknesses text DEFAULT '',
  contact_no           text DEFAULT '',
  company_name         text DEFAULT '',
  payment_terms        text DEFAULT '',
  address              text DEFAULT '',
  remarks              text DEFAULT '',
  rate_structure       text DEFAULT '',
  payment_structure    text DEFAULT '',
  location_note        text DEFAULT '',
  notes                text DEFAULT '',
  status               text DEFAULT 'Active',
  created_by           text DEFAULT '',
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
alter table public.subcontractors disable row level security;

-- ── SUBCON WORK ORDERS (see supabase_migration_011.sql) ───
CREATE TABLE IF NOT EXISTS public.subcon_work_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number         text DEFAULT '',
  deal_id           uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  project_name      text DEFAULT '',
  subcontractor     text DEFAULT '',
  specialty         text DEFAULT '',
  scope_of_work     text DEFAULT '',
  wo_date           date,
  start_date        date,
  target_end_date   date,
  contract_amount   numeric DEFAULT 0,
  retention_pct     numeric DEFAULT 0,
  payment_structure text DEFAULT '',
  payment_terms     text DEFAULT '',
  status            text DEFAULT 'Issued',
  notes             text DEFAULT '',
  requested_by      text DEFAULT '',
  approved_by       text DEFAULT '',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz
);
alter table public.subcon_work_orders disable row level security;
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS acct_status        text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS acct_notes         text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS acct_checked_by    text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS acct_checked_at    date;
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS payment_bank       text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS payment_ref        text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS payment_ordered_by text DEFAULT '';
ALTER TABLE public.subcon_work_orders ADD COLUMN IF NOT EXISTS payment_ordered_at date;

CREATE TABLE IF NOT EXISTS public.wo_counter (
  id      int PRIMARY KEY,
  last_no int NOT NULL DEFAULT 0
);
INSERT INTO public.wo_counter (id, last_no) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_wo_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_used int;
  new_no   int;
BEGIN
  SELECT COALESCE(MAX(substring(wo_number FROM '^WO-(\d+)$')::int), 0)
    INTO max_used
    FROM subcon_work_orders
   WHERE wo_number ~ '^WO-\d+$';

  UPDATE wo_counter
     SET last_no = GREATEST(last_no, max_used) + 1
   WHERE id = 1
  RETURNING last_no INTO new_no;

  RETURN 'WO-' || lpad(new_no::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_wo_number() TO anon, authenticated;

-- ============================================================
-- ENABLE REALTIME ON ALL TABLES (skips tables already added)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'deals','job_orders','project_cards','project_card_dept_tasks',
    'project_card_dept_status','billing_milestones','billing_payments',
    'expenses','inflows','purchase_requests','material_requests',
    'budget_requests','addenda','cash_positions','project_budgets',
    'checklists','swatches','activity_log','user_profiles',
    'suppliers','subcontractors','subcon_work_orders'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already a member, skip silently
    END;
  END LOOP;
END $$;

-- ============================================================
-- VERIFY: list all tables and column counts
-- Run this after the above to confirm everything is in place.
-- ============================================================
SELECT
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'deals','job_orders','project_cards','project_card_dept_tasks',
    'project_card_dept_status','billing_milestones','billing_payments',
    'expenses','inflows','purchase_requests','material_requests',
    'budget_requests','addenda','cash_positions','project_budgets',
    'checklists','swatches','activity_log','user_profiles'
  )
GROUP BY table_name
ORDER BY table_name;

-- ── APP SETTINGS (bot tokens, system config) ──────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- ── DESIGN REQUESTS (DRFs) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  drf_no          text DEFAULT '',
  client          text DEFAULT '',
  location        text DEFAULT '',
  designer        text DEFAULT '',
  design_deadline date,
  project_title   text DEFAULT '',
  type            text DEFAULT '',
  size            text DEFAULT '',
  description     text DEFAULT '',
  accessories     jsonb DEFAULT '[]',
  ref_links       jsonb DEFAULT '[]',
  notes           text DEFAULT '',
  approved_link   text DEFAULT '',
  status          text DEFAULT 'New',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── INVENTORY ITEMS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE,
  name                text DEFAULT '',
  category            text DEFAULT '',
  sub_category        text DEFAULT '',
  brand               text DEFAULT '',
  supplier            text DEFAULT '',
  unit                text DEFAULT '',
  unit_size           text DEFAULT '',
  location            text DEFAULT 'Main Warehouse',
  qty_on_hand         numeric DEFAULT 0,
  reorder_point       numeric DEFAULT 0,
  last_purchase_price numeric DEFAULT 0,
  avg_cost            numeric DEFAULT 0,
  last_updated        date,
  notes               text DEFAULT '',
  status              text DEFAULT 'Active',
  created_by          text DEFAULT '',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── STOCK MOVEMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  move_type   text DEFAULT '',
  qty         numeric DEFAULT 0,
  unit_cost   numeric DEFAULT 0,
  deal_id     uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  notes       text DEFAULT '',
  date        date DEFAULT CURRENT_DATE,
  recorded_by text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

-- ── PROJECTS (stage, progress, team, PM data) ─────────────
CREATE TABLE IF NOT EXISTS public.projects (
  deal_id    uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
