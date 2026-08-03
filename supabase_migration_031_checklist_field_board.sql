-- ── Migration 031: Field Board columns on checklists ────────────────────────
-- The Operations Director keeps a weekly "field board" — a per-day list of the
-- jobs coordinators are running, tagged by a top-level Type of Work code
-- (Installation / Repair / Punchlist / Construction) and a site location.
-- Historically this lived in a hand-made PowerPoint deck; it is now a native
-- view inside the Project Calendar (src/views/ConstructionCalendar.jsx),
-- driven by the same ops-event records the calendar already stores as
-- `checklists` rows with dept = 'Operations'.
--
-- Those two extra attributes have no home in the existing schema:
--   • category — one of I / R / P / C, the field board's colour-coded classifier
--   • location — the mall / site the job is at (e.g. "BGC", "Shangri-La Plaza")
--
-- The app already persists them locally (localStorage / IndexedDB keep arbitrary
-- fields on the record); these columns simply let the values round-trip through
-- Supabase like every other checklist attribute. Both are nullable free text so
-- existing rows and non-ops checklist items are unaffected.
--
-- Idempotent — safe to re-run.

ALTER TABLE checklists ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS location TEXT;
