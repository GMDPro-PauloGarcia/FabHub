-- ── Migration 050: let BOQ authors persist standalone BOQs ──────────────────
-- Bug ("Jena/Pao/Wyn built a BOQ but their BOQs are lost when someone else opens
-- them"): standalone BOQs (the ones not tied to a pipeline deal) are all stored
-- as ONE JSON blob in app_settings under key='standalone_boqs' (see
-- _pushStandaloneBoqs / saveStandaloneBoq in src/App.jsx, which sbUpsert the
-- 'standalone_boqs' row on conflict 'key'). But migration 037 gated app_settings
-- INSERT/UPDATE to Manager/Finance/FinanceAssistant only — app_settings was
-- originally just e-vouchers / cash position / bot settings (Finance blobs), and
-- standalone_boqs + chart_of_accounts were later shoehorned into the same table
-- without widening the policy.
--
-- So when a Sales / QS / SalesOpsAdmin / Design user saves a standalone BOQ, the
-- upsert is silently rejected by RLS: sbUpsert logs the error and returns false,
-- the BOQ only ever lands in that user's own localStorage/IndexedDB, and it
-- never reaches the server. Everyone else — and that same user on another
-- device — never sees it. It looks "lost". (Deal-linked BOQs are unaffected:
-- they live in deals.boq_data, and deals UPDATE already allows Sales/QS.)
--
-- Fix: add INSERT/UPDATE policies on app_settings scoped to
-- key = 'standalone_boqs' for the roles that can build a BOQ in the app
-- (Manager, Sales, SalesOpsAdmin, QS, Design — matching the BOQ nav item and the
-- 🧮 BOQ buttons in src/App.jsx). Policies for the same command are OR-combined,
-- so the existing Finance/Manager policy still governs every OTHER app_settings
-- key (e-vouchers, cash position, bot settings, chart_of_accounts stay locked
-- down). The blob is only ever safe to widen because the client already merges
-- server + local per BOQ id before every write (mergeLocalOnly in
-- _pushStandaloneBoqs), so concurrent authors can't clobber each other.
--
-- Uses the public.has_role() helper defined in migration 037.

alter table public.app_settings enable row level security;

-- INSERT: first author to create the standalone_boqs row (no row exists yet).
drop policy if exists app_settings_boq_ins on public.app_settings;
create policy app_settings_boq_ins on public.app_settings
  for insert to authenticated
  with check (
    key = 'standalone_boqs'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  );

-- UPDATE: every subsequent save upserts onto the existing standalone_boqs row.
-- Both USING (old row) and WITH CHECK (new row) are pinned to the same key so
-- these roles can only ever touch the standalone_boqs blob, nothing else.
drop policy if exists app_settings_boq_upd on public.app_settings;
create policy app_settings_boq_upd on public.app_settings
  for update to authenticated
  using (
    key = 'standalone_boqs'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  )
  with check (
    key = 'standalone_boqs'
    and public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design')
  );

select 'Migration 050 applied — BOQ authors can persist standalone_boqs' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop policy if exists app_settings_boq_ins on public.app_settings;
--   drop policy if exists app_settings_boq_upd on public.app_settings;
