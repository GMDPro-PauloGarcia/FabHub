-- ── Migration 058: Provision Jerwin Limon (Finance Assistant) ───────────────
-- New team member:
--   • Jerwin Limon — Finance Assistant (FinanceAssistant role): tasked with
--     tabulating billings and receivables alongside Mark Acejo. The existing
--     FinanceAssistant role exposes the Accounting and Finance modals, including
--     Billing (billing_milestones / billing_payments — see writeAllow and the
--     RLS_MATRIX in the app), so he is provisioned onto that role.
--
-- Like the rest of the team (mirroring migration 031), this account must exist
-- in user_profiles so the mint-session Edge Function (verify_login) can issue a
-- role-bearing token; otherwise login falls back to the local DEFAULT_USERS path
-- with no token and the session is dropped on reload.
--
-- Default password GMD2026! hashed with the sha256 scheme used by verify_login
-- (migration 017). Idempotent — skips any username already present.

insert into public.user_profiles (id, name, username, role, title, status, password_hash, created_at)
select v.id, v.name, v.username, v.role, v.title, 'active',
       'sha256:' || encode(digest('GMD2026!' || v.username || ':gmd-fabhub-2026', 'sha256'), 'hex'),
       now()
from (values
  ('u29','Jerwin Limon','jerwin','FinanceAssistant','Finance Assistant')
) as v(id, name, username, role, title)
where not exists (
  select 1 from public.user_profiles u where lower(u.username) = lower(v.username)
);
