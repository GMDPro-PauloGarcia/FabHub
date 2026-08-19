-- Migration 050: manual progress override on project cards
-- Adds an optional manual progress percentage (0-100) that overrides the
-- auto-computed department completion percentage on the Project Card.
-- NULL = use auto (departments done / 6). Set from the Project HQ detail view.

ALTER TABLE project_cards
  ADD COLUMN IF NOT EXISTS manual_progress smallint
  CHECK (manual_progress IS NULL OR (manual_progress >= 0 AND manual_progress <= 100));

COMMENT ON COLUMN project_cards.manual_progress IS
  'Optional PM-set progress override (0-100). NULL falls back to auto department completion %.';
