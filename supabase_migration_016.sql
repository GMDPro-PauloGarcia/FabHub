-- ── Migration 016: Add warehouse_only column to project_cards ────────────────
-- The "Edit Team" form on the Project Card (Project Team section) has always
-- had a "📦 Warehouse / Procurement Only" checkbox that saves warehouseOnly on
-- the project card. But the column was never added to project_cards, so the
-- sbUpsert('project_cards', {...warehouse_only:...}) call on every Save Team
-- fails with a "column does not exist" error. That error is swallowed by a
-- .catch, so the toast still says "Team saved" and local state updates fine —
-- but the flag never reaches Supabase, so it's lost on reload / for teammates
-- on another device. Same class of bug as migrations 013 and 015.

ALTER TABLE project_cards
  ADD COLUMN IF NOT EXISTS warehouse_only BOOLEAN DEFAULT false;
