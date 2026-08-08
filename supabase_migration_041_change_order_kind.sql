-- ============================================================
-- FabHub Migration 041 — additive / deductive change orders
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- A change order (addendum) now carries a direction and optional scope
-- line items so it can flow additively OR deductively into the project's
-- contract value, BOQ, and billing — instead of requiring a whole new deal.
--   kind        — 'Additive' (adds scope/value) | 'Deductive' (credit / descope)
--   scope_items — optional BOQ line items {description, qty, unit, rate}
--                 that flow into deal.boq_data when the CO is approved
-- ============================================================

ALTER TABLE addenda
  ADD COLUMN IF NOT EXISTS kind        TEXT  DEFAULT 'Additive',
  ADD COLUMN IF NOT EXISTS scope_items JSONB DEFAULT '[]'::jsonb;

-- Backfill: everything that predates this migration was additive.
UPDATE addenda SET kind = 'Additive' WHERE kind IS NULL;

SELECT 'Migration 041 applied — kind, scope_items added to addenda' AS status;
