-- ============================================================================
-- FabHub — collision-free document numbers (PO / CV / INV / JO)
-- ============================================================================
-- Numbers were generated client-side as (count + 1), so two devices creating a
-- PO/CV/invoice at the same time produced the SAME number. This adds a single
-- atomic server-side counter per prefix. The app passes the current local max
-- as p_min, so the counter never restarts below existing numbers — no separate
-- back-fill needed. Run this once in the Supabase SQL Editor.
-- ============================================================================
create table if not exists public.doc_counters (
  prefix        text primary key,
  current_value bigint not null default 0,
  updated_at    timestamptz default now()
);

alter table public.doc_counters enable row level security;
grant select, insert, update, delete on public.doc_counters to anon, authenticated;
drop policy if exists fabhub_app_access on public.doc_counters;
create policy fabhub_app_access on public.doc_counters
  for all to anon, authenticated using (true) with check (true);

-- Atomically returns the next number for a prefix. p_min lets the caller pass
-- the highest number it already knows about so a fresh counter never collides
-- with pre-existing documents.  next = greatest(stored, p_min) + 1
create or replace function public.next_doc_number(p_prefix text, p_min bigint default 0)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  insert into public.doc_counters as c (prefix, current_value)
    values (p_prefix, greatest(p_min, 0) + 1)
  on conflict (prefix) do update
    set current_value = greatest(c.current_value, p_min) + 1,
        updated_at = now()
  returning c.current_value into v;
  return v;
end
$$;

grant execute on function public.next_doc_number(text, bigint) to anon, authenticated;
