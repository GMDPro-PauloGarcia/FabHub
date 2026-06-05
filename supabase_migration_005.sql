-- ============================================================
-- FabHub Migration 005 — team columns on project_cards
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- WHY: PM/AE/Designer/Coordinator were stored only on the
-- job_orders table, so projects without a JO had no team info.
-- Moving these columns to project_cards makes Project Card the
-- single source of truth for team assignments, independent of
-- whether a JO has been issued.
-- ============================================================

ALTER TABLE project_cards
  ADD COLUMN IF NOT EXISTS ae_assigned  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pm1          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pm2          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pm3          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS designer     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS coordinator  TEXT DEFAULT '';

SELECT 'Migration 005 applied — team columns added to project_cards' AS status;
