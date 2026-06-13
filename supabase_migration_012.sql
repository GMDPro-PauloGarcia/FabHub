-- ── Migration 012: CE/QS Cost Estimation Request Queue ──────────────────────
-- Centralises incoming cost estimation requests from Sales to the CE/QS team.
-- Tracks status (Pending → Ongoing → Done), bid outcomes, and win/loss data.

CREATE TABLE IF NOT EXISTS ce_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name         TEXT NOT NULL DEFAULT '',
  project_name        TEXT DEFAULT '',
  location            TEXT DEFAULT '',
  project_type        TEXT DEFAULT 'retail',
  priority            TEXT DEFAULT 'Normal',
  status              TEXT DEFAULT 'Pending',
  submitted_by        TEXT DEFAULT '',
  target_deadline     DATE,
  submission_deadline DATE,
  target_budget       NUMERIC DEFAULT 0,
  target_margin       NUMERIC DEFAULT 0,
  plans_link          TEXT DEFAULT '',
  skp_link            TEXT DEFAULT '',
  schedule_of_finish  TEXT DEFAULT '',
  notes               TEXT DEFAULT '',
  ce_notes            TEXT DEFAULT '',
  bid_amount          NUMERIC,
  bid_margin_pct      NUMERIC,
  awarded             TEXT DEFAULT 'Pending',
  award_date          DATE,
  deal_id             TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ce_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ce_requests_open" ON ce_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ce_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
