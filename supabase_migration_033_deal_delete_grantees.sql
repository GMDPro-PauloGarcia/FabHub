-- ── Migration 033: allow named Sales users to delete deals ───────────────────
-- Business need: duplicate / double-entered deals pile up in the pipeline and
-- only Managers could remove them. Grant DELETE on `deals` to two named Sales
-- users (Jena De Asis / "jena", Don Wyn Celmar / "wyn") so they can clear their
-- own bad entries — WITHOUT opening deletion to the whole Sales role.
--
-- Identity comes from the mint-session JWT (see migration 024): `username` is a
-- claim on the token. We add an app_username() helper mirroring app_role()/
-- app_sub(), then replace only the deals_del policy. Child records cascade at
-- the DB level (deals FKs are ON DELETE CASCADE / SET NULL), so no child-table
-- grants are needed. This must stay in sync with DEAL_DELETE_USERS in src/App.jsx.
--
-- DEPENDS ON migration 024 (defines is_mgr()/has_role() and the per-role
-- deals_del policy). Apply 024 first. NOTE: as of this writing the production
-- project still runs the legacy permissive `fabhub_app_access` (USING true)
-- policy — 024 was not applied there — so the effective gate for who may delete
-- a deal is the CLIENT allow-list in src/App.jsx. This migration only becomes
-- meaningful once the strict RLS model (024) is in place.

create or replace function public.app_username() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'username','') $fn$;
grant execute on function public.app_username() to authenticated, anon;

-- Replace the Manager-only delete policy on deals with Manager + named grantees.
drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn') );
