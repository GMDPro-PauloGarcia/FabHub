-- ── Migration 030: Provision the Design team into user_profiles ──────────────
-- Bug: Design team members (Gab Florita and colleagues) reported they could not
-- see any Design Request Forms. Root cause was NOT the DRF view or RLS — the 8
-- real design_requests rows are fully readable. The Design team accounts shipped
-- only in the app's hardcoded DEFAULT_USERS seed (src/App.jsx) and were never
-- inserted into the Supabase user_profiles table, unlike every other team member.
--
-- Consequence: the mint-session Edge Function (which authenticates against
-- user_profiles via verify_login) could never issue them a role-bearing token.
-- Their login fell back to the local/DEFAULT_USERS path with no token, so:
--   • on every reload the session was dropped (boot restore requires a valid
--     token — see App.jsx: `hasToken = restoreAppToken()`), kicking them to login;
--   • requests ran as anon instead of an authenticated Design user, so they never
--     behaved like a properly signed-in account and could not reliably load the
--     live data (the Design Request Forms among it).
--
-- Fix: provision the Design team into user_profiles so they authenticate
-- server-side and receive a Design-role token, exactly like the rest of the team.
-- Default password GMD2026! hashed with the new sha256 scheme used by
-- verify_login (migration 017). Idempotent — skips any username already present.
--
-- Applied to the live project (fabhub-gmd) via mcp Supabase apply_migration
-- on 2026-07-30; this file documents it for the repo/history.

insert into public.user_profiles (id, name, username, role, title, status, password_hash, created_at)
select v.id, v.name, v.username, 'Design', v.title, 'active',
       'sha256:' || encode(digest('GMD2026!' || v.username || ':gmd-fabhub-2026', 'sha256'), 'hex'),
       now()
from (values
  ('u18','Gab Florita','gab','Designer'),
  ('u19','Miaa Villoria','miaa','Designer'),
  ('u20','Miel Vidallo','miel','Designer'),
  ('u21','Adrian Adriano','adrian','Designer'),
  ('u22','Tisha Leyva','tisha','Designer')
) as v(id, name, username, title)
where not exists (
  select 1 from public.user_profiles u where lower(u.username) = lower(v.username)
);
