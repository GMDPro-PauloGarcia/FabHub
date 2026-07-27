-- ── Migration 028: add missing updated_at columns (kills "bad data" drops) ────
-- Root cause of a red "The server rejected a change (bad data)" toast when
-- editing an awarded deal (e.g. changing withholding tax on a project that has
-- a project card): sbUpdate() in src/supabaseClient.js stamps every UPDATE with
--   { ...data, updated_at: new Date().toISOString() }
-- but four tables it writes to never had an `updated_at` column. PostgREST then
-- returns PGRST204 ("Could not find the 'updated_at' column of '<table>' in the
-- schema cache"), which the app correctly classifies as a non-retryable 'data'
-- error and drops — firing the scary toast and silently losing the write.
--
-- Affected tables (confirmed against the live fabhub-gmd DB): project_cards,
-- checklists, addenda, project_card_dept_tasks. Every sbUpdate() to these was
-- failing — e.g. the turnover-date sync to the project card that runs on every
-- edit of an awarded deal, and checklist status toggles.
--
-- Adding the column makes those updates succeed on the first try and lets the
-- timestamp the app already sends actually land. DEFAULT now() matches the
-- convention on deals / billing_milestones / etc. Additive and idempotent —
-- safe to run multiple times.

ALTER TABLE public.project_cards
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.addenda
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.project_card_dept_tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

SELECT 'Migration 028 applied — updated_at added to project_cards, checklists, addenda, project_card_dept_tasks' AS status;
