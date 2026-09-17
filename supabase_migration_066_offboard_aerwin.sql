-- ── Migration 066: Offboard Aerwin Del Rosario (effective Sep 30, 2026) ──────
-- DO NOT APPLY BEFORE Aerwin's last day (2026-09-30). Prepared in advance so the
-- offboarding is one step on the day, not a scramble.
--
-- Deactivates the account rather than merely dropping the Finance role: the exit
-- risk is a former employee retaining ANY working login to the finance system
-- (payable approval, cash positions, billing, exports), not just the approval
-- power. Setting status='inactive' stops verify_login from minting a token for
-- this user (see migration 017/058 notes), so the account can no longer sign in.
--
-- NOTE — this is only the DB half. To fully close the offboarding you must ALSO,
-- on the same day, flip Aerwin's DEFAULT_USERS entry in src/App.jsx (u16) to
-- status:"inactive" and deploy, so the local fallback path can't log him in when
-- Supabase is unreachable. Do NOT make that App.jsx change early — it would lock
-- him out before his last day.
--
-- This does NOT touch Mark's payable-approval grant (migration 065); that is an
-- independent decision. If Mark's coverage was only for the transition overlap,
-- revoke it separately.
--
-- Idempotent — only flips Aerwin's row, and only while he is still active.

update public.user_profiles
   set status = 'inactive'
 where lower(username) = 'aerwin'
   and status = 'active';

select 'Migration 066 applied — Aerwin Del Rosario deactivated' as status;

-- ── ROLLBACK (reinstate, e.g. if the exit date slips) ───────────────────────
--   update public.user_profiles set status='active'
--    where lower(username)='aerwin' and status='inactive';
