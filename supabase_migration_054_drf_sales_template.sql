-- ── Migration 054: DRF Sales-brief template fields ───────────────────────────
-- The Design team asked that the Sales Department supply a fuller brief on every
-- Design Request Form (DRF): project category (Kiosk / In-line / Event / Other),
-- with/without platform, ideal finishes, maximum height, a brand-guideline link,
-- and an optional budget. These map to new columns on design_request_forms so
-- the values sync instead of living only in the free-text notes field.
--
-- Additive and idempotent — safe to run multiple times. Existing rows get NULLs,
-- which the app renders as blank ("—") in the DRF detail panel.

ALTER TABLE public.design_request_forms
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS platform         TEXT,
  ADD COLUMN IF NOT EXISTS finishes         TEXT,
  ADD COLUMN IF NOT EXISTS max_height       TEXT,
  ADD COLUMN IF NOT EXISTS brand_guide_link TEXT,
  ADD COLUMN IF NOT EXISTS budget           TEXT;

SELECT 'Migration 054 applied — DRF sales-template columns added to design_request_forms' AS status;
