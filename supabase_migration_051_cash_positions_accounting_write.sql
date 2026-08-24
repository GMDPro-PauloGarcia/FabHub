-- ── Migration 051: let Accounting persist Daily Cash Positions ───────────────
-- Bug ("Aerwin saves cash positions and the app says ✓ Saved, but nothing
-- persists to the database"): Aerwin is in the Accounting role. saveDayPos in
-- src/App.jsx saves to local storage first (which drives the "✓ Saved" state in
-- DailyCashPosition.jsx) and THEN upserts to Supabase, swallowing any error with
-- .catch(e=>console.error(...)). So a save that the database rejects still looks
-- successful in the UI.
--
-- And the database WAS rejecting Aerwin's writes: migration 037 gated
-- cash_positions INSERT/UPDATE to Manager/Finance/FinanceAssistant only.
-- Migration 044 added the Accounting role to cash_positions — but SELECT only
-- (for the dashboard's Daily Digest cash section). INSERT/UPDATE were never
-- widened, so Accounting could read cash positions but not write them. Every
-- save landed only in Aerwin's own localStorage; it never reached the server,
-- and disappeared on refresh or from any other device/user.
--
-- Fix: extend cash_positions INSERT/UPDATE to include Accounting, matching the
-- SELECT policy set by migration 044. Additive — no role loses access.
--
-- Uses the public.has_role() helper defined in migration 037.

ALTER POLICY cash_positions_ins ON public.cash_positions
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));

ALTER POLICY cash_positions_upd ON public.cash_positions
  USING      (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']))
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));

select 'Migration 051 applied — Accounting can persist cash_positions' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER POLICY cash_positions_ins ON public.cash_positions
--     WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']));
--   ALTER POLICY cash_positions_upd ON public.cash_positions
--     USING      (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']))
--     WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']));
