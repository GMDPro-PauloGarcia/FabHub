-- ── Migration 027: add ACTUAL FINISH DATE to deals ───────────────────────────
-- Why: projects need to record the real on-site completion date, separate from
-- the client turnover date (which is the promised/target date stored on
-- project_cards.target_end_date). This column captures when a project was
-- actually finished.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS actual_finish_date DATE;
