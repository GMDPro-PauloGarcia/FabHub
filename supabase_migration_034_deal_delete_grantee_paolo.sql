-- ── Migration 034: add Paolo Gomez to the deal-delete grantees ───────────────
-- Follow-up to migration 033. Paolo Gomez ("paolo", Sales Director) hit the same
-- problem Jena and Wyn had — duplicate / double-entered deals he couldn't clear
-- himself ("can't sync"). Add him to the named delete allow-list so his account
-- behaves like theirs, WITHOUT opening deletion to the whole Sales role.
--
-- Must stay in sync with DEAL_DELETE_USERS in src/App.jsx.
-- DEPENDS ON migration 033 (which depends on 024). See 033 for the note that
-- production may still run the legacy permissive policy, in which case the
-- effective gate is the CLIENT allow-list in src/App.jsx.

drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo') );
