-- ── Migration 054: let Sales approve change orders too ───────────────────────
-- Business rule (Paulo, Manager): Sales, Operations and Management all speak to
-- clients directly, so all three can advance a change order's status — including
-- Approved, which rolls the CO into the contract and creates its billing claim.
--
-- Migration 052 granted addenda UPDATE to Manager + ProjectMover only. Operations
-- users already map to ProjectMover server-side (mint-session Edge Function), so
-- they were covered; Sales was not. This widens the UPDATE policy to add Sales
-- and SalesOpsAdmin so the "Approve" control now shown to Sales on the Scope
-- Changes page actually persists instead of being reverted on the next resync.
--
-- Follows the migration-052 override pattern: drop the specific policy and
-- recreate it. Idempotent — safe to re-run.

alter table public.addenda enable row level security;

drop policy if exists addenda_upd on public.addenda;
create policy addenda_upd on public.addenda
  for update to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','SalesOpsAdmin') )
  with check ( public.has_role('Manager','ProjectMover','Sales','SalesOpsAdmin') );

select 'Migration 054 applied — addenda UPDATE granted to Sales/SalesOpsAdmin (approve change orders)' as status;
