-- ── Migration 052: align RLS with what Ops actually does day-to-day ───────────
-- The FabHub UI let these actions be attempted, but migration 037 gated them to
-- Managers only, so a non-Manager's change was accepted locally and then silently
-- reverted on the next server resync (the write hit RLS and was dropped). The app
-- now shows a "your role can't do this" dialog at these points; this migration is
-- the other half of the decision — GRANTING the access so the intended users can
-- actually do the work. Each grant below is a deliberate scope choice; adjust the
-- role lists if your policy differs.
--
-- Covers audit findings #1, #2, #3. (#4 was a client-only staleness, already
-- fixed. #5 project_budgets and #6 Audit/HRAdmin are handled separately — see the
-- notes at the bottom and migration 053.)
--
-- Follows the migration-049 override pattern: drop the specific generated policy
-- and recreate it. Idempotent — safe to re-run.

alter table public.addenda    enable row level security;
alter table public.daily_logs enable row level security;
alter table public.checklists enable row level security;

-- New helper: the signed-in user's DISPLAY NAME, from the JWT `name` claim minted
-- by the mint-session Edge Function. Needed because daily_logs.logged_by stores
-- the person's name (e.g. "David Melendez"), not their username/id, so an
-- author-scoped rule can't use app_username()/app_sub().
create or replace function public.app_name() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'name','') $fn$;
grant execute on function public.app_name() to authenticated, anon;

-- ── #1 · Addenda (scope changes): let Project Movers advance the status ───────
-- The Scope Changes page is shown to Manager and Operations/ProjectMover, and the
-- workflow (Discovered → Sales Notified → …) is Ops-driven — but UPDATE was
-- Manager-only. Grant it to ProjectMover as well. (Add other roles here if they
-- should also be able to move an addendum along.)
drop policy if exists addenda_upd on public.addenda;
create policy addenda_upd on public.addenda
  for update to authenticated
  using ( public.has_role('Manager','ProjectMover') )
  with check ( public.has_role('Manager','ProjectMover') );

-- ── #2 · Daily site logs: let the author delete their own log ─────────────────
-- Logging is open to Ops; DELETE was Manager-only, so a coordinator couldn't
-- remove a log they created by mistake. Allow a Manager OR the original author
-- (matched by the name stored in logged_by) to delete. Other people's logs stay
-- protected.
drop policy if exists daily_logs_del on public.daily_logs;
create policy daily_logs_del on public.daily_logs
  for delete to authenticated
  using ( public.is_mgr() or logged_by = public.app_name() );

-- ── #3 · Calendar / checklist items: let Ops coordinators delete ──────────────
-- Migration 049 opened checklists INSERT/UPDATE to every signed-in user because
-- the Construction Calendar is a shared board, but left DELETE Manager-only — so
-- coordinators could add and edit calendar activities but not remove them. Grant
-- DELETE to Manager + ProjectMover (the coordinators who run the board). If you
-- want deletion as open as create/edit, replace the predicate with
-- public.is_user().
drop policy if exists checklists_del on public.checklists;
create policy checklists_del on public.checklists
  for delete to authenticated
  using ( public.has_role('Manager','ProjectMover') );

select 'Migration 052 applied — addenda/daily_logs/checklists write grants aligned' as status;

-- ── Not changed here, on purpose ──────────────────────────────────────────────
-- #5 project_budgets: Finance can already UPDATE a budget per RLS, but the app
--    saves via an UPSERT, which Postgres also checks against the INSERT policy
--    (Manager/QS only) — so the write is refused before the update path is
--    reached. Fixing this cleanly is a CLIENT change (use a targeted column
--    UPDATE instead of an upsert for edits), not an RLS grant: widening INSERT
--    would also let Finance CREATE budget rows, which may not be intended. Left
--    for a separate decision.
