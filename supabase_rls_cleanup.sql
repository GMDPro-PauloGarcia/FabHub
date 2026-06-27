-- ============================================================================
-- FabHub — consolidate RLS policies to ONE clean policy per table
-- ============================================================================
-- Multiple iterations stacked redundant permissive policies (anon_all,
-- anon_full_access, authenticated_all, fabhub_app_access, fabhub_full_access,
-- old auth.uid() ones). Same access, but messy. This recreates the clean
-- policy FIRST then drops the others (no access gap). Run in SQL Editor.
-- ============================================================================
do $$
declare t text; pol record;
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('drop policy if exists fabhub_app_access on public.%I', t);
    execute format('create policy fabhub_app_access on public.%I for all to anon, authenticated using (true) with check (true)', t);
    for pol in
      select policyname from pg_policies
      where schemaname='public' and tablename=t and policyname <> 'fabhub_app_access'
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

select tablename, count(*) as policy_count, string_agg(policyname, ', ') as policies
from pg_policies where schemaname='public'
group by tablename order by tablename;
