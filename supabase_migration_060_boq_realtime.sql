-- ── Migration 060: enable Realtime for standalone_boqs ──────────────────────
-- The BOQ home (src/App.jsx BOQHomeView) needed a hard refresh before a newly
-- created or edited BOQ would show up. Root cause: standalone_boqs (added in
-- migration 051) was never added to the `supabase_realtime` publication, and the
-- app only fetched it once at boot. The client now opens a realtime subscription
-- ('standalone-boqs-rt' in src/App.jsx), but realtime only fires for tables in
-- the publication — so this migration adds standalone_boqs to it (idempotent).
-- Run in: Supabase Dashboard -> SQL Editor.

do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='standalone_boqs') then
    begin
      alter publication supabase_realtime add table public.standalone_boqs;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

select 'Migration 060 applied — standalone_boqs added to supabase_realtime publication' as status;
