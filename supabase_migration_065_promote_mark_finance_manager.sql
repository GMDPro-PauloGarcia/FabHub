-- ── Migration 065: Promote Mark Acejo to Finance Manager (Finance role) ─────
-- Change (Paulo): Mark Acejo moves from FinanceAssistant to the Finance role —
-- the role the app surfaces as "Finance Manager" (see App.jsx: "the Finance
-- Manager (Finance role) may approve a payable"). This grants him the full
-- Finance permission set in the RLS_MATRIX, including payable approval authority
-- gated in migration 063 (only Manager / Finance may change approval_status).
--
-- SEGREGATION-OF-DUTIES NOTE: this makes Mark a second payable approver
-- alongside Aerwin Del Rosario. FinanceAssistants (e.g. Jerwin) enter payables
-- but cannot clear them; a Finance-role Mark can now approve payables entered by
-- the finance team. Self-approval remains blocked in-app for non-Managers.
--
-- Mirrors migration 031 (which provisioned Mark as FinanceAssistant) and keeps
-- user_profiles in sync with the App.jsx DEFAULT_USERS fallback (u27), so the
-- mint-session Edge Function (verify_login) issues a Finance-bearing token.
-- Idempotent — only touches Mark's row and only when he is still FinanceAssistant.

update public.user_profiles
   set role  = 'Finance',
       title = 'Finance Manager'
 where lower(username) = 'mark'
   and role = 'FinanceAssistant';

select 'Migration 065 applied — Mark Acejo promoted to Finance (Finance Manager)' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   update public.user_profiles
--      set role='FinanceAssistant', title='Finance Assistant'
--    where lower(username)='mark' and role='Finance';
