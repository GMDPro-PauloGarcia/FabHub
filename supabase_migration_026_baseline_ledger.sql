-- ── Migration 026: record a schema BASELINE in the migration ledger ──────────
-- Why: this project's base schema (see supabase_schema.sql) was created by hand
-- in the SQL editor, so it was never captured as a tracked migration. Supabase
-- branch previews build a FRESH, empty database and replay ONLY the recorded
-- migration history — which began at the July incremental migrations. With no
-- baseline, the first migration that touched an existing table (e.g.
-- `revoke_password_hash_select` on public.user_profiles) failed with
-- `relation "public.user_profiles" does not exist`, so every branch-preview /
-- "Supabase Preview" CI check errored.
--
-- Fix: record a baseline (version 00000000000000, so it sorts first) that
-- rebuilds the pre-existing schema — sequences, all public tables, and all
-- public functions — from the live catalog, BEFORE the incremental migrations
-- run. It was applied to the production project's ledger via the Supabase API
-- and verified green on a throwaway preview branch (41 tables, full history
-- replayed cleanly). This file documents that operation and reproduces it
-- idempotently for any project that needs the same repair.
--
-- Safe to run anywhere: it only writes a ledger row (it does NOT re-run the
-- schema), and only if that baseline row is not already present.

do $$
declare seqs text; tbls text; fns text; full_sql text;
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version='00000000000000') then
    return; -- baseline already recorded
  end if;

  select coalesce(string_agg('CREATE SEQUENCE IF NOT EXISTS public.'||quote_ident(c.relname)||';', E'\n' order by c.relname),'')
    into seqs from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='S';

  select string_agg(stmt, E'\n' order by relname) into tbls from (
    select c.relname,
      'CREATE TABLE IF NOT EXISTS public.'||quote_ident(c.relname)||' ('||
      string_agg(quote_ident(a.attname)||' '||pg_catalog.format_type(a.atttypid,a.atttypmod), ', ' order by a.attnum)||');' as stmt
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind='r' group by c.relname
  ) t;

  select coalesce(string_agg(pg_get_functiondef(p.oid)||';', E'\n'),'') into fns
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e'); -- skip extension-owned

  -- check_function_bodies off so function creation is order-independent on replay.
  full_sql := 'SET LOCAL check_function_bodies=off;'||E'\n'||seqs||E'\n'||tbls||E'\n'||fns;

  insert into supabase_migrations.schema_migrations(version,name,statements)
  values ('00000000000000','baseline_schema', array[full_sql]);
end $$;
