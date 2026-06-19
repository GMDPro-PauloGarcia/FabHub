-- ── Migration 014: check_vouchers table + expense accounting columns ──────────
-- Fixes three gaps identified in the schema audit:
--   1. check_vouchers table was missing entirely (sbUpsert calls were silently
--      failing for any Supabase-enabled user routing expenses to Check payment).
--   2. expenses table was missing all accounting-lifecycle columns — acct_status,
--      payment_method, payable_id, cv_id, routed_by/at, qty, price_per_qty,
--      tin, remarks — so they were only persisted locally and lost on sync.
--   3. payables table had no back-reference to the source expense.

-- ── 1. check_vouchers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS check_vouchers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_no         TEXT        NOT NULL DEFAULT '',
  date          DATE,
  payee         TEXT        DEFAULT '',
  amount        NUMERIC     DEFAULT 0,
  description   TEXT        DEFAULT '',
  project_id    UUID        REFERENCES deals(id) ON DELETE SET NULL,
  bank          TEXT        DEFAULT '',
  notes         TEXT        DEFAULT '',
  status        TEXT        DEFAULT 'Draft',
  released_by   TEXT,
  released_date DATE,
  created_by    TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  po_ref        TEXT        DEFAULT '',
  payable_id    UUID,
  check_no      TEXT        DEFAULT '',
  cleared_date  DATE,
  is_cleared    BOOLEAN     DEFAULT FALSE
);

-- ── 2. expenses — accounting lifecycle columns ────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS acct_status    TEXT        DEFAULT 'Logged',
  ADD COLUMN IF NOT EXISTS payment_method TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS payable_id     UUID,
  ADD COLUMN IF NOT EXISTS cv_id          UUID,
  ADD COLUMN IF NOT EXISTS routed_by      TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS routed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_date   DATE,
  ADD COLUMN IF NOT EXISTS qty            NUMERIC     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_per_qty  NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tin            TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS remarks        TEXT        DEFAULT '';

-- Backfill: existing rows without an acct_status get 'Logged'
UPDATE expenses SET acct_status = 'Logged' WHERE acct_status IS NULL OR acct_status = '';

-- ── 3. payables — back-reference to source expense ────────────────────────────
ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS expense_id UUID;
