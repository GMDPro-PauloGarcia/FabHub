-- ============================================================
-- FabHub Migration 001 — Schema gap fixes
-- Run this in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- ── CHECKLISTS: add fields used by the app but missing from schema ──
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS dept              TEXT,
  ADD COLUMN IF NOT EXISTS priority          TEXT DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS supplier          TEXT,
  ADD COLUMN IF NOT EXISTS created_by        TEXT,
  ADD COLUMN IF NOT EXISTS what_could_go_wrong TEXT,
  ADD COLUMN IF NOT EXISTS qty               NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit              TEXT DEFAULT 'pcs';

-- ── SWATCHES: add client approval tracking fields ──
ALTER TABLE swatches
  ADD COLUMN IF NOT EXISTS client_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;

-- ── MATERIAL REQUESTS: add created_by for audit trail ──
ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ── Done ──
SELECT 'Migration 001 applied successfully' AS status;
