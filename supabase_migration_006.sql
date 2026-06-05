-- ============================================================
-- FabHub Migration 006 — merge Job Order fields into project_cards
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- WHY: Job Orders are being merged into Project Cards.
-- These fields were previously stored only on job_orders.
-- Moving them to project_cards makes it the single source
-- of truth for all project info, eliminating the need to
-- create a separate JO for every project.
-- ============================================================

ALTER TABLE project_cards
  ADD COLUMN IF NOT EXISTS project_ref          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS comms_link           TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scope_notes          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS special_instructions TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_date           TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS award_trigger        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_date         TEXT DEFAULT '';

-- Optional: copy existing JO data into project_cards for projects that already have a JO
-- Uncomment the block below if you want to migrate existing data from job_orders.
-- (Only runs where a matching project_card exists for the deal)

/*
UPDATE project_cards pc
SET
  project_ref          = COALESCE(NULLIF(pc.project_ref, ''),          jo.jo_no,             ''),
  comms_link           = COALESCE(NULLIF(pc.comms_link, ''),           jo.comms_link,        ''),
  scope_notes          = COALESCE(NULLIF(pc.scope_notes, ''),          jo.scope_notes,       ''),
  special_instructions = COALESCE(NULLIF(pc.special_instructions, ''), jo.special_instructions, ''),
  start_date           = COALESCE(NULLIF(pc.start_date, ''),           jo.start_date,        ''),
  award_trigger        = COALESCE(NULLIF(pc.award_trigger, ''),        jo.award_trigger,     ''),
  trigger_date         = COALESCE(NULLIF(pc.trigger_date, ''),         jo.trigger_date,      '')
FROM job_orders jo
WHERE jo.deal_id = pc.deal_id;
*/

SELECT 'Migration 006 applied — JO fields merged into project_cards' AS status;
