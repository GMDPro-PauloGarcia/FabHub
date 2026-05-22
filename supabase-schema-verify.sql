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
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS ref_no      text DEFAULT '';
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS recorded_by text DEFAULT '';

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

-- ── 11. MATERIAL REQUESTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  item            text DEFAULT '',
  category        text DEFAULT '',
  qty             numeric DEFAULT 0,
  unit            text DEFAULT '',
  estimated_cost  numeric DEFAULT 0,
  urgency         text DEFAULT 'Normal',
  purpose         text DEFAULT '',
  status          text DEFAULT 'Submitted',
  submitted_by    text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS submitted_by text DEFAULT '';

-- ── 12. BUDGET REQUESTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  purpose       text DEFAULT '',
  amount        numeric DEFAULT 0,
  urgency       text DEFAULT 'Normal',
  date_needed   date,
  status        text DEFAULT 'Pending',
  approved_by   text DEFAULT '',
  submitted_by  text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS approved_by  text DEFAULT '';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS submitted_by text DEFAULT '';

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

-- ============================================================
-- ENABLE REALTIME ON ALL TABLES
-- ============================================================
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.job_orders;
alter publication supabase_realtime add table public.project_cards;
alter publication supabase_realtime add table public.project_card_dept_tasks;
alter publication supabase_realtime add table public.project_card_dept_status;
alter publication supabase_realtime add table public.billing_milestones;
alter publication supabase_realtime add table public.billing_payments;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.inflows;
alter publication supabase_realtime add table public.purchase_requests;
alter publication supabase_realtime add table public.material_requests;
alter publication supabase_realtime add table public.budget_requests;
alter publication supabase_realtime add table public.addenda;
alter publication supabase_realtime add table public.cash_positions;
alter publication supabase_realtime add table public.project_budgets;
alter publication supabase_realtime add table public.checklists;
alter publication supabase_realtime add table public.swatches;
alter publication supabase_realtime add table public.activity_log;
alter publication supabase_realtime add table public.user_profiles;

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
