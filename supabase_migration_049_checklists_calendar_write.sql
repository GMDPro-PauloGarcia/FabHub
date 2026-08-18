-- ── Migration 049: let any signed-in user add/edit calendar & checklist items ─
-- Symptom (reported 2026-08-18): coordinators could not create Construction
-- Calendar activities. The UI toast read:
--   "new row violates row-level security policy for table checklists"
--
-- Cause: the Construction Calendar (src/views/ConstructionCalendar.jsx via
-- addOpsEvent/updateOpsEvent in src/App.jsx) stores every calendar activity as a
-- row in `checklists` (dept = 'Operations'). But migration 037 gated checklists
-- INSERT/UPDATE to just ['Manager','ProjectMover']. So anyone whose minted role
-- isn't one of those — e.g. Jessica Castro (SalesOpsAdmin), and Sales / Design /
-- Finance / Procurement / QS / Warehouse / Accounting — had every calendar
-- insert rejected by RLS. (Operations users still worked only because
-- mint-session remaps Operations → ProjectMover.)
--
-- Fix: `checklists` is a shared operational board. Its SELECT is already open to
-- every authenticated user (sel = AUTH), and the calendar is meant to be a
-- collaborative planning surface, so INSERT and UPDATE are opened to any
-- signed-in user (is_user()). DELETE stays Manager-only, unchanged.
--
-- This mirrors the migration-037 generator output for a table whose ins/upd are
-- "AUTH" (predicate public.is_user()). Migration 037's spec has been updated to
-- match so a fresh replay lands in the same final state.

alter table public.checklists enable row level security;

drop policy if exists checklists_ins on public.checklists;
create policy checklists_ins on public.checklists
  for insert to authenticated with check ( public.is_user() );

drop policy if exists checklists_upd on public.checklists;
create policy checklists_upd on public.checklists
  for update to authenticated using ( public.is_user() ) with check ( public.is_user() );

-- checklists_sel (AUTH) and checklists_del (Manager) are intentionally unchanged.
