-- ── Migration 066: inflows.source / inflows.note ─────────────────────────────
-- The app writes and reads inflows.source and inflows.note (see App.jsx inflow
-- upserts and the load mapper that spreads the row back), but the inflows table
-- was created with a `description` column instead. Every inflow upsert therefore
-- failed on the unknown `source` column and zero cash inflows ever synced to the
-- server. Add the columns the app actually uses.
--
-- Additive and idempotent — safe to run multiple times.

ALTER TABLE public.inflows
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS note   TEXT;

SELECT 'Migration 066 applied — inflows.source / inflows.note added' AS status;
