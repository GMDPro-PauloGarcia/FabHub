-- ============================================================
-- FabHub Migration 004 — ae_updates table
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- WHY: AE Updates were localStorage-only, so posts from one
-- device never appeared on other devices. This table makes
-- them sync across all devices in real-time.
-- ============================================================

CREATE TABLE IF NOT EXISTS ae_updates (
  id         TEXT PRIMARY KEY,
  by         TEXT NOT NULL DEFAULT '',
  role       TEXT DEFAULT 'Sales',
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  text       TEXT NOT NULL,
  deal_id    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE ae_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_full_access" ON ae_updates;
CREATE POLICY "anon_full_access" ON ae_updates
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_full_access" ON ae_updates;
CREATE POLICY "authenticated_full_access" ON ae_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable real-time so all devices see new posts instantly
ALTER PUBLICATION supabase_realtime ADD TABLE ae_updates;

SELECT 'Migration 004 applied — ae_updates table ready' AS status;
