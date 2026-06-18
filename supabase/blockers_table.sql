-- Run this in Supabase SQL Editor to create the project_blockers table
-- Dashboard → SQL Editor → New query → paste → Run

create table if not exists project_blockers (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references deals(id) on delete cascade,
  title        text not null,
  dept         text not null default 'Operations',
  detail       text,
  flagged_by   text,
  status       text not null default 'Open',   -- 'Open' | 'Resolved'
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- Enable RLS (same policy pattern as other tables)
alter table project_blockers enable row level security;
create policy "Allow all" on project_blockers for all using (true) with check (true);

-- Index for fast lookup per deal
create index if not exists idx_blockers_deal on project_blockers(deal_id);
create index if not exists idx_blockers_status on project_blockers(status);
