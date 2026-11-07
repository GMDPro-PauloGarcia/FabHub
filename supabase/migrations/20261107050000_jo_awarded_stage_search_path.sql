-- Security advisor: jo_awarded_stage(text) had a role-mutable search_path.
-- Pin it like every other FabHub function. No behaviour change. Idempotent.
alter function public.jo_awarded_stage(text) set search_path = pg_catalog, public;

-- ROLLBACK
--   alter function public.jo_awarded_stage(text) reset search_path;
