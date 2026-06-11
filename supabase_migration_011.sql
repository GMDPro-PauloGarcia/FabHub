-- ── Migration 011: Subcontractor Work Orders ─────────────────────────────────
-- Subcon engagements get their own document, separate from Purchase Orders:
-- scope of work, contract amount, retention, payment structure — pulled from
-- the Subcontractor Master. Contract amounts feed the project budget's
-- Subcon line (Cost Analysis / Budget views) the same way POs feed Materials.

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
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ
);

-- Atomic WO number allocator — same pattern as next_po_number (migration 009):
-- claimed at submit time so concurrent submits never share a WO number.
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

-- Live sync between devices (ignore if already added / publication absent)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE subcon_work_orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
