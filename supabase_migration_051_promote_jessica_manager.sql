-- ── Migration 051: add Jessica Castro to the deal-delete grantees ────────────
-- Follow-up to migrations 033/034. Jessica Castro ("jessica", SalesOpsAdmin —
-- "Jeca") needs to clear duplicate / double-entered deals from the Sales
-- Pipeline herself, the same way Managers and the named Sales grantees
-- (jena / wyn / paolo) already can — WITHOUT opening deletion to a whole role.
--
-- Billing (edit VATable / vat_treatment) and Calendar (create events) already
-- work for SalesOpsAdmin: migration 036 put SalesOpsAdmin in the billing
-- INSERT/UPDATE policies, and migration 049 opened checklists (the calendar's
-- backing table) INSERT/UPDATE to any signed-in user (is_user()). Only deal
-- deletion was still Manager + named-Sales only, so this migration adds her.
--
-- Must stay in sync with DEAL_DELETE_USERS in src/App.jsx.
-- DEPENDS ON migration 033/034 (which depend on 024, defining is_mgr() and
-- app_username()). Child records cascade at the DB level (deals FKs are
-- ON DELETE CASCADE / SET NULL), so no child-table grants are needed.

drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo','jessica') );
