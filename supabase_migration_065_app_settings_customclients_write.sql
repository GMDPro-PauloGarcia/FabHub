-- ── Migration 065: let deal authors persist the shared client directory ──────
-- Bug ("Sales team's account looks broken — red 'server rejected a change' +
-- 'row-level security policy for table app_settings' banner when saving a deal"):
-- when a Sales / QS / Design / SalesOpsAdmin user saves a deal whose client is
-- not yet in the master list, saveDeal() also upserts the new name into the
-- shared client directory, stored as one JSON blob in app_settings under
-- key='customclients' (see src/App.jsx: sbUpsert('app_settings',{key:'customclients',...})).
--
-- But migration 037 gated app_settings INSERT/UPDATE to Manager/Finance/
-- Accounting/FinanceAssistant only (app_settings was originally just Finance
-- blobs — e-vouchers, cash position, bot settings). customclients, like
-- standalone_boqs before it (migration 050), was later shoehorned into the same
-- table without widening the policy. So the deal itself saves (deals UPDATE
-- allows Sales), but the client-directory upsert is rejected by RLS: the new
-- client only lands in that user's localStorage, never reaches the server, and
-- nobody else — nor that user on another device — ever sees it. The rejection
-- also surfaces as the alarming red "your account may not have permission /
-- session expired" banner, making a Sales user think their account is broken.
--
-- Fix: mirror migration 050. Add INSERT/UPDATE policies on app_settings scoped
-- to key = 'customclients' for the roles that can create a deal (and therefore a
-- new client) in the app: Manager, Sales, SalesOpsAdmin, QS, Design. Policies
-- for the same command are OR-combined, so the existing Finance/Manager policy
-- still governs every OTHER app_settings key (e-vouchers, cash position, bot
-- settings, chart_of_accounts stay locked down). Widening this one blob is safe:
-- the client directory is a plain shared name list, and the client already
-- writes the full merged list on every upsert.
--
-- Uses the public.has_role() helper defined in migration 037.

alter table public.app_settings enable row level security;

-- INSERT: first author to create the customclients row (no row exists yet).
drop policy if exists app_settings_customclients_ins on public.app_settings;
create policy app_settings_customclients_ins on public.app_settings
  for insert to authenticated
  with check (
    key = 'customclients'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  );

-- UPDATE: every subsequent save upserts onto the existing customclients row.
-- Both USING (old row) and WITH CHECK (new row) are pinned to the same key so
-- these roles can only ever touch the customclients blob, nothing else.
drop policy if exists app_settings_customclients_upd on public.app_settings;
create policy app_settings_customclients_upd on public.app_settings
  for update to authenticated
  using (
    key = 'customclients'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  )
  with check (
    key = 'customclients'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  );

select 'Migration 065 applied — deal authors can persist customclients' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop policy if exists app_settings_customclients_ins on public.app_settings;
--   drop policy if exists app_settings_customclients_upd on public.app_settings;
