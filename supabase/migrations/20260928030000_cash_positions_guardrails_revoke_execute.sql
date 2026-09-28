-- ============================================================================
-- Migration 20260928b — lock down the cash-position trigger functions
--
-- Follow-up to 20260928000000_cash_positions_guardrails.sql. Supabase's security
-- advisor flagged public.audit_cash_position_change() (SECURITY DEFINER) as
-- callable over /rest/v1/rpc by anon/authenticated. Both functions are trigger-
-- only, so revoke EXECUTE from the API roles, as migration 066b did for others.
-- Triggers keep firing: EXECUTE is checked at CREATE TRIGGER, not on each fire
-- (verified on prod in a rolled-back transaction: history row written,
-- updated_at bumped, far-future insert still rejected).
--
-- Already applied to production on 2026-09-28 (recorded as
-- 20260928022105_cash_positions_guardrails + ..._revoke_execute). Idempotent.
-- ============================================================================

revoke execute on function public.audit_cash_position_change() from public, anon, authenticated;
revoke execute on function public.cash_positions_guard()       from public, anon, authenticated;

-- ── ROLLBACK ──
--   grant execute on function public.audit_cash_position_change() to anon, authenticated;
--   grant execute on function public.cash_positions_guard()       to anon, authenticated;
