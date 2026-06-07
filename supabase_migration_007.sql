-- ============================================================
-- FabHub Migration 007 — add missing deals columns
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- Adds columns that toSbDeal writes but were never in the schema:
--   location       — project site / address
--   added_by       — who created the deal
--   added_at       — when the deal was created
--   parent_deal_id — links an addendum/extension to its parent deal
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS location        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS added_by        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS added_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_deal_id  UUID REFERENCES deals(id) ON DELETE SET NULL;

-- Index for fast child-deal lookups
CREATE INDEX IF NOT EXISTS idx_deals_parent_deal_id ON deals(parent_deal_id);

SELECT 'Migration 007 applied — location, added_by, added_at, parent_deal_id added to deals' AS status;
