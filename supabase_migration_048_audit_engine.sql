-- ============================================================================
-- FabHub Migration 048 — Audit engine (Policy §5)
-- Run in Supabase SQL Editor (safe to re-run).
--
-- The Audit Policy issues findings that the respondent has three (3) days to
-- answer, after which they are referred to HR & Admin. This adds the
-- audit_findings table that records each finding, its 3-day reply window, the
-- response, and any HR referral / KPI impact.
--
-- (The recurring audit calendar from §7 — twice-monthly warehouse, weekly petty
-- cash, monthly office supplies / revolving funds / inventory accuracy — is
-- generated on the client from a static schedule in core.js; it needs no table.)
-- ============================================================================

create table if not exists public.audit_findings (
  id           uuid primary key default gen_random_uuid(),
  area         text,
  finding      text,
  respondent   text,
  severity     text default 'Medium',
  status       text default 'Open',
  issued_by    text,
  issued_at    date,
  reply_due    date,
  response     text,
  responded_at date,
  hr_referral  boolean not null default false,
  kpi_impact   text,
  resolved_at  date,
  created_at   timestamptz default now()
);

-- Match the app's current allow-all RLS convention (role-based RLS is a separate
-- planned rollout; see docs/ACCESS_MATRIX.md).
alter table public.audit_findings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='audit_findings' and policyname='fabhub_app_access') then
    create policy fabhub_app_access on public.audit_findings for all using (true) with check (true);
  end if;
end $$;

-- Live updates so a finding issued on one device appears on others.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='audit_findings') then
    alter publication supabase_realtime add table public.audit_findings;
  end if;
end $$;

select 'Migration 048 applied — audit_findings table created' as status;
