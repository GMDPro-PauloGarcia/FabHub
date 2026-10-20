-- Let SalesOpsAdmin (Jessica) delete calendar / checklist items.
-- Before: checklists DELETE was Manager + ProjectMover only. The app mirror is
-- PERMISSIONS.checklists.delete in src/core.js — keep the two in sync.
-- `alter policy` (not drop/create) so apply_migration doesn't hang on a DROP.

alter policy checklists_del on public.checklists
  using (public.has_role(variadic array['Manager','ProjectMover','SalesOpsAdmin']));

-- ROLLBACK
-- alter policy checklists_del on public.checklists
--   using (public.has_role(variadic array['Manager','ProjectMover']));
