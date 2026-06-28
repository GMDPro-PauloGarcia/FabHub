-- ============================================================================
-- FabHub — audit_log table (soft-delete trail for financial records)
-- ============================================================================
-- Before a financial record (expense, check voucher, payable, loan, loan
-- payment, cash inflow, billing collection) is deleted, the app snapshots the
-- row here together with who deleted it, when, and why. Nothing financial is
-- ever silently lost, and a record can be restored from its snapshot.
-- Run this once in the Supabase SQL Editor.
-- ============================================================================
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  table_name    text not null,
  record_id     text,
  action        text not null default 'delete',  -- delete | restore
  snapshot      jsonb,                            -- the deleted row, in its Supabase shape
  reason        text,
  performed_by  text,
  performed_at  timestamptz default now(),
  created_at    timestamptz default now()
);

create index if not exists audit_log_performed_at_idx on public.audit_log (performed_at desc);
create index if not exists audit_log_table_idx        on public.audit_log (table_name);

-- Same open RLS posture as the rest of the app (anon + authenticated, app-level auth).
alter table public.audit_log enable row level security;
grant select, insert, update, delete on public.audit_log to anon, authenticated;
drop policy if exists fabhub_app_access on public.audit_log;
create policy fabhub_app_access on public.audit_log
  for all to anon, authenticated using (true) with check (true);

-- Realtime so the Audit Trail updates live across devices (ignore error if already added).
do $$
begin
  alter publication supabase_realtime add table public.audit_log;
exception when duplicate_object then null;
end $$;
