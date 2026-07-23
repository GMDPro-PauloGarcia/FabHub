-- ── Migration 027: client_errors — production crash telemetry ────────────────
-- Records render crashes caught by the app's React error boundaries (see
-- src/index.js and the ErrorBoundary / ViewErrorBoundary in src/App.jsx) so a
-- crash in the field is visible here instead of depending on a user to
-- screenshot the "Something went wrong" screen and forward it.
--
-- The client writer (logClientError in src/supabaseClient.js) is fail-safe: it
-- never throws, never enters the offline sync queue, and silently no-ops if
-- this table is absent — so the app is unaffected whether or not this migration
-- has been applied. Applying it simply starts capturing the reports.
--
-- Append-only: any logged-in user may INSERT their own crash; only Manager may
-- read. No UPDATE/DELETE policy = nobody can rewrite or purge history from the
-- app (retention is handled separately, see supabase_retention.sql).

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

-- INSERT: any authenticated user (relies on public.is_user() from migration 024).
drop policy if exists client_errors_ins on public.client_errors;
create policy client_errors_ins on public.client_errors
  for insert to authenticated with check (public.is_user());

-- SELECT: Manager only (relies on public.is_mgr() from migration 024).
drop policy if exists client_errors_sel on public.client_errors;
create policy client_errors_sel on public.client_errors
  for select to authenticated using (public.is_mgr());

-- No UPDATE or DELETE policy is defined, so with RLS enabled both are denied to
-- all app roles — the table is append-only from the application's point of view.
