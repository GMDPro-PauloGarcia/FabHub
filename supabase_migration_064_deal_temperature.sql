-- Migration 064: Pipeline temperature on deals (Hot / Almost Awarded / Cold)
-- A MANUAL sales classification set by dragging a deal between the three pipeline
-- board columns — the team's read on how hot/close a deal is, independent of the
-- workflow stage. NULL means "not set": the UI derives a sensible default from
-- award status / stage / acquisition age (see deriveTemp in src/core.js) so the
-- board is never empty. Once a human drags a card, this column wins and age no
-- longer moves it.
--
-- No default and nullable on purpose: existing rows stay NULL and keep deriving
-- their bucket from age, so nothing is silently re-classified by this migration.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS temperature text
  CHECK (temperature IS NULL OR temperature IN ('Hot','Almost Awarded','Cold'));

COMMENT ON COLUMN deals.temperature IS
  'Manual sales-pipeline temperature: "Hot", "Almost Awarded", or "Cold" (set by dragging the deal between board columns). NULL = unset; the UI derives a default from award/stage/age. Independent of the workflow stage.';
