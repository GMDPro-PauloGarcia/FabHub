-- ── Migration 071: add Jessica Castro to the deal-delete grantees ────────────
-- Follow-up to migrations 033/034. Jessica Castro ("jessica", SalesOpsAdmin)
-- needs to clear duplicate / mistaken deals herself.
--
-- NOTE: this policy was ALREADY applied to production by hand (pg_policies on
-- 2026-09-25 showed 'jessica' in deals_del) with no migration file, while the
-- client allow-list in src/App.jsx still lacked her — so the server allowed the
-- delete but the UI never offered it. This file records that state so a fresh
-- environment matches production. Idempotent; safe to re-run.
--
-- Must stay in sync with DEAL_DELETE_USERS in src/App.jsx.
-- Managers (is_mgr()) — e.g. Paulo Garcia — can already delete.

drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo','jessica') );

-- ── ROLLBACK ──
--   drop policy if exists deals_del on public.deals;
--   create policy deals_del on public.deals for delete to authenticated
--     using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo') );
