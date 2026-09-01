-- Migration 056: tools / equipment borrow-return register (Warehouse module)
-- App-written rows use a client-generated uuid PK so sbUpsert(..., 'id') works.
-- RLS uses the project's role-aware helpers (has_role / is_user, migration 037),
-- mirroring inventory_items / stock_movements. Applied to the live DB via MCP.

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

drop policy if exists tools_sel on public.tools;
create policy tools_sel on public.tools
  for select to authenticated
  using (has_role('Manager','Finance','FinanceAssistant','Procurement','Warehouse'));

drop policy if exists tools_ins on public.tools;
create policy tools_ins on public.tools
  for insert to authenticated
  with check (has_role('Manager','Warehouse'));

drop policy if exists tools_upd on public.tools;
create policy tools_upd on public.tools
  for update to authenticated
  using (has_role('Manager','Warehouse'))
  with check (has_role('Manager','Warehouse'));

drop policy if exists tools_del on public.tools;
create policy tools_del on public.tools
  for delete to authenticated
  using (has_role('Manager','Warehouse'));
