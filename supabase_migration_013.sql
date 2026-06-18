-- ── Migration 013: Add approved_payments column to cash_positions ─────────────
-- The approved_payments column was missing from the original CREATE TABLE.
-- Without it, Finance's payment approvals were not persisted to Supabase
-- and would be lost on every page refresh.

ALTER TABLE cash_positions
  ADD COLUMN IF NOT EXISTS approved_payments JSONB DEFAULT '[]';
