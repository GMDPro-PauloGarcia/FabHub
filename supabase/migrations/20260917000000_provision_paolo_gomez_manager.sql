-- ── Provision Paolo Gomez (paolo) as Manager ────────────────────────────────
-- Paolo Gomez ("paolo", Sales Manager) was carried as role='Manager' in the
-- app's frontend DEFAULT_USERS (src/App.jsx) but was never provisioned into
-- user_profiles. Two consequences of that gap:
--   1. mint-session (verify_login) can only issue a role-bearing token for
--      accounts that exist in user_profiles; missing there, his login falls back
--      to the local DEFAULT_USERS path with no token and the session is dropped
--      on reload (same failure mode noted in the loose migrations 030/031/058).
--   2. Every DB policy still treated him as Sales with a single named delete
--      exception (loose migrations 034/037,
--      `app_username() in ('jena','wyn','paolo')`), NOT as a Manager.
--
-- Decision (Paulo, 2026-09-17): grant Paolo Gomez full Manager access — the same
-- role the owner holds (minus the owner-only 'paulo'/named-grantee extras). This
-- is a WRITE grant, not view-only: Manager is VCEDA across the app (delete deals
-- and financial records, mutate/approve user accounts, void check vouchers, view
-- all cash/inflows). The role flows through mint-session into the JWT `user_role`
-- claim that is_mgr()/RLS read, so setting user_profiles.role is the complete
-- lever — no policy edits are required.
--
-- Idempotent, and handles both live states: inserts the row if missing, and
-- promotes an existing lower-role row to Manager. Default password GMD2026!
-- hashed with the sha256 scheme used by verify_login (loose migration 017) is
-- applied only on insert, so an existing password is never overwritten.
--
-- The named deal-delete grants (loose migrations 034/037) are left untouched:
-- they become redundant for 'paolo' (Manager passes is_mgr()) but still carry
-- Jena/Wyn's grants. The frontend DEFAULT_USERS already lists him as Manager, so
-- no app change is needed; this makes the DB the source of truth and keeps the
-- two in sync.

-- 1) Insert if he does not yet exist.
insert into public.user_profiles (id, name, username, role, title, status, password_hash, created_at)
select v.id, v.name, v.username, v.role, v.title, 'active',
       'sha256:' || encode(digest('GMD2026!' || v.username || ':gmd-fabhub-2026', 'sha256'), 'hex'),
       now()
from (values
  ('u12','Paolo Gomez','paolo','Manager','Sales Manager')
) as v(id, name, username, role, title)
where not exists (
  select 1 from public.user_profiles u where lower(u.username) = lower(v.username)
);

-- 2) If he already exists at a lower role, promote him to Manager.
update public.user_profiles
   set role = 'Manager'
 where lower(username) = 'paolo'
   and role is distinct from 'Manager';
