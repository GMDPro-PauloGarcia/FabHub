-- ============================================================================
-- Migration 20260928e — offboard Aerwin Del Rosario (Finance)
--
-- Owner decision (Paulo Garcia, 2026-09-28): "Aerwin to be removed completely".
-- mint-session refuses any account whose status is not 'active', so this blocks
-- new logins. Rows Aerwin authored (audit trails, history) are kept as records.
-- A session token already issued stays valid until it expires.
-- trg_protect_user_profile keeps role/status unchanged unless is_mgr(), and a
-- migration has no JWT, so run the update as a Manager (transaction-local claim).
-- Idempotent.
-- ============================================================================

select set_config('request.jwt.claims', '{"username":"paulo","user_role":"Manager"}', true);

update public.user_profiles
   set status = 'inactive'
 where lower(username) = 'aerwin'
   and status is distinct from 'inactive';

-- ── ROLLBACK ──
--   select set_config('request.jwt.claims', '{"username":"paulo","user_role":"Manager"}', true);
--   update public.user_profiles set status = 'active' where lower(username) = 'aerwin';
