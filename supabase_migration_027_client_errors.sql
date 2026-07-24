-- ── Migration 027: client_errors — production crash telemetry ────────────────
-- Records render crashes caught by the app's React error boundaries (see
-- src/index.js and the ErrorBoundary / ViewErrorBoundary in src/App.jsx) so a
-- crash in the field is visible instead of depending on a user to screenshot
-- the "Something went wrong" screen and forward it.
--
-- The client writer (logClientError in src/supabaseClient.js) is fail-safe: it
-- never throws, never enters the offline sync queue, dedupes repeats, and
-- silently no-ops if this table is absent — so the app is unaffected whether or
-- not this migration has been applied. Applying it simply starts capturing.
--
-- RLS NOTE (important): this project's LIVE database gates every table with a
-- single permissive policy `fabhub_app_access` (FOR ALL TO authenticated, anon
-- USING (true) WITH CHECK (true)). The role-aware helper functions that
-- migration 024 defines — public.is_user() / public.is_mgr() — are NOT present
-- in the deployed database (migration 024 was authored but never applied here),
-- so a helper-based policy would fail to create. This table therefore matches
-- the convention that is actually deployed. Crash reports are read out-of-band
-- (Supabase SQL editor / dashboard as the service role), not from the app, so
-- no app-facing SELECT distinction is needed. Applied to project
-- gfgneirzkgzarllzztie (fabhub-gmd) on 2026-07-23.

create table if not exists public.client_errors (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  message         text,
  stack           text,
  component_stack text,
  view            text,
  url             text,
  user_agent      text
);

-- Fast "most recent crashes" lookups.
create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Match the live app-wide convention (see RLS NOTE above).
drop policy if exists fabhub_app_access on public.client_errors;
create policy fabhub_app_access on public.client_errors
  for all to authenticated, anon using (true) with check (true);
