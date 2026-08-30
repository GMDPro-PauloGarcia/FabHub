-- Migration 056: tools / equipment borrow-return register (Warehouse module)
-- App-written rows use a client-generated uuid PK so sbUpsert(..., 'id') works.
-- RLS mirrors this project's live permissive gate (see migration 027's note):
-- a single fabhub_app_access policy FOR ALL TO authenticated, anon — the
-- role-aware has_role()/is_user() helpers are not relied on here.

create table if not exists public.tools (
  id              uuid        primary key,
  name            text        not null default '',
  borrower        text        not null default '',
  borrowed_date   date,
  expected_return date,
  actual_return   date,
  notes           text        not null default '',
  created_by      text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tools_created_at_idx on public.tools (created_at desc);

alter table public.tools enable row level security;

drop policy if exists fabhub_app_access on public.tools;
create policy fabhub_app_access on public.tools
  for all to authenticated, anon using (true) with check (true);
