-- ── Migration 028: fix AE Updates access (ae_updates) ────────────────────────
-- Bug: an AE (Sales) posts an "AE Update" on the Pipeline → AE Updates tab, but
-- nobody else — not even a Manager — can see it. Root cause: migration 024 set
-- the ae_updates RLS to Manager/ProjectMover only for SELECT *and* INSERT, but
-- the feature is authored by Sales AEs (and also Finance/QS, who reach the tab
-- via the pipeline page) and consumed by the whole management/ops group. A Sales
-- INSERT is therefore rejected by RLS; the app swallows the error
-- (sbInsert(...).catch(()=>{})) and the row lives only in the author's local
-- IndexedDB cache, so it never reaches Supabase and no one else ever sees it.
-- SELECT excluding Sales also means Sales can't load AE updates from the server.
--
-- Fix: align ae_updates SELECT/INSERT/DELETE with the app's own consumer list
-- (RT_SUB_ROLES.ae_updates in src/App.jsx = Manager, Sales, Finance, QS,
-- Operations, Design; "Operations" maps to ProjectMover per ACCESS_MATRIX
-- decision #1). DELETE is broadened to the same set so an author can remove
-- their own update — the UI already limits the ✕ button to the author or a
-- Manager. UPDATE stays Manager/ProjectMover (the app has no edit path for
-- ae_updates rows). ae_updates is not a financial record, so the Manager-only
-- delete rule (decision #3) does not apply.
--
-- Depends on the public.has_role(...) helper created in migration 024.
-- Idempotent: drops and re-creates the affected policies.

drop policy if exists ae_updates_sel on public.ae_updates;
create policy ae_updates_sel on public.ae_updates
  for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','Design') );

drop policy if exists ae_updates_ins on public.ae_updates;
create policy ae_updates_ins on public.ae_updates
  for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','Design') );

drop policy if exists ae_updates_del on public.ae_updates;
create policy ae_updates_del on public.ae_updates
  for delete to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','Design') );
